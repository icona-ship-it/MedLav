import { describe, it, expect } from 'vitest';
import {
  isMfaChallengeRequired,
  pickVerifiedTotpFactorId,
  hasVerifiedTotpFactor,
  listUnverifiedTotpFactorIds,
  normalizeTotpCode,
  type MfaFactorLike,
} from './mfa-utils';

describe('isMfaChallengeRequired', () => {
  it('should require challenge when session is aal1 and next level is aal2', () => {
    expect(isMfaChallengeRequired('aal1', 'aal2')).toBe(true);
  });

  it('should not require challenge when session is already aal2', () => {
    expect(isMfaChallengeRequired('aal2', 'aal2')).toBe(false);
  });

  it('should not require challenge when user has no MFA factors (aal1/aal1)', () => {
    expect(isMfaChallengeRequired('aal1', 'aal1')).toBe(false);
  });

  it('should not require challenge when levels are null (no session)', () => {
    expect(isMfaChallengeRequired(null, null)).toBe(false);
    expect(isMfaChallengeRequired(null, 'aal2')).toBe(false);
    expect(isMfaChallengeRequired('aal1', null)).toBe(false);
  });
});

describe('pickVerifiedTotpFactorId', () => {
  const verified: MfaFactorLike = { id: 'f-1', factor_type: 'totp', status: 'verified' };
  const unverified: MfaFactorLike = { id: 'f-2', factor_type: 'totp', status: 'unverified' };
  const phone: MfaFactorLike = { id: 'f-3', factor_type: 'phone', status: 'verified' };

  it('should return the id of the first verified totp factor', () => {
    expect(pickVerifiedTotpFactorId([unverified, verified])).toBe('f-1');
  });

  it('should return null when the factor list is empty', () => {
    expect(pickVerifiedTotpFactorId([])).toBeNull();
  });

  it('should return null when only unverified totp factors exist', () => {
    expect(pickVerifiedTotpFactorId([unverified])).toBeNull();
  });

  it('should ignore verified factors of other types (phone)', () => {
    expect(pickVerifiedTotpFactorId([phone])).toBeNull();
  });
});

describe('hasVerifiedTotpFactor', () => {
  it('should return true when a verified totp factor exists', () => {
    expect(
      hasVerifiedTotpFactor([{ id: 'f', factor_type: 'totp', status: 'verified' }]),
    ).toBe(true);
  });

  it('should return false for empty list', () => {
    expect(hasVerifiedTotpFactor([])).toBe(false);
  });
});

describe('listUnverifiedTotpFactorIds', () => {
  it('should return only unverified totp factor ids', () => {
    const factors: MfaFactorLike[] = [
      { id: 'a', factor_type: 'totp', status: 'unverified' },
      { id: 'b', factor_type: 'totp', status: 'verified' },
      { id: 'c', factor_type: 'phone', status: 'unverified' },
      { id: 'd', factor_type: 'totp', status: 'unverified' },
    ];
    expect(listUnverifiedTotpFactorIds(factors)).toEqual(['a', 'd']);
  });

  it('should return empty array when there are no factors', () => {
    expect(listUnverifiedTotpFactorIds([])).toEqual([]);
  });
});

describe('normalizeTotpCode', () => {
  it('should accept a plain 6-digit code', () => {
    expect(normalizeTotpCode('123456')).toBe('123456');
  });

  it('should strip spaces and dashes', () => {
    expect(normalizeTotpCode('123 456')).toBe('123456');
    expect(normalizeTotpCode('123-456')).toBe('123456');
    expect(normalizeTotpCode(' 12 34 56 ')).toBe('123456');
  });

  it('should reject codes with wrong length', () => {
    expect(normalizeTotpCode('12345')).toBeNull();
    expect(normalizeTotpCode('1234567')).toBeNull();
    expect(normalizeTotpCode('')).toBeNull();
  });

  it('should reject non-numeric input', () => {
    expect(normalizeTotpCode('12345a')).toBeNull();
    expect(normalizeTotpCode('abcdef')).toBeNull();
  });

  it('should reject non-ASCII digits (unicode)', () => {
    expect(normalizeTotpCode('١٢٣٤٥٦')).toBeNull();
  });
});
