import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/retry
 * Retry failed documents: reset errored docs to 'caricato' and re-trigger Inngest.
 * Excludes docs with warning-only errors (e.g. "Nessun evento").
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateCheck = await checkRateLimit({ key: `processing:${ip}`, ...RATE_LIMITS.PROCESSING });
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

    // Find failed documents (exclude warning-only like "Nessun evento")
    const { data: failedDocs, error: fetchError } = await supabase
      .from('documents')
      .select('id, processing_error')
      .eq('case_id', caseId)
      .eq('processing_status', 'errore');

    if (fetchError || !failedDocs || failedDocs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun documento in errore da riprovare.' },
        { status: 400 },
      );
    }

    // Filter out warning-only errors
    const retryableDocs = failedDocs.filter((doc) => {
      const err = (doc.processing_error ?? '').toLowerCase();
      return !err.includes('nessun evento');
    });

    if (retryableDocs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun documento in errore da riprovare (solo warning).' },
        { status: 400 },
      );
    }

    const retryIds = retryableDocs.map((d) => d.id);

    // Reset to 'caricato'
    await supabase
      .from('documents')
      .update({
        processing_status: 'caricato',
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', retryIds);

    // Trigger Inngest
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
      action: 'case.processing.retried',
      entity_type: 'case',
      entity_id: caseId,
      metadata: { retriedDocuments: retryIds.length },
    });

    return NextResponse.json({
      success: true,
      data: { caseId, retriedCount: retryIds.length },
    });
  } catch (error) {
    logger.error('processing/retry', 'Unexpected error', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
