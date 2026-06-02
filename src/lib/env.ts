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
  // Only validate format of vars that are actually set (empty string = not set)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
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
    if (process.env.NODE_ENV === 'production') {
      // Mock payment mode (free credits) is disabled in production for security.
      // Without the key, payment endpoints fail closed — surface this loudly so
      // the misconfiguration is caught, but do NOT crash the app (the core
      // report pipeline does not depend on Stripe).
      logger.error('env', 'STRIPE_SECRET_KEY mancante in PRODUZIONE — i pagamenti falliranno (mock mode disabilitato in prod). Configurare la chiave Stripe.');
    } else {
      logger.info('env', 'STRIPE_SECRET_KEY not set — running in mock payment mode (credits granted directly)');
    }
  }
  if (!process.env.RESEND_API_KEY) {
    logger.info('env', 'RESEND_API_KEY not set — email notifications disabled');
  }
}
