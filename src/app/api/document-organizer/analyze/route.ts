import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkFeatureAccess } from '@/lib/subscription';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const gate = await checkFeatureAccess(user.id, 'document_organizer');
  if (!gate.allowed) {
    return NextResponse.json({ success: false, error: gate.reason ?? 'Funzionalità Pro richiesta.' }, { status: 403 });
  }

  const rateCheck = await checkRateLimit({ key: `doc-organizer:${user.id}`, ...RATE_LIMITS.PROCESSING });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
  }

  const { caseId } = parsed.data;

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, processing_stage')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
  }

  try {
    await inngest.send({
      name: 'case/documents.organize',
      data: { caseId, userId: user.id },
    });

    logger.info('document-organizer', `Started organization for case ${caseId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('document-organizer', `Failed to start: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json({ success: false, error: 'Errore avvio organizzazione.' }, { status: 500 });
  }
}
