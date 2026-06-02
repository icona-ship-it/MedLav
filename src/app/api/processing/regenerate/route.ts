import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { resolveAnomalies } from '@/services/validation/anomaly-resolver';
import type { OcrPageFetcher } from '@/services/validation/anomaly-resolver';
import { inngest } from '@/lib/inngest/client';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { CaseType } from '@/types';
import { safeJsonParse } from '@/lib/format';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { checkFeatureAccess } from '@/lib/subscription';
import { getBalance, deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { logger } from '@/lib/logger';

export const maxDuration = 800; // synthesis can take several minutes (TIMEOUT_SYNTHESIS=600s)

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/regenerate
 * Regenerate anomalies, missing docs, and synthesis from current events.
 * Used after the expert edits/adds/deletes events.
 */
export async function POST(request: NextRequest) {
  // Credit-refund bookkeeping visible to the outer catch (try/catch have separate
  // block scopes). If we charged but never successfully dispatched the Inngest job,
  // any failure must refund.
  let regenCharged = false;
  let regenDispatched = false;
  let regenUserId: string | null = null;
  let regenCaseId: string | null = null;
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    // Feature gate: check subscription allows processing
    const gate = await checkFeatureAccess(user.id, 'processing');
    if (!gate.allowed) {
      return NextResponse.json(
        { success: false, error: gate.reason ?? 'Funzionalità non disponibile nel piano attuale. Passa a Pro.' },
        { status: 403 },
      );
    }

    // Rate limit: prevent repeated expensive LLM calls
    const rateCheck = await checkRateLimit({
      key: `regenerate:${user.id}`,
      ...RATE_LIMITS.PROCESSING,
    });
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Troppi tentativi. Riprova tra qualche minuto.' },
        { status: 429 },
      );
    }

    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'ID caso non valido' }, { status: 400 });
    }

    const { caseId } = parsed.data;

    // Verify case ownership
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, case_type, case_types, case_role, patient_initials, perizia_metadata, processing_stage')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseRow) {
      return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
    }

    // Concurrency guard: don't start a regeneration while the pipeline (or another
    // regeneration) is already running on this case.
    const currentStage = (caseRow.processing_stage as string) ?? 'idle';
    if (currentStage === 'elaborazione' || currentStage === 'generazione_report') {
      return NextResponse.json(
        { success: false, error: 'Elaborazione già in corso su questo caso. Attendi il completamento.' },
        { status: 409 },
      );
    }

    // Fetch current active events
    const { data: eventsRaw } = await admin
      .from('events')
      .select('*')
      .eq('case_id', caseId)
      .eq('is_deleted', false)
      .order('order_number', { ascending: true });

    const events: ConsolidatedEvent[] = (eventsRaw ?? []).map((e) => ({
      orderNumber: e.order_number as number,
      documentId: (e.document_id ?? '') as string,
      eventDate: e.event_date as string,
      datePrecision: e.date_precision as ConsolidatedEvent['datePrecision'],
      eventType: e.event_type as ConsolidatedEvent['eventType'],
      title: e.title as string,
      description: e.description as string,
      sourceType: e.source_type as ConsolidatedEvent['sourceType'],
      diagnosis: (e.diagnosis ?? null) as string | null,
      doctor: (e.doctor ?? null) as string | null,
      facility: (e.facility ?? null) as string | null,
      confidence: e.confidence as number,
      requiresVerification: e.requires_verification as boolean,
      reliabilityNotes: (e.reliability_notes ?? null) as string | null,
      discrepancyNote: null,
      sourceText: (e.source_text ?? '') as string,
      sourcePages: e.source_pages ? safeJsonParse<number[]>(e.source_pages as string, []) : [],
    }));

    // No events → nothing to regenerate. Reject up-front (immediate feedback)
    // instead of dispatching a job that would just throw.
    if (events.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun evento disponibile: non c\'è nulla da rigenerare.' },
        { status: 400 },
      );
    }

    // Charge the report regeneration upfront (full sectional synthesis + inline
    // anomaly resolution = expensive LLM run). Deduct AFTER the "no events" check
    // so a no-op regen is never billed. Refunded on any failure before the job
    // runs (below) and by regenerate-report's onFailure if the job itself fails.
    const REGEN_COST = CREDIT_COSTS.rigenerazione_report;
    const regenBalance = await getBalance(user.id);
    if (regenBalance.total < REGEN_COST) {
      return NextResponse.json(
        {
          success: false,
          error: `Crediti insufficienti: servono ${REGEN_COST} crediti per rigenerare il report, hai ${regenBalance.total}.`,
          creditsNeeded: REGEN_COST,
          creditsAvailable: regenBalance.total,
        },
        { status: 402 },
      );
    }
    const regenDeduction = await deductCredits(user.id, REGEN_COST, 'rigenerazione_report', caseId, { reason: 'regenerate' });
    if (!regenDeduction.success) {
      return NextResponse.json({ success: false, error: regenDeduction.error }, { status: 402 });
    }
    regenCharged = true;
    regenUserId = user.id;
    regenCaseId = caseId;

    // Preserve perito reviews: keep user_confirmed and user_dismissed entries.
    // Drop only AI-only statuses (detected, llm_confirmed, llm_resolved) so
    // re-detection can refresh them. The perito's notes are never lost.
    const { error: delAnom } = await admin
      .from('anomalies')
      .delete()
      .eq('case_id', caseId)
      .in('status', ['detected', 'llm_confirmed', 'llm_resolved']);
    if (delAnom) logger.warn('regenerate', `Failed to delete AI-only anomalies: ${delAnom.message}`);
    const { error: delMissing } = await admin.from('missing_documents').delete().eq('case_id', caseId);
    if (delMissing) logger.warn('regenerate', `Failed to delete old missing docs: ${delMissing.message}`);

    // Read remaining (perito-reviewed) anomalies so we don't insert duplicates.
    const { data: existingRows } = await admin
      .from('anomalies')
      .select('anomaly_type, description')
      .eq('case_id', caseId);
    const existingKeys = new Set(
      (existingRows ?? []).map((r) => `${r.anomaly_type}::${r.description}`),
    );

    // Re-detect anomalies (insert only new ones).
    const rawAnomalies = detectAnomalies(events);
    const newAnomalies = rawAnomalies.filter(
      (a) => !existingKeys.has(`${a.anomalyType}::${a.description}`),
    );
    if (newAnomalies.length > 0) {
      const { error: insertAnom } = await admin.from('anomalies').insert(
        newAnomalies.map((a) => ({
          case_id: caseId,
          anomaly_type: a.anomalyType,
          severity: a.severity,
          description: a.description,
          involved_events: JSON.stringify(a.involvedEvents),
          suggestion: a.suggestion,
        })),
      );
      if (insertAnom) logger.error('regenerate', `Failed to insert anomalies: ${insertAnom.message}`);
    }

    // Resolve anomalies via LLM (check source OCR pages)
    const fetchOcrPages: OcrPageFetcher = async (requests) => {
      const result = new Map<string, string>();
      for (const req of requests) {
        const { data: pages } = await admin
          .from('pages')
          .select('page_number, ocr_text')
          .eq('document_id', req.documentId)
          .in('page_number', req.pageNumbers);
        if (pages) {
          for (const page of pages) {
            result.set(`${req.documentId}:${page.page_number}`, (page.ocr_text as string) ?? '');
          }
        }
      }
      return result;
    };

    // Resolve only the newly-inserted anomalies via LLM (skip perito-reviewed ones).
    const resolvedAnomalies = await resolveAnomalies(newAnomalies, events, fetchOcrPages);

    // Update anomaly rows with resolution status
    for (const r of resolvedAnomalies) {
      if (!r.resolution) continue;
      const { data: rows } = await admin
        .from('anomalies')
        .select('id')
        .eq('case_id', caseId)
        .eq('anomaly_type', r.anomalyType)
        .eq('description', r.description)
        .limit(1);
      const anomalyRow = rows?.[0];
      if (!anomalyRow) continue;
      const status = r.resolution.resolved ? 'llm_resolved' : 'llm_confirmed';
      // Resolution note left blank: the perito writes their own from scratch.
      await admin.from('anomalies').update({
        status,
        resolution_note: null,
        resolved_at: r.resolution.resolved ? new Date().toISOString() : null,
      }).eq('id', anomalyRow.id);
    }

    // Re-fetch ALL eligible anomalies from DB (user_confirmed + llm_confirmed + detected),
    // attaching the perito's resolution_note where present. Excludes user_dismissed
    // (perito explicitly rejected) and llm_resolved (AI false positive).
    const { fetchAnomaliesForSynthesis } = await import('@/services/validation/anomaly-fetcher');
    const anomalies = await fetchAnomaliesForSynthesis(admin, caseId);

    // Build caseTypes: use case_types if available, fallback to [case_type]
    const rawCaseTypes = caseRow.case_types as string[] | null;
    const caseTypes: CaseType[] = rawCaseTypes && rawCaseTypes.length > 0
      ? rawCaseTypes as CaseType[]
      : [caseRow.case_type as CaseType];

    // Re-detect missing docs
    const missingDocs = detectMissingDocuments({
      events,
      caseType: caseRow.case_type as CaseType,
      caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
    });
    if (missingDocs.length > 0) {
      const { error: insertMissing } = await admin.from('missing_documents').insert(
        missingDocs.map((m) => ({
          case_id: caseId,
          document_name: m.documentName,
          reason: m.reason,
          related_event: m.relatedEvent,
        })),
      );
      if (insertMissing) logger.error('regenerate', `Failed to insert missing docs: ${insertMissing.message}`);
    }

    // Hand the SECTIONAL deterministic synthesis off to Inngest (async): per-section
    // steps + doc-sanitaria batching → no Vercel timeout/truncation, and the
    // spese/ITT-ITP tables are the DETERMINISTIC sentinels (not LLM prose). The
    // UI already polls processing_stage + generationProgress to show the bar.
    const existingMeta = (caseRow.perizia_metadata ?? {}) as Record<string, unknown>;
    // TOCTOU lock: atomically flip to 'generazione_report' ONLY if still in a
    // non-running stage. Prevents two concurrent regenerate requests (that both
    // passed the earlier guard) from each dispatching a generation.
    const allowedStages = ['idle', 'completato', 'errore'];
    const { data: lockRows, error: stageError } = await admin.from('cases').update({
      processing_stage: 'generazione_report',
      perizia_metadata: {
        ...existingMeta,
        generationProgress: { currentSection: 0, totalSections: 1, currentSectionTitle: 'Avvio rigenerazione…' },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', caseId).in('processing_stage', allowedStages).select('id');
    if (stageError) {
      logger.error('processing/regenerate', `Failed to set generazione_report for case ${caseId}`, { error: stageError.message });
      await refundCredits(user.id, REGEN_COST, 'rigenerazione_report', caseId, { reason: 'regenerate_stage_lock_failed' });
      regenCharged = false;
      return NextResponse.json({ success: false, error: 'Errore avvio rigenerazione.' }, { status: 500 });
    }
    if (!lockRows || lockRows.length === 0) {
      // Another request grabbed the lock between our guard check and here.
      await refundCredits(user.id, REGEN_COST, 'rigenerazione_report', caseId, { reason: 'regenerate_already_running' });
      regenCharged = false;
      return NextResponse.json(
        { success: false, error: 'Elaborazione già in corso su questo caso. Attendi il completamento.' },
        { status: 409 },
      );
    }

    try {
      await inngest.send({ name: 'case/report.regenerate', data: { caseId, userId: user.id } });
      regenDispatched = true;
    } catch (sendError) {
      // Dispatch failed → REVERT the stage so the case is never stuck in
      // 'generazione_report' with no Inngest function actually running (the
      // onFailure handler only fires if the event was dispatched).
      await admin.from('cases').update({
        processing_stage: currentStage,
        perizia_metadata: existingMeta,
        updated_at: new Date().toISOString(),
      }).eq('id', caseId);
      // No job will run → refund the charge.
      await refundCredits(user.id, REGEN_COST, 'rigenerazione_report', caseId, { reason: 'regenerate_dispatch_failed' });
      regenCharged = false;
      logger.error('processing/regenerate', `inngest.send failed for case ${caseId} — stage reverted to ${currentStage}`, {
        error: sendError instanceof Error ? sendError.message : 'unknown',
      });
      return NextResponse.json({ success: false, error: 'Errore avvio rigenerazione. Riprova.' }, { status: 500 });
    }

    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'report.regenerate_dispatched',
      entity_type: 'report',
      entity_id: caseId,
      metadata: {
        eventsCount: events.length,
        anomaliesCount: anomalies.length,
        missingDocsCount: missingDocs.length,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        async: true,
        eventsCount: events.length,
        anomaliesCount: anomalies.length,
        missingDocsCount: missingDocs.length,
      },
    });
  } catch (error) {
    logger.error('processing/regenerate', 'Report regeneration failed', { error: error instanceof Error ? error.message : 'unknown' });
    // Charged but the job never got dispatched (e.g. inline anomaly resolution
    // threw) → refund so the perito is never billed for work that never ran.
    if (regenCharged && !regenDispatched && regenUserId) {
      // Pass entity_id=caseId so this refund is counted on the SAME key as the
      // consumption — keeps the regenerate-report onFailure idempotency consistent
      // (it counts consumptions vs refunds filtered by entity_id=caseId).
      await refundCredits(regenUserId, CREDIT_COSTS.rigenerazione_report, 'rigenerazione_report', regenCaseId ?? undefined, {
        reason: 'regenerate_unexpected_error',
      }).catch(() => { /* best-effort */ });
    }
    return NextResponse.json({ success: false, error: 'Errore rigenerazione report.' }, { status: 500 });
  }
}
