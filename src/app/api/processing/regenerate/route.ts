import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { resolveAnomalies, filterUnresolvedAnomalies } from '@/services/validation/anomaly-resolver';
import type { OcrPageFetcher } from '@/services/validation/anomaly-resolver';
import { generateSynthesis } from '@/services/synthesis/synthesis-service';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import { safeJsonParse } from '@/lib/format';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import { validateCsrfToken } from '@/lib/csrf';
import { checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // synthesis can take several minutes

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
      .select('id, case_type, case_types, case_role, patient_initials, perizia_metadata')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseRow) {
      return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
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

    // Delete old anomalies and missing docs
    await admin.from('anomalies').delete().eq('case_id', caseId);
    await admin.from('missing_documents').delete().eq('case_id', caseId);

    // Re-detect anomalies
    const rawAnomalies = detectAnomalies(events);
    if (rawAnomalies.length > 0) {
      await admin.from('anomalies').insert(
        rawAnomalies.map((a) => ({
          case_id: caseId,
          anomaly_type: a.anomalyType,
          severity: a.severity,
          description: a.description,
          involved_events: JSON.stringify(a.involvedEvents),
          suggestion: a.suggestion,
        })),
      );
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

    const resolvedAnomalies = await resolveAnomalies(rawAnomalies, events, fetchOcrPages);

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
      const resolutionNote = r.resolution.resolved
        ? `Risolta automaticamente (confidenza: ${Math.round(r.resolution.confidence * 100)}%). Evidenza: ${r.resolution.evidence}`
        : `Confermata dopo verifica OCR (confidenza: ${Math.round(r.resolution.confidence * 100)}%). ${r.resolution.reasoning}`;
      await admin.from('anomalies').update({
        status,
        resolution_note: resolutionNote,
        resolved_at: r.resolution.resolved ? new Date().toISOString() : null,
      }).eq('id', anomalyRow.id);
    }

    const anomalies = filterUnresolvedAnomalies(resolvedAnomalies);

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
      await admin.from('missing_documents').insert(
        missingDocs.map((m) => ({
          case_id: caseId,
          document_name: m.documentName,
          reason: m.reason,
          related_event: m.relatedEvent,
        })),
      );
    }

    // Calculate medico-legal periods for report integration
    const calcEvents = events.map((e) => ({
      event_date: e.eventDate,
      event_type: e.eventType,
      title: e.title,
      description: e.description,
    }));
    const calculations = calculateMedicoLegalPeriods(calcEvents);

    // Regenerate synthesis with role-adaptive prompts + calculations
    const result = await generateSynthesis({
      caseType: caseRow.case_type as CaseType,
      caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
      caseRole: caseRow.case_role as CaseRole,
      patientInitials: caseRow.patient_initials as string | null,
      events,
      anomalies,
      missingDocuments: missingDocs,
      calculations,
      periziaMetadata: (caseRow.perizia_metadata ?? undefined) as PeriziaMetadata | undefined,
    });

    // Get current max version
    const { data: latestReport } = await admin
      .from('reports')
      .select('version')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newVersion = (latestReport?.version ?? 0) + 1;

    await admin.from('reports').insert({
      case_id: caseId,
      version: newVersion,
      report_status: 'bozza',
      synthesis: result.synthesis,
      generation_metadata: { promptVersion: result.promptVersion },
    });

    // Audit log
    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'report.regenerated',
      entity_type: 'report',
      entity_id: caseId,
      metadata: {
        version: newVersion,
        eventsCount: events.length,
        anomaliesCount: anomalies.length,
        missingDocsCount: missingDocs.length,
        wordCount: result.wordCount,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        version: newVersion,
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
