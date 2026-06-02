import { describe, it, expect, afterEach, vi } from 'vitest';
import { isStripeMockMode } from './client';

/**
 * SECURITY: mock mode grants credits/subscriptions WITHOUT payment. The single
 * most important property is that it is NEVER active in production — a missing
 * STRIPE_SECRET_KEY there must not turn into free credits.
 */
describe('isStripeMockMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should NEVER be mock mode in production, even without a key', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    expect(isStripeMockMode()).toBe(false);
  });

  it('should NEVER be mock mode in production, even with a key', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_xxx');

    expect(isStripeMockMode()).toBe(false);
  });

  it('should be mock mode in development when no key is set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    expect(isStripeMockMode()).toBe(true);
  });

  it('should NOT be mock mode in development when a key IS set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_xxx');

    expect(isStripeMockMode()).toBe(false);
  });

  it('should be mock mode in test env without a key (local/CI convenience)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('STRIPE_SECRET_KEY', '');

    expect(isStripeMockMode()).toBe(true);
  });
});
