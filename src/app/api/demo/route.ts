import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createDemoCase } from '@/services/demo/create-demo-case';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

/**
 * POST /api/demo
 * Crea (o restituisce) il caso dimostrativo dell'utente autenticato:
 * cronistoria completa su documenti fittizi, senza pipeline né crediti.
 */
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const rateCheck = await checkRateLimit({ key: `demo:${user.id}`, ...RATE_LIMITS.PROCESSING });
    if (!rateCheck.success) {
      return NextResponse.json({ success: false, error: 'Troppe richieste. Riprova tra poco.' }, { status: 429 });
    }

    const result = await createDemoCase(user.id);
    if (!result) {
      return NextResponse.json({ success: false, error: 'Creazione del caso dimostrativo non riuscita. Riprova.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error('demo', 'Errore inatteso', { message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ success: false, error: 'Errore interno' }, { status: 500 });
  }
}
