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
    const { error: stageError } = await admin.from('cases').update({
      processing_stage: 'generazione_report',
      perizia_metadata: {
        ...existingMeta,
        generationProgress: { currentSection: 0, totalSections: 1, currentSectionTitle: 'Avvio rigenerazione…' },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', caseId);
    if (stageError) {
      logger.error('processing/regenerate', `Failed to set generazione_report for case ${caseId}`, { error: stageError.message });
      return NextResponse.json({ success: false, error: 'Errore avvio rigenerazione.' }, { status: 500 });
    }

    await inngest.send({ name: 'case/report.regenerate', data: { caseId, userId: user.id } });

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
    return NextResponse.json({ success: false, error: 'Errore rigenerazione report.' }, { status: 500 });
  }
}
