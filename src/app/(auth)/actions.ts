'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { grantCredits, hasTrialGrant } from '@/services/credits/credit-service';
import { PLAN_CREDITS } from '@/services/credits/credit-costs';
import {
  isMfaChallengeRequired,
  normalizeTotpCode,
  pickVerifiedTotpFactorId,
} from '@/lib/auth/mfa-utils';
import { resolveRequestOrigin } from '@/lib/request-origin';

// Base per i link email Supabase: il dominio su cui l'utente sta navigando
// (legmed/medlav), MAI il fallback localhost in produzione. L'URL deve essere
// nella allow-list Redirect URLs di Supabase, altrimenti viene sostituito col
// Site URL e il token atterra sulla landing senza essere consumato.
async function getAuthRedirectBase(): Promise<string> {
  return resolveRequestOrigin(await headers(), process.env.NEXT_PUBLIC_SITE_URL);
}

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;
  const gdprConsent = formData.get('gdprConsent') as string | null;
  const privacyPolicyVersion = formData.get('privacyPolicyVersion') as string | null;

  if (!email || !password || !fullName) {
    return { error: 'Tutti i campi sono obbligatori' };
  }

  if (gdprConsent !== 'on') {
    return { error: 'Devi accettare i Termini di Servizio e la Privacy Policy per registrarti.' };
  }

  const rateCheck = await checkRateLimit({ key: `signup:${email}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
      emailRedirectTo: `${await getAuthRedirectBase()}/auth/callback`,
    },
  });

  if (error) {
    logger.error('auth', 'Sign up error', { error: error.message, code: error.status });
    if (error.message.includes('already registered')) {
      return { error: 'Questa email è già registrata' };
    }
    if (error.message.includes('rate limit') || error.status === 429) {
      return { error: 'Troppi tentativi di registrazione. Riprova tra qualche minuto.' };
    }
    if (error.message.includes('not authorized') || error.message.includes('not allowed')) {
      return { error: 'La registrazione non è abilitata. Contatta l\'amministratore.' };
    }
    return { error: `Errore durante la registrazione: ${error.message}` };
  }

  // Create profile in profiles table with GDPR consent record
  if (data.user) {
    const now = new Date().toISOString();
    const admin = createAdminClient();
    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
      gdpr_consent_at: now,
      privacy_policy_version: privacyPolicyVersion || '2026-03-11',
      terms_accepted_at: now,
      data_retention_days: 365,
      created_at: now,
      updated_at: now,
    });
    if (profileError) {
      logger.error('auth', `Profile creation failed for user ${data.user.id}: ${profileError.message}`);
      // Rollback: delete the auth user to avoid orphaned account
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: 'Errore durante la creazione del profilo. Riprova.' };
    }

    // Grant trial credits — SOLO se non già ricevuti (ri-registrazione con email
    // non confermata regalava +30 a ogni tentativo). Non bloccare la
    // registrazione se l'accredito fallisce: l'account è valido, i crediti si
    // recuperano (grantCredits ora lancia, quindi lo isoliamo).
    try {
      if (!(await hasTrialGrant(data.user.id))) {
        await grantCredits(data.user.id, PLAN_CREDITS.trial.initialGrant, 'trial_grant');
      }
    } catch (grantErr) {
      logger.error('auth', `Trial grant fallito per ${data.user.id}: ${grantErr instanceof Error ? grantErr.message : 'unknown'}`);
    }
  }

  // If email confirmation is enabled, show verification message instead of redirecting
  if (data.user && !data.session) {
    return { success: true, emailSent: true };
  }

  redirect('/');
}

/**
 * Request password reset email.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Inserisci la tua email' };
  }

  const rateCheck = await checkRateLimit({ key: `reset:${email}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // MUST land on /auth/callback (the only place that exchanges the PKCE
    // code for a session) and only THEN continue to the update form — landing
    // directly on /auth/update-password leaves the user without a session and
    // updateUser fails every time.
    redirectTo: `${await getAuthRedirectBase()}/auth/callback?next=/auth/update-password`,
  });

  if (error) {
    // Don't reveal if email exists or not (security)
    logger.error('auth', 'Password reset error', { error: error.message });
  }

  // Always show success message (prevents email enumeration)
  return { success: true };
}

/**
 * Update password after reset.
 */
export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string;

  if (!password || password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: 'Errore nell\'aggiornamento della password. Riprova.' };
  }

  redirect('/');
}

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Inserisci email e password' };
  }

  // Brute-force: limite PER EMAIL (stretto) + PER IP (audit 2026-07-16). L'IP da
  // x-forwarded-for è spoofabile ma aggiunge una barriera contro il password-
  // spraying su molte email dalla stessa origine.
  const emailCheck = await checkRateLimit({ key: `login:${email.toLowerCase()}`, ...RATE_LIMITS.LOGIN });
  if (!emailCheck.success) {
    return { error: 'Troppi tentativi di accesso. Riprova tra qualche minuto.' };
  }
  const hdrs = await headers();
  const ip = (hdrs.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (ip !== 'unknown') {
    const ipCheck = await checkRateLimit({ key: `login-ip:${ip}`, ...RATE_LIMITS.LOGIN_IP });
    if (!ipCheck.success) {
      return { error: 'Troppi tentativi di accesso da questa rete. Riprova tra qualche minuto.' };
    }
  }

  const supabase = await createClient();

  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'Email o password non corretti' };
    }
    if (error.code === 'email_not_confirmed' || error.message.includes('Email not confirmed')) {
      return { error: 'Devi prima confermare la tua email: controlla la posta in arrivo (anche lo spam) e clicca il link di conferma.' };
    }
    return { error: 'Errore durante il login. Riprova.' };
  }

  // Check if account is deactivated
  if (signInData.user) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('is_active')
      .eq('id', signInData.user.id)
      .single();

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut();
      return { error: 'Il tuo account è stato disattivato.' };
    }
  }

  // MFA (opt-in): if the user has a verified TOTP factor, the password-only
  // session is aal1 and must be upgraded with a code before entering.
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (isMfaChallengeRequired(aalData?.currentLevel ?? null, aalData?.nextLevel ?? null)) {
    return { mfaRequired: true };
  }

  redirect('/');
}

/**
 * Second login step for users with MFA enabled: verify the 6-digit TOTP
 * code and upgrade the session from aal1 to aal2.
 */
export async function verifyMfa(formData: FormData) {
  const rawCode = (formData.get('code') as string | null) ?? '';
  const code = normalizeTotpCode(rawCode);
  if (!code) {
    return { error: 'Inserisci il codice a 6 cifre generato dall\'app di autenticazione' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Sessione scaduta. Esegui di nuovo l\'accesso.' };
  }

  const rateCheck = await checkRateLimit({ key: `mfa:${user.id}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) {
    logger.error('auth', 'MFA listFactors failed at login', { error: factorsError.message });
    return { error: 'Errore durante la verifica. Riprova.' };
  }

  const factorId = pickVerifiedTotpFactorId(factorsData?.all ?? []);
  if (!factorId) {
    return { error: 'Nessuna verifica in due passaggi attiva su questo account.' };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: 'Codice non valido o scaduto. Controlla l\'app e riprova.' };
  }

  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/landing');
}
