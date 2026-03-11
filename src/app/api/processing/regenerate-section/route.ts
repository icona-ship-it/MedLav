import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import { safeJsonParse } from '@/lib/format';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import { regenerateSection } from '@/services/synthesis/section-regenerator';
import { validateCsrfToken } from '@/lib/csrf';
import { checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // section regeneration can take several minutes

const requestSchema = z.object({
  caseId: z.string().uuid(),
  sectionId: z.string().min(1).max(50),
  instruction: z.string().max(500).optional(),
});

/**
 * POST /api/processing/regenerate-section
 * Regenerate a single section of the report.
 * Preserves all other sections, creates a new version.
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

    // Feature gate: check subscription allows section regeneration
    const gate = await checkFeatureAccess(user.id, 'section_regenerate');
    if (!gate.allowed) {
      return NextResponse.json(
        { success: false, error: gate.reason ?? 'Funzionalità non disponibile nel piano attuale. Passa a Pro.' },
        { status: 403 },
      );
    }

    const rateCheck = await checkRateLimit({
      key: `regen-section:${user.id}`,
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
      return NextResponse.json({ success: false, error: 'Parametri non validi' }, { status: 400 });
    }

    const { caseId, sectionId, instruction } = parsed.data;

    // Verify ownership + get case metadata
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, case_type, case_types, case_role, patient_initials, perizia_metadata')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseRow) {
      return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
    }

    // Get current report
    const { data: currentReport } = await admin
      .from('reports')
      .select('id, version, synthesis')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentReport?.synthesis) {
      return NextResponse.json({ success: false, error: 'Nessun report esistente' }, { status: 400 });
    }

    // Fetch events
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

    // Build caseTypes: use case_types if available, fallback to [case_type]
    const rawCaseTypes = caseRow.case_types as string[] | null;
    const caseTypes: CaseType[] = rawCaseTypes && rawCaseTypes.length > 0
      ? rawCaseTypes as CaseType[]
      : [caseRow.case_type as CaseType];

    // Compute context data
    const anomalies = detectAnomalies(events);
    const missingDocs = detectMissingDocuments({
      events,
      caseType: caseRow.case_type as CaseType,
      caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
    });
    const calcEvents = events.map((e) => ({
      event_date: e.eventDate,
      event_type: e.eventType,
      title: e.title,
      description: e.description,
    }));
    const calculations = calculateMedicoLegalPeriods(calcEvents);

    // Regenerate the section
    const updatedSynthesis = await regenerateSection({
      sectionId,
      currentSynthesis: currentReport.synthesis as string,
      caseType: caseRow.case_type as CaseType,
      caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
      caseRole: caseRow.case_role as CaseRole,
      events,
      anomalies,
      missingDocuments: missingDocs,
      calculations,
      userInstruction: instruction,
      periziaMetadata: (caseRow.perizia_metadata ?? undefined) as PeriziaMetadata | undefined,
    });

    // Save as new version
    const newVersion = ((currentReport.version as number) ?? 0) + 1;

    await admin.from('reports').insert({
      case_id: caseId,
      version: newVersion,
      report_status: 'bozza',
      synthesis: updatedSynthesis,
    });

    // Audit log
    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'report.section_regenerated',
      entity_type: 'report',
      entity_id: caseId,
      metadata: {
        sectionId,
        instruction: instruction ?? null,
        version: newVersion,
      },
    });

    const wordCount = updatedSynthesis.split(/\s+/).filter((w) => w.length > 0).length;

    return NextResponse.json({
      success: true,
      data: { version: newVersion, wordCount, sectionId },
    });
  } catch (error) {
    logger.error('processing/regenerate-section', 'Section regeneration failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ success: false, error: 'Errore rigenerazione sezione.' }, { status: 500 });
  }
}
