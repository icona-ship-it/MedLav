import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { validateCaseForProcessing } from '@/lib/pipeline-limits';
import { getBalance, deductCredits, refundCredits } from '@/services/credits/credit-service';
import { getElaborationCost } from '@/services/credits/credit-costs';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

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

    // Rate limiting PER-UTENTE (non per-IP: x-forwarded-for è spoofabile e
    // penalizza utenti legittimi dietro lo stesso NAT/studio).
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

    // Check subscription status (blocked for canceled/past_due)
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .single();

    const status = (profile?.subscription_status as string) ?? 'trial';

    if (status === 'canceled' || status === 'past_due') {
      return NextResponse.json(
        { success: false, error: 'Abbonamento non attivo. Aggiorna il tuo piano per continuare.' },
        { status: 403 },
      );
    }

    // Verify case ownership
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, user_id, processing_stage, pipeline_mode')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (caseError || !caseData) {
      return NextResponse.json(
        { success: false, error: 'Caso non trovato' },
        { status: 404 },
      );
    }

    // Guard: reject if pipeline is already running (prevents double-click / race condition)
    const currentStage = caseData.processing_stage as string;
    if (currentStage === 'elaborazione' || currentStage === 'generazione_report') {
      return NextResponse.json(
        { success: false, error: 'Elaborazione già in corso. Attendi il completamento o cancella prima di rielaborare.' },
        { status: 409 },
      );
    }

    // TOCTOU protection: atomically set stage to 'elaborazione' only if still in expected state
    // This prevents two concurrent requests from both passing the above check
    const allowedStages = ['idle', 'completato', 'errore'];
    const { data: lockResult, error: lockError } = await supabase
      .from('cases')
      .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
      .eq('id', caseId)
      .in('processing_stage', allowedStages)
      .select('id');
    if (lockError || !lockResult || lockResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Elaborazione già in corso. Attendi il completamento.' },
        { status: 409 },
      );
    }

    // Check that there are documents to process — BEFORE cleanup to avoid data loss
    const { count: docCount, error: countError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId);

    if (countError || !docCount || docCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun documento da elaborare. Carica almeno un documento.' },
        { status: 400 },
      );
    }

    // Validate document count limits — BEFORE cleanup to avoid data loss
    const validation = validateCaseForProcessing({ documentCount: docCount });
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }

    // Get pipeline mode for fixed credit cost (already fetched with caseData)
    const pipelineMode = (caseData.pipeline_mode as string) ?? 'full';
    const creditCost = getElaborationCost(pipelineMode);

    // Credit check — block if insufficient
    const balance = await getBalance(user.id);
    if (balance.total < creditCost) {
      // Release the processing lock since we're rejecting
      await supabase
        .from('cases')
        .update({ processing_stage: caseData.processing_stage, updated_at: new Date().toISOString() })
        .eq('id', caseId);

      return NextResponse.json(
        {
          success: false,
          error: `Crediti insufficienti: servono ${creditCost}, hai ${balance.total}. Acquista crediti per continuare.`,
          creditsNeeded: creditCost,
          creditsAvailable: balance.total,
        },
        { status: 402 },
      );
    }

    // Deduct credits upfront
    const deduction = await deductCredits(
      user.id,
      creditCost,
      'elaborazione',
      caseId,
      { pipelineMode, docCount },
    );

    if (!deduction.success) {
      await supabase
        .from('cases')
        .update({ processing_stage: caseData.processing_stage, updated_at: new Date().toISOString() })
        .eq('id', caseId);

      return NextResponse.json(
        { success: false, error: deduction.error },
        { status: 402 },
      );
    }

    // Re-processing cleanup: if the case was already processed, clean ALL derived data
    // including OCR pages — every analysis runs fresh for maximum quality
    // This runs AFTER validation so user doesn't lose data on rejected requests
    const isReprocessing = caseData.processing_stage !== 'idle';
    if (isReprocessing) {
      logger.info('processing/start', `Re-processing case ${caseId}: cancelling previous pipeline + cleaning all data`);
      // Cancel any running pipeline first to prevent race conditions
      await inngest.send({ name: 'case/pipeline.cancelled', data: { caseId } });
      // Wait for Inngest to propagate cancellation before cleanup
      // Without this, in-flight steps can write data AFTER cleanup deletes it
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const cleanupResults = await Promise.allSettled([
        supabase.from('events').delete().eq('case_id', caseId),
        supabase.from('anomalies').delete().eq('case_id', caseId),
        supabase.from('missing_documents').delete().eq('case_id', caseId),
        supabase.from('reports').delete().eq('case_id', caseId),
        supabase.from('event_images').delete().eq('case_id', caseId),
      ]);
      const cleanupFailures = cleanupResults.filter((r) =>
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error),
      );
      if (cleanupFailures.length > 0) {
        logger.error('processing/start', `Re-processing cleanup: ${cleanupFailures.length}/5 deletes failed`);

        // Refund credits since we can't proceed
        await refundCredits(user.id, creditCost, 'elaborazione', caseId, {
          reason: 'cleanup_failed_during_reprocessing',
        });

        return NextResponse.json(
          { success: false, error: 'Errore durante la pulizia dei dati precedenti. Riprova.' },
          { status: 500 },
        );
      }
      // Delete OCR pages per document (fresh OCR on every run)
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', caseId);
      if (docs && docs.length > 0) {
        for (const d of docs) {
          const { error: pageDelError } = await supabase.from('pages').delete().eq('document_id', d.id);
          if (pageDelError) {
            logger.error('processing/start', `Failed to delete pages for doc ${d.id}: ${pageDelError.message}`);
          }
        }
      }
    }

    // Reset document status for processing
    await supabase
      .from('documents')
      .update({
        processing_status: 'in_coda',
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('case_id', caseId);

    // processing_stage already set to 'elaborazione' by atomic lock above

    // Send Inngest event to trigger processing
    await inngest.send({
      name: 'case/pipeline.start',
      data: {
        caseId,
        userId: user.id,
      },
    });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: isReprocessing ? 'case.reprocessing.started' : 'case.processing.started',
      entity_type: 'case',
      entity_id: caseId,
      metadata: { documentsToProcess: docCount, isReprocessing },
    });

    return NextResponse.json({
      success: true,
      data: { caseId, documentsQueued: docCount },
    });
  } catch (error) {
    logger.error('processing/start', 'Unexpected error', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
