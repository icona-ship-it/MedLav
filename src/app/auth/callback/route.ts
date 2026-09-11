import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /auth/callback
 * Completa i link di Supabase Auth in DUE forme:
 *  - `?code=` (PKCE): conferma email / reset / OAuth avviati da questo stesso
 *    browser (il code verifier sta nel cookie del browser che ha chiesto l'email);
 *  - `?token_hash=&type=` (audit 2026-09-10, reperto R1): link email costruiti
 *    con `{{ .TokenHash }}` e magic link di supporto — funzionano anche se il
 *    medico apre l'email su un ALTRO dispositivo, dove il PKCE fallirebbe con
 *    «link non valido» pur essendo valido.
 */

const EMAIL_OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  'signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email',
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && EMAIL_OTP_TYPES.has(value);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  // Open-redirect guard: only same-origin paths (reject absolute URLs and
  // protocol-relative '//evil.com').
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  } else if (tokenHash && isEmailOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // No usable parameter or verification error: back to login with a fixed error code
  // (the login page never reflects the query value).
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url));
}
