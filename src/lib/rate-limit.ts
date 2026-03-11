/**
 * Rate limiter with Redis (Upstash) support for serverless environments.
 * Falls back to in-memory Map when UPSTASH_REDIS_REST_URL is not configured.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitParams {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback (local dev / missing env vars)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
      if (entry.resetAt < now) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

function checkRateLimitInMemory(params: RateLimitParams): RateLimitResult {
  const { key, limit, windowMs } = params;
  const now = Date.now();

  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

// ---------------------------------------------------------------------------
// Redis (Upstash) implementation
// ---------------------------------------------------------------------------

const isRedisConfigured =
  typeof process !== 'undefined' &&
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Cache of Ratelimit instances keyed by "limit:windowMs" to avoid
 * re-creating them on every call.
 */
const ratelimitCache = new Map<string, Ratelimit>();

function getUpstashRatelimit(limit: number, windowMs: number): Ratelimit {
  const cacheKey = `${limit}:${windowMs}`;
  const cached = ratelimitCache.get(cacheKey);
  if (cached) return cached;

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const windowStr = `${windowSeconds} s` as `${number} s`;

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });

  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, windowStr),
    prefix: 'medlav:ratelimit',
  });

  ratelimitCache.set(cacheKey, rl);
  return rl;
}

async function checkRateLimitRedis(params: RateLimitParams): Promise<RateLimitResult> {
  const { key, limit, windowMs } = params;
  const rl = getUpstashRatelimit(limit, windowMs);
  const result = await rl.limit(key);

  return {
    success: result.success,
    remaining: result.remaining,
    resetAt: result.reset,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given key.
 * Uses Upstash Redis when configured, otherwise falls back to in-memory.
 *
 * Returns { success: true } if within limits, { success: false } if exceeded.
 */
export async function checkRateLimit(params: RateLimitParams): Promise<RateLimitResult> {
  if (isRedisConfigured) {
    try {
      return await checkRateLimitRedis(params);
    } catch {
      // Redis error — fall back to in-memory instead of crashing
      return checkRateLimitInMemory(params);
    }
  }
  return checkRateLimitInMemory(params);
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
