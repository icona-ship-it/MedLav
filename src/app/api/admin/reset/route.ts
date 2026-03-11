import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/reset
 * Resets all data except user accounts.
 * Requires admin authentication.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdminUser(user.email)) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    const admin = createAdminClient();

    // Delete in order (foreign key dependencies)
    const tables = [
      'event_images', 'anomalies', 'missing_documents', 'reports',
      'events', 'pages', 'documents', 'cases', 'audit_log',
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
