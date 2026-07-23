import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

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

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non autenticato' },
        { status: 401 },
      );
    }

    // Rate limiting PER-UTENTE (non per-IP: x-forwarded-for è spoofabile).
    const rateCheck = await checkRateLimit({ key: `cancel:${user.id}`, ...RATE_LIMITS.PROCESSING });
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
      .select('id, user_id, processing_stage, perizia_metadata')
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

    // Reset processing stage to idle
    const { error: stageError } = await supabase
      .from('cases')
      .update({ processing_stage: 'idle', updated_at: new Date().toISOString() })
      .eq('id', caseId)
      .eq('user_id', user.id);
    if (stageError) {
      return NextResponse.json({ success: false, error: 'Errore durante l\'annullamento. Riprova.' }, { status: 500 });
    }

    // Send Inngest cancel event
    await inngest.send({
      name: 'case/pipeline.cancelled',
      data: {
        caseId,
        userId: user.id,
      },
    });

    // RIMBORSO (audit 2026-07-16): annullare bruciava i crediti dell'elaborazione
    // senza rimborso. Rimborsa la consumption più recente non ancora rimborsata
    // (idempotente): l'utente che annulla non perde i crediti. Best-effort: un
    // fallimento del rimborso non blocca l'annullamento.
    let refunded = 0;
    try {
      const { refundLatestCaseConsumption } = await import('@/services/credits/credit-service');
      refunded = await refundLatestCaseConsumption(
        user.id, caseId, ['elaborazione', 'rigenerazione_report'], 'user_cancelled',
      );
    } catch (refundErr) {
      logger.error('processing/cancel', 'Refund after cancel failed', { caseId, error: refundErr instanceof Error ? refundErr.message : 'unknown' });
      Sentry.captureMessage('Rimborso post-annullo FALLITO', 'error');
      const { recordDiagnostic: recordRefundDiag } = await import('@/lib/pipeline-diagnostics');
      await recordRefundDiag({ caseId, step: 'refund', code: 'refund_failed', detail: { reason: 'user_cancelled' } });
    }

    // Fotografia dello stato AL MOMENTO dell'annullo (audit diagnosticabilità
    // 2026-07-24, caso 235: "a che punto era quando ha annullato?" deve avere
    // risposta senza indagini). Solo codici e contatori, niente dati clinici.
    const metaAtCancel = (caseData.perizia_metadata ?? {}) as Record<string, unknown>;
    const progressAtCancel = metaAtCancel.processingProgress as Record<string, unknown> | undefined;
    const genAtCancel = metaAtCancel.generationProgress as Record<string, unknown> | undefined;
    const startedAtRaw = metaAtCancel.processingStartedAt;
    const elapsedMinutes = typeof startedAtRaw === 'string'
      ? Math.max(0, Math.round((Date.now() - new Date(startedAtRaw).getTime()) / 60000))
      : null;
    const { count: eventsAtCancel } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .eq('is_deleted', false);
    const cancelContext = {
      stageAtCancel: caseData.processing_stage as string | null,
      phase: (progressAtCancel?.phase as string) ?? null,
      totalChunks: (progressAtCancel?.totalChunks as number) ?? null,
      currentSection: (genAtCancel?.currentSection as number) ?? null,
      totalSections: (genAtCancel?.totalSections as number) ?? null,
      eventsAtCancel: eventsAtCancel ?? null,
      elapsedMinutes,
    };
    const { recordDiagnostic } = await import('@/lib/pipeline-diagnostics');
    await recordDiagnostic({ caseId, step: 'cancel', code: 'cancelled_by_user', detail: cancelContext });
    // Pattern-watch per il founder: livello info, mai dati clinici.
    Sentry.captureMessage(
      `Annullo utente: caso in '${cancelContext.stageAtCancel}' dopo ${elapsedMinutes ?? '?'} min (fase ${cancelContext.phase ?? '-'}, ${cancelContext.eventsAtCancel ?? 0} eventi)`,
      'info',
    );

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'case.processing.cancelled',
      entity_type: 'case',
      entity_id: caseId,
      metadata: { documentsCancelled: count ?? 0, creditsRefunded: refunded, ...cancelContext },
    });

    return NextResponse.json({
      success: true,
      data: { caseId, documentsCancelled: count ?? 0, creditsRefunded: refunded },
    });
  } catch (error) {
    logger.error('processing/cancel', 'Unexpected error', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
