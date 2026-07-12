import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { isAdminUser } from '@/lib/admin';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/reset
 * Resets all data except user accounts.
 * Requires admin authentication.
 */
export async function POST(request: NextRequest) {
  try {
    // P0-SEC-005: destructive reset wipes ALL users' data via service role.
    // Disabled in production unless ALLOW_DESTRUCTIVE_ADMIN=true is set explicitly.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_ADMIN !== 'true') {
      return NextResponse.json(
        { success: false, error: 'Endpoint disabilitato in produzione' },
        { status: 403 },
      );
    }

    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdminUser(user.email)) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    const rateCheck = await checkRateLimit({ key: `admin-reset:${user.id}`, ...RATE_LIMITS.PROCESSING });
    if (!rateCheck.success) {
      return NextResponse.json({ success: false, error: 'Troppe richieste. Riprova tra qualche minuto.' }, { status: 429 });
    }

    const admin = createAdminClient();

    // Delete in order (foreign key dependencies). audit_log ESCLUSO: il registro
    // di accesso è il trail di compliance GDPR e deve sopravvivere a un reset dei dati.
    const tables = [
      'event_images', 'anomalies', 'missing_documents', 'reports',
      'events', 'pages', 'documents', 'cases',
    ];

    const results: Record<string, string> = {};

    for (const table of tables) {
      const { error } = await admin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      results[table] = error ? `errore: ${error.message}` : 'pulito';
    }

    logger.info('admin', `Reset all data by user ${user.id}`);

    return NextResponse.json({
      success: true,
      data: { tables: results },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Errore interno' },
      { status: 500 },
    );
  }
}
