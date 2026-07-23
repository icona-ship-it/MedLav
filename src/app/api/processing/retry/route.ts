import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { getBalance, deductCredits, refundCredits } from '@/services/credits/credit-service';
import { getElaborationCost } from '@/services/credits/credit-costs';
import { processingPausedResponse } from '@/lib/processing-guard';
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

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non autenticato' },
        { status: 401 },
      );
    }

    // Kill-switch operativo condiviso.
    const pausedResponse = processingPausedResponse();
    if (pausedResponse) return pausedResponse;

    // Rate limiting PER-UTENTE (non per-IP: x-forwarded-for è spoofabile).
    const rateCheck = await checkRateLimit({ key: `processing:${user.id}`, ...RATE_LIMITS.PROCESSING });
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429 },
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
      .select('id, user_id, pipeline_mode')
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

    // Retry re-runs the FULL pipeline (re-OCR of the failed docs + consolidation +
    // re-synthesis = real LLM cost), so it is charged like a fresh elaboration.
    // Using operation 'elaborazione' integrates with the pipeline's idempotent
    // onFailure refund (a re-run is a new consumption, still refundable on failure).
    const pipelineMode = (caseData.pipeline_mode as string) ?? 'full';
    const creditCost = getElaborationCost(pipelineMode);
    const balance = await getBalance(user.id);
    if (balance.total < creditCost) {
      return NextResponse.json(
        {
          success: false,
          error: `Crediti insufficienti: servono ${creditCost}, hai ${balance.total}. Acquista crediti per riprovare.`,
          creditsNeeded: creditCost,
          creditsAvailable: balance.total,
        },
        { status: 402 },
      );
    }
    // LOCK ATOMICO (audit 2026-07-16): claim del caso PRIMA di addebitare, come
    // /start. Senza, un doppio click (o retry concorrente) passava entrambi il
    // check saldo → doppio addebito da 30 crediti + due pipeline concorrenti.
    // Solo se lo stage era errore/completato/idle il claim riesce.
    const { data: lockResult } = await supabase
      .from('cases')
      .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
      .eq('id', caseId)
      .eq('user_id', user.id)
      .in('processing_stage', ['idle', 'completato', 'errore'])
      .select('id');
    if (!lockResult || lockResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Elaborazione già in corso. Attendi il completamento.' },
        { status: 409 },
      );
    }

    // Helper: rilascia il lock (ripristina 'errore') su ogni fallimento successivo.
    const releaseLock = async () => {
      await supabase.from('cases').update({ processing_stage: 'errore' }).eq('id', caseId).eq('user_id', user.id);
    };

    const deduction = await deductCredits(user.id, creditCost, 'elaborazione', caseId, {
      pipelineMode,
      reason: 'retry',
      retriedDocuments: retryIds.length,
    });
    if (!deduction.success) {
      await releaseLock();
      return NextResponse.json({ success: false, error: deduction.error }, { status: 402 });
    }

    // Reset to 'caricato'
    const { error: docError } = await supabase
      .from('documents')
      .update({
        processing_status: 'caricato',
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', retryIds);
    if (docError) {
      await refundCredits(user.id, creditCost, 'elaborazione', caseId, { reason: 'retry_doc_reset_failed' });
      await releaseLock();
      return NextResponse.json({ success: false, error: 'Errore durante il reset dei documenti. Riprova.' }, { status: 500 });
    }

    // Trigger Inngest
    try {
      await inngest.send({
        name: 'case/pipeline.start',
        data: {
          caseId,
          userId: user.id,
        },
      });
    } catch (sendError) {
      // No pipeline will run → refund and revert the stage so the case isn't stuck.
      await refundCredits(user.id, creditCost, 'elaborazione', caseId, { reason: 'retry_dispatch_failed' });
      await supabase
        .from('cases')
        .update({ processing_stage: 'errore', updated_at: new Date().toISOString() })
        .eq('id', caseId)
        .eq('user_id', user.id);
      logger.error('processing/retry', `inngest.send failed for case ${caseId}`, {
        error: sendError instanceof Error ? sendError.message : 'unknown',
      });
      return NextResponse.json({ success: false, error: 'Non è stato possibile riavviare l\'analisi. Riprova tra qualche istante.' }, { status: 500 });
    }

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
