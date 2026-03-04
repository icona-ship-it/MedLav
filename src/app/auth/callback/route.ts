import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /auth/callback
 * Handles Supabase Auth callbacks (email confirmation, OAuth, password reset).
 * Exchanges the auth code for a session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // If no code or error, redirect to login with error
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url));
}
