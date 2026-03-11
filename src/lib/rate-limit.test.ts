import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('rate-limit', () => {
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
    const r1 = checkRateLimit(params);
    const r2 = checkRateLimit(params);
    const r3 = checkRateLimit(params);

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
    checkRateLimit(params);
    checkRateLimit(params);
    const r3 = checkRateLimit(params);

    // Assert
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('should reset after window expires', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');
    const params = { key: 'user-3', limit: 1, windowMs: 10_000 };

    // Act — exhaust the limit
    checkRateLimit(params);
    const blocked = checkRateLimit(params);
    expect(blocked.success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(11_000);

    // Act — should be allowed again
    const afterReset = checkRateLimit(params);

    // Assert
    expect(afterReset.success).toBe(true);
  });

  it('should track remaining count correctly', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');
    const params = { key: 'user-4', limit: 5, windowMs: 60_000 };

    // Act & Assert
    const r1 = checkRateLimit(params);
    expect(r1.remaining).toBe(4);

    const r2 = checkRateLimit(params);
    expect(r2.remaining).toBe(3);

    const r3 = checkRateLimit(params);
    expect(r3.remaining).toBe(2);

    const r4 = checkRateLimit(params);
    expect(r4.remaining).toBe(1);

    const r5 = checkRateLimit(params);
    expect(r5.remaining).toBe(0);
  });

  it('should track separate keys independently', async () => {
    // Arrange
    const { checkRateLimit } = await import('./rate-limit');

    // Act — exhaust limit for key-a
    checkRateLimit({ key: 'key-a', limit: 1, windowMs: 60_000 });
    const blockedA = checkRateLimit({ key: 'key-a', limit: 1, windowMs: 60_000 });

    // key-b should still be allowed
    const allowedB = checkRateLimit({ key: 'key-b', limit: 1, windowMs: 60_000 });

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
    const result = checkRateLimit({ key: 'user-5', limit: 10, windowMs });

    // Assert
    expect(result.resetAt).toBeGreaterThanOrEqual(now + windowMs);
  });
});
