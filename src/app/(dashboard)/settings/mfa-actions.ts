'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logAccess } from '@/lib/audit';
import { logger } from '@/lib/logger';
import {
  listUnverifiedTotpFactorIds,
  normalizeTotpCode,
} from '@/lib/auth/mfa-utils';

/**
 * Server actions for MFA (TOTP) management in settings.
 *
 * Security notes:
 * - Secret and QR code are returned ONLY to the authenticated owner and
 *   NEVER logged (GDPR/security: treat like a password).
 * - Enroll/unenroll are audit-logged (metadata only, no secrets).
 * - Unenrolling a verified factor requires an aal2 session (enforced by
 *   Supabase Auth itself).
 */

const factorIdSchema = z.string().uuid();

export interface MfaFactorInfo {
  id: string;
  friendlyName: string | null;
  status: 'verified' | 'unverified';
  createdAt: string;
}

export interface MfaEnrollData {
  factorId: string;
  /** Raw SVG of the QR code (render via data:image/svg+xml URI). */
  qrCodeSvg: string;
  /** TOTP secret for manual entry — never log. */
  secret: string;
}

export async function listMfaFactors(): Promise<{ factors?: MfaFactorInfo[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    logger.error('mfa', 'listFactors failed', { error: error.message });
    return { error: 'Impossibile caricare lo stato della verifica in due passaggi. Riprova.' };
  }

  const factors: MfaFactorInfo[] = (data?.all ?? [])
    .filter((f) => f.factor_type === 'totp')
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: f.status === 'verified' ? 'verified' : 'unverified',
      createdAt: f.created_at,
    }));

  return { factors };
}

/**
 * Start TOTP enrollment. Cleans up abandoned unverified factors first
 * (Supabase rejects duplicate friendly names).
 */
export async function enrollMfaFactor(): Promise<{ data?: MfaEnrollData; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const rateCheck = await checkRateLimit({ key: `mfa-enroll:${user.id}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  // Remove leftover unverified TOTP factors from abandoned enrollments
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const staleId of listUnverifiedTotpFactorIds(existing?.all ?? [])) {
    await supabase.auth.mfa.unenroll({ factorId: staleId });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'App di autenticazione',
  });

  if (error || !data) {
    logger.error('mfa', 'enroll failed', { error: error?.message ?? 'no data' });
    return { error: 'Impossibile avviare l\'attivazione. Riprova tra qualche istante.' };
  }

  return {
    data: {
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
    },
  };
}

/**
 * Complete TOTP enrollment by verifying the first code from the
 * authenticator app. On success the session is upgraded to aal2.
 */
export async function verifyMfaEnrollment(
  factorId: string,
  rawCode: string,
): Promise<{ success?: boolean; error?: string }> {
  const parsedId = factorIdSchema.safeParse(factorId);
  if (!parsedId.success) return { error: 'Richiesta non valida. Riprova dall\'inizio.' };

  const code = normalizeTotpCode(rawCode);
  if (!code) return { error: 'Inserisci il codice a 6 cifre mostrato dall\'app di autenticazione.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const rateCheck = await checkRateLimit({ key: `mfa-verify:${user.id}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsedId.data,
    code,
  });

  if (error) {
    return { error: 'Codice non valido o scaduto. Controlla l\'app e riprova.' };
  }

  logAccess({
    userId: user.id,
    action: 'user.mfa_enrolled',
    entityType: 'user',
    entityId: user.id,
    metadata: { factorType: 'totp' },
  });

  return { success: true };
}

/**
 * Remove a TOTP factor (disable 2FA, or cancel an in-progress enrollment).
 */
export async function unenrollMfaFactor(
  factorId: string,
): Promise<{ success?: boolean; error?: string }> {
  const parsedId = factorIdSchema.safeParse(factorId);
  if (!parsedId.success) return { error: 'Richiesta non valida.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsedId.data });
  if (error) {
    logger.error('mfa', 'unenroll failed', { error: error.message });
    return { error: 'Impossibile disattivare la verifica in due passaggi. Riprova.' };
  }

  logAccess({
    userId: user.id,
    action: 'user.mfa_unenrolled',
    entityType: 'user',
    entityId: user.id,
    metadata: { factorType: 'totp' },
  });

  return { success: true };
}
