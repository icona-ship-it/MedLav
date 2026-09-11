import { describe, it, expect } from 'vitest';
import { parseImplicitSessionHash } from './implicit-session';

describe('parseImplicitSessionHash — sessione nel fragment (flusso implicito)', () => {
  it('should extract access and refresh tokens from a GoTrue implicit-flow fragment', () => {
    const hash = '#access_token=eyJ.abc.def&expires_in=3600&refresh_token=r1-xyz&token_type=bearer&type=magiclink';
    expect(parseImplicitSessionHash(hash)).toEqual({ accessToken: 'eyJ.abc.def', refreshToken: 'r1-xyz' });
  });

  it('should return null when the fragment is absent, empty, or not a session', () => {
    expect(parseImplicitSessionHash(null)).toBeNull();
    expect(parseImplicitSessionHash('')).toBeNull();
    expect(parseImplicitSessionHash('#')).toBeNull();
    expect(parseImplicitSessionHash('#error=access_denied&error_code=otp_expired')).toBeNull();
  });

  it('should return null when one of the two tokens is missing or malformed', () => {
    expect(parseImplicitSessionHash('#access_token=a.b.c')).toBeNull();
    expect(parseImplicitSessionHash('#refresh_token=r1')).toBeNull();
    expect(parseImplicitSessionHash('#access_token=a%20b&refresh_token=r1')).toBeNull();
  });
});
