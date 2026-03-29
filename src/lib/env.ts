import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * Server-side environment variable validation.
 * Required vars throw at startup; optional vars log warnings.
 */

const requiredEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MISTRAL_API_KEY: z.string().min(1),
});

const optionalEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  ADMIN_EMAILS: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
});

export function validateEnv(): void {
  // Validate required vars — throw if missing
  const requiredResult = requiredEnvSchema.safeParse(process.env);
  if (!requiredResult.success) {
    const missing = requiredResult.error.issues.map((i) => i.path.join('.'));
    const message = `Missing or invalid required environment variables: ${missing.join(', ')}`;
    logger.error('env', message);
    throw new Error(message);
  }

  // Validate optional vars — warn if invalid (but don't throw)
  const optionalResult = optionalEnvSchema.safeParse(process.env);
  if (!optionalResult.success) {
    const issues = optionalResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    logger.warn('env', `Optional env var issues: ${issues.join(', ')}`);
  }

  // Warn about production-recommended vars
  if (!process.env.UPSTASH_REDIS_REST_URL && process.env.NODE_ENV === 'production') {
    logger.warn('env', 'UPSTASH_REDIS_REST_URL not set — rate limiting will use in-memory fallback (ineffective on serverless)');
  }
  if (!process.env.ADMIN_EMAILS) {
    logger.warn('env', 'ADMIN_EMAILS not set — admin endpoints will deny all access');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.warn('env', 'STRIPE_SECRET_KEY not set — payments will not work');
  }
  if (!process.env.RESEND_API_KEY) {
    logger.warn('env', 'RESEND_API_KEY not set — email notifications will not work');
  }
}
