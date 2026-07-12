import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/health
 * Public health check endpoint for uptime monitoring.
 * Returns status of all critical services (SENZA dettagli interni d'errore:
 * l'endpoint è pubblico, quindi i messaggi grezzi del DB restano nei log server).
 */
export async function GET(request: NextRequest) {
  // Rate limit per-IP generoso: sufficiente per gli uptime monitor, ma evita che
  // l'endpoint pubblico (che colpisce il DB) sia usato per martellare il DB.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rate = await checkRateLimit({ key: `health:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rate.success) {
    return NextResponse.json({ status: 'rate_limited' }, { status: 429 });
  }

  const startMs = Date.now();
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }> = {};

  // Check Supabase connectivity — il messaggio d'errore reale va SOLO nei log.
  try {
    const dbStart = Date.now();
    const supabase = createAdminClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      logger.error('health', `DB check failed: ${error.message}`);
      checks.database = { status: 'error', error: 'unreachable' };
    } else {
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    }
  } catch (err) {
    logger.error('health', `DB check threw: ${err instanceof Error ? err.message : 'unknown'}`);
    checks.database = { status: 'error', error: 'unreachable' };
  }

  // Check Mistral API key is configured (presenza chiave, non connettività live:
  // un probe reale a ogni poll costerebbe latenza + token).
  checks.mistral = process.env.MISTRAL_API_KEY
    ? { status: 'ok' }
    : { status: 'error', error: 'not_configured' };

  // Check Inngest keys are configured
  checks.inngest = process.env.INNGEST_EVENT_KEY || process.env.INNGEST_SIGNING_KEY
    ? { status: 'ok' }
    : { status: 'error', error: 'not_configured' };

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const totalLatencyMs = Date.now() - startMs;

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    latencyMs: totalLatencyMs,
    checks,
  }, { status: allOk ? 200 : 503 });
}
