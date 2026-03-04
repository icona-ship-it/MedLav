import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/health
 * Public health check endpoint for uptime monitoring.
 * Returns status of all critical services.
 */
export async function GET() {
  const startMs = Date.now();
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }> = {};

  // Check Supabase connectivity
  try {
    const dbStart = Date.now();
    const supabase = createAdminClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    checks.database = error
      ? { status: 'error', error: error.message }
      : { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: 'error', error: err instanceof Error ? err.message : 'unknown' };
  }

  // Check Mistral API key is configured
  checks.mistral = process.env.MISTRAL_API_KEY
    ? { status: 'ok' }
    : { status: 'error', error: 'MISTRAL_API_KEY not set' };

  // Check Inngest
  checks.inngest = process.env.INNGEST_EVENT_KEY || process.env.INNGEST_SIGNING_KEY
    ? { status: 'ok' }
    : { status: 'error', error: 'INNGEST keys not set' };

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
