/**
 * Pure helpers for Supabase MFA (TOTP) state handling.
 *
 * Shared by: login server action, settings MFA actions, middleware AAL
 * enforcement. Kept pure (no I/O) so the security-critical decisions are
 * unit-testable.
 *
 * TODO (security roadmap): MFA is currently OPT-IN for all users. When the
 * admin role matures (src/lib/admin.ts), make MFA MANDATORY for admin
 * accounts: at login, if isAdminEmail(user.email) and no verified TOTP
 * factor exists, force enrollment before granting dashboard access.
 */

export type AalLevel = 'aal1' | 'aal2' | null;

/** Minimal shape of a Supabase MFA factor (subset of auth-js `Factor`). */
export interface MfaFactorLike {
  id: string;
  factor_type: string;
  status: string;
}

/**
 * True when the session must be upgraded with a TOTP challenge:
 * the user has at least one verified factor (nextLevel aal2) but the
 * current session was authenticated with password only (aal1).
 */
export function isMfaChallengeRequired(
  currentLevel: AalLevel,
  nextLevel: AalLevel,
): boolean {
  return nextLevel === 'aal2' && currentLevel === 'aal1';
}

/** Id of the first verified TOTP factor, or null when none exists. */
export function pickVerifiedTotpFactorId(
  factors: readonly MfaFactorLike[],
): string | null {
  const factor = factors.find(
    (f) => f.factor_type === 'totp' && f.status === 'verified',
  );
  return factor?.id ?? null;
}

/** True when the user has completed TOTP enrollment (factor verified). */
export function hasVerifiedTotpFactor(
  factors: readonly MfaFactorLike[],
): boolean {
  return pickVerifiedTotpFactorId(factors) !== null;
}

/** Ids of leftover unverified TOTP factors (abandoned enrollments). */
export function listUnverifiedTotpFactorIds(
  factors: readonly MfaFactorLike[],
): string[] {
  return factors
    .filter((f) => f.factor_type === 'totp' && f.status !== 'verified')
    .map((f) => f.id);
}

/**
 * Normalize a user-entered TOTP code: strips spaces and dashes (users often
 * copy "123 456"). Returns the 6-digit code, or null when invalid.
 */
export function normalizeTotpCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}
