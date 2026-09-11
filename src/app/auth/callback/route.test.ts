import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));

import { GET } from './route';

function req(query: string): NextRequest {
  return new NextRequest(`https://medlav.test/auth/callback${query}`);
}

describe('GET /auth/callback — code (PKCE) e token_hash (link email/magic link)', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it('should exchange a PKCE code and redirect to next', async () => {
    const res = await GET(req('?code=abc&next=/cases'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(res.headers.get('location')).toBe('https://medlav.test/cases');
  });

  it('should verify a token_hash magic link (no PKCE verifier needed, works cross-device) and redirect', async () => {
    const res = await GET(req('?token_hash=h123&type=magiclink&next=/'));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h123', type: 'magiclink' });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://medlav.test/');
  });

  it('should accept the recovery type and land on the update-password form', async () => {
    const res = await GET(req('?token_hash=h1&type=recovery&next=/auth/update-password'));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h1', type: 'recovery' });
    expect(res.headers.get('location')).toBe('https://medlav.test/auth/update-password');
  });

  it('should reject an unknown type without calling Supabase', async () => {
    const res = await GET(req('?token_hash=h1&type=sms'));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('https://medlav.test/login?error=auth_callback_failed');
  });

  it('should redirect to the login error when verifyOtp fails', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired' } });
    const res = await GET(req('?token_hash=h1&type=signup'));
    expect(res.headers.get('location')).toBe('https://medlav.test/login?error=auth_callback_failed');
  });

  it('should keep the open-redirect guard on next for both flows', async () => {
    const res1 = await GET(req('?code=abc&next=https://evil.example'));
    expect(res1.headers.get('location')).toBe('https://medlav.test/');
    const res2 = await GET(req('?token_hash=h1&type=email&next=//evil.example'));
    expect(res2.headers.get('location')).toBe('https://medlav.test/');
  });

  it('should redirect to the login error when neither code nor token_hash is present', async () => {
    const res = await GET(req(''));
    expect(res.headers.get('location')).toBe('https://medlav.test/login?error=auth_callback_failed');
  });
});
