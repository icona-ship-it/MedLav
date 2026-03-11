'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

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
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Questa email è già registrata' };
    }
    return { error: 'Errore durante la registrazione. Riprova.' };
  }

  // Create profile in profiles table with GDPR consent record
  if (data.user) {
    const now = new Date().toISOString();
    const admin = createAdminClient();
    await admin.from('profiles').upsert({
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
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/update-password`,
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

  const rateCheck = await checkRateLimit({ key: `auth:${email}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
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

  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/landing');
}
