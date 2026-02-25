/**
 * Simple in-memory rate limiter.
 * For production with multiple instances, replace with Vercel KV or Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for a given key.
 * Returns { success: true } if within limits, { success: false } if exceeded.
 */
export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): { success: boolean; remaining: number; resetAt: number } {
  const { key, limit, windowMs } = params;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Rate limit presets for different endpoints.
 */
export const RATE_LIMITS = {
  /** Auth endpoints: 10 requests per minute */
  AUTH: { limit: 10, windowMs: 60_000 },
  /** Processing start: 5 requests per minute */
  PROCESSING: { limit: 5, windowMs: 60_000 },
  /** General API: 60 requests per minute */
  API: { limit: 60, windowMs: 60_000 },
} as const;
