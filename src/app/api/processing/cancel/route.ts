import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/cancel
 * Cancel document processing for a case.
 * Sets all in-progress documents to error status and sends Inngest cancel event.
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateCheck = await checkRateLimit({ key: `cancel:${ip}`, ...RATE_LIMITS.PROCESSING });
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

    // Update all processing documents to error status
    const processingStatuses = ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'];
    const { count } = await supabase
      .from('documents')
      .update({
        processing_status: 'errore',
        processing_error: 'Annullato dall\'utente',
        updated_at: new Date().toISOString(),
      })
      .eq('case_id', caseId)
      .in('processing_status', processingStatuses);

    // Send Inngest cancel event
    await inngest.send({
      name: 'case/process.cancelled',
      data: {
        caseId,
        userId: user.id,
      },
    });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'case.processing.cancelled',
      entity_type: 'case',
      entity_id: caseId,
      metadata: { documentsCancelled: count ?? 0 },
    });

    return NextResponse.json({
      success: true,
      data: { caseId, documentsCancelled: count ?? 0 },
    });
  } catch (error) {
    logger.error('processing/cancel', 'Unexpected error', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
