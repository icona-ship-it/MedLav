import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('rate-limit (in-memory fallback)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset module to get a fresh store for each test
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests within limit', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');
    const params = { key: 'user-1', limit: 3, windowMs: 60_000 };

    // Act
    const r1 = await checkRateLimit(params);
    const r2 = await checkRateLimit(params);
    const r3 = await checkRateLimit(params);

    // Assert
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
  });

  it('should block requests exceeding limit', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');
    const params = { key: 'user-2', limit: 2, windowMs: 60_000 };

    // Act
    await checkRateLimit(params);
    await checkRateLimit(params);
    const r3 = await checkRateLimit(params);

    // Assert
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('should reset after window expires', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');
    const params = { key: 'user-3', limit: 1, windowMs: 10_000 };

    // Act — exhaust the limit
    await checkRateLimit(params);
    const blocked = await checkRateLimit(params);
    expect(blocked.success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(11_000);

    // Act — should be allowed again
    const afterReset = await checkRateLimit(params);

    // Assert
    expect(afterReset.success).toBe(true);
  });

  it('should track remaining count correctly', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');
    const params = { key: 'user-4', limit: 5, windowMs: 60_000 };

    // Act & Assert
    const r1 = await checkRateLimit(params);
    expect(r1.remaining).toBe(4);

    const r2 = await checkRateLimit(params);
    expect(r2.remaining).toBe(3);

    const r3 = await checkRateLimit(params);
    expect(r3.remaining).toBe(2);

    const r4 = await checkRateLimit(params);
    expect(r4.remaining).toBe(1);

    const r5 = await checkRateLimit(params);
    expect(r5.remaining).toBe(0);
  });

  it('should track separate keys independently', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');

    // Act — exhaust limit for key-a
    await checkRateLimit({ key: 'key-a', limit: 1, windowMs: 60_000 });
    const blockedA = await checkRateLimit({ key: 'key-a', limit: 1, windowMs: 60_000 });

    // key-b should still be allowed
    const allowedB = await checkRateLimit({ key: 'key-b', limit: 1, windowMs: 60_000 });

    // Assert
    expect(blockedA.success).toBe(false);
    expect(allowedB.success).toBe(true);
  });

  it('should return resetAt timestamp', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');
    const now = Date.now();
    const windowMs = 60_000;

    // Act
    const result = await checkRateLimit({ key: 'user-5', limit: 10, windowMs });

    // Assert
    expect(result.resetAt).toBeGreaterThanOrEqual(now + windowMs);
  });

  it('should export RATE_LIMITS presets', async () => {
    // Arrange
    const { RATE_LIMITS } = await import('./rate-limit');

    // Assert
    expect(RATE_LIMITS.AUTH).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RATE_LIMITS.PROCESSING).toEqual({ limit: 5, windowMs: 60_000 });
    expect(RATE_LIMITS.API).toEqual({ limit: 60, windowMs: 60_000 });
  });
});
