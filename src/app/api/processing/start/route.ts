import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/start
 * Trigger document processing for a case.
 * Validates auth, ownership, and document availability before sending Inngest event.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateCheck = checkRateLimit({ key: `processing:${ip}`, ...RATE_LIMITS.PROCESSING });
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non autenticato' },
        { status: 401 },
      );
    }

    // Validate request body
    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'ID caso non valido' },
        { status: 400 },
      );
    }

    const { caseId } = parsed.data;

    // Verify case ownership
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, user_id')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (caseError || !caseData) {
      return NextResponse.json(
        { success: false, error: 'Caso non trovato' },
        { status: 404 },
      );
    }

    // Check that there are documents to process
    const { count, error: countError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .in('processing_status', ['caricato', 'in_coda']);

    if (countError || !count || count === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun documento da elaborare. Carica almeno un documento.' },
        { status: 400 },
      );
    }

    // Check no processing is already running
    const { count: runningCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .in('processing_status', ['ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso']);

    if (runningCount && runningCount > 0) {
      return NextResponse.json(
        { success: false, error: 'Elaborazione già in corso per questo caso.' },
        { status: 409 },
      );
    }

    // Mark documents as in_coda
    await supabase
      .from('documents')
      .update({
        processing_status: 'in_coda',
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('case_id', caseId)
      .eq('processing_status', 'caricato');

    // Send Inngest event to trigger processing
    await inngest.send({
      name: 'case/process.requested',
      data: {
        caseId,
        userId: user.id,
      },
    });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'case.processing.started',
      entity_type: 'case',
      entity_id: caseId,
      metadata: { documentsToProcess: count },
    });

    return NextResponse.json({
      success: true,
      data: { caseId, documentsQueued: count },
    });
  } catch (error) {
    console.error('[processing/start] Unexpected error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
