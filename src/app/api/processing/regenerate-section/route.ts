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
import { parseSynthesisSections } from '@/services/synthesis/section-parser';
import { fetchDocumentsOcrContext } from '@/inngest/steps/generate-report';
import { validateCsrfToken } from '@/lib/csrf';
import { deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { getSectionStatus, markSectionState } from '@/lib/section-state';
import type { ReportGenerationMetadata } from '@/db/schema/reports';
import { logger } from '@/lib/logger';

export const maxDuration = 800; // section regeneration needs margin for LLM timeout + retries

const requestSchema = z.object({
  caseId: z.string().uuid(),
  sectionId: z.string().min(1).max(50), // canonical section id
  instruction: z.string().max(500).optional(),
  /** Overwrite an edited/locked section after explicit user confirmation. */
  force: z.boolean().optional(),
  /** documentazione_sanitaria: generate the LLM-"elaborated" variant on demand
   * (default is the deterministic verbatim placeholder). */
  elaborated: z.boolean().optional(),
  /** documentazione_sanitaria: generate the LLM-"selective" variant — narrative
   * that quotes significant findings verbatim and paraphrases routine content,
   * with each quote hard-verified against the OCR. */
  selective: z.boolean().optional(),
  /** Optimistic concurrency: the report version the client is acting on. */
  expectedVersion: z.number().int().optional(),
});

/**
 * POST /api/processing/regenerate-section
 * Regenerate a single section of the report.
 * Preserves all other sections, creates a new version.
 */
export async function POST(request: NextRequest) {
  // Track userId outside try for refund in catch
  let authenticatedUserId: string | null = null;
  let creditsDeducted = false;

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
    authenticatedUserId = user.id;

    // Rate limit BEFORE credit deduction — don't charge for rate-limited requests
    // Use API limit (60/min) not PROCESSING (5/min) — user may regenerate many sections
    const rateCheck = await checkRateLimit({
      key: `regen-section:${user.id}`,
      ...RATE_LIMITS.API,
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

    const { caseId, sectionId, instruction, force, expectedVersion, elaborated, selective } = parsed.data;

    // Verify ownership + get case metadata
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, case_type, case_types, case_role, patient_initials, perizia_metadata, module_id')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseRow) {
      return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
    }

    // rc-mvp: solo perizia RC stragiudiziale — le sezioni dei report legacy
    // CTU/CTP non si rigenerano qui: la spec verrebbe risolta sul catalogo RC
    // sbagliato (fail-fast PRIMA di scalare crediti, review 2026-07-03).
    if (((caseRow.case_role as string | null) ?? 'stragiudiziale') !== 'stragiudiziale') {
      return NextResponse.json(
        { success: false, error: 'Questo caso è di tipo CTU/CTP (legacy): la rigenerazione di sezione non è disponibile nell\'MVP RC.' },
        { status: 400 },
      );
    }

    // Get current report (incl. per-section state)
    const { data: currentReport } = await admin
      .from('reports')
      .select('id, version, synthesis, generation_metadata')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentReport?.synthesis) {
      return NextResponse.json({ success: false, error: 'Nessun report esistente' }, { status: 400 });
    }

    // Protect the perito's work: never silently overwrite an edited/locked
    // section. Return blocked → the client asks for explicit confirmation.
    // This runs BEFORE deductCredits so a blocked regen is never charged.
    const currentMetadata = (currentReport.generation_metadata ?? null) as ReportGenerationMetadata | null;
    const sectionStatus = getSectionStatus(currentMetadata, sectionId);
    if ((sectionStatus === 'edited' || sectionStatus === 'locked') && !force) {
      const title = parseSynthesisSections(currentReport.synthesis as string)
        .find((s) => s.id === sectionId)?.title ?? sectionId;
      return NextResponse.json({ success: false, blocked: true, reason: sectionStatus, sectionTitle: title });
    }

    // Optimistic concurrency: reject if a newer version exists than the client saw.
    if (typeof expectedVersion === 'number' && (currentReport.version as number) !== expectedVersion) {
      return NextResponse.json(
        { success: false, error: 'Il report è stato modificato da un\'altra operazione. Ricarica la pagina e riprova.' },
        { status: 409 },
      );
    }

    // Credit check — AFTER block/version checks so a blocked regen is never charged.
    const deduction = await deductCredits(
      user.id,
      CREDIT_COSTS.rigenerazione_sezione,
      'rigenerazione_sezione',
    );
    if (!deduction.success) {
      return NextResponse.json(
        { success: false, error: deduction.error },
        { status: 402 },
      );
    }
    creditsDeducted = true;

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

    // Compute context data. FIX: passare caseType così il sequence-validator
    // (gated su caseType) gira ANCHE in rigenerazione di sezione → le anomalie di
    // sequenza temporale non spariscono dopo un re-run.
    const anomalies = detectAnomalies(events, {
      caseType: caseRow.case_type as CaseType,
      caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
    });
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

    // Fetch OCR text for faithful transcription
    const documentsOcrText = await fetchDocumentsOcrContext(caseId);

    // Re-feed persisted diagnostic-image analyses so regenerating a section
    // (e.g. doc-sanitaria) re-embeds its images instead of dropping them. Reports
    // generated BEFORE imageAnalysis was persisted (legacy) have none → re-run
    // Pixtral ONCE, gated to sections that actually use images (no Pixtral cost on
    // text-only sections). The recomputed set is persisted below so later regens
    // skip it (parity col fallback del full-regenerate).
    let imageAnalysis: ReportGenerationMetadata['imageAnalysis'] | undefined = currentMetadata?.imageAnalysis ?? undefined;
    const sectionUsesImages = sectionId === 'documentazione_sanitaria' && (elaborated || selective);
    // Fallback Pixtral SOLO per i report PRE-fix (chiave imageAnalysis ASSENTE), come il
    // full-regenerate (key-presence, non length): un report post-fix SENZA immagini ha la
    // chiave = [] e NON deve ri-eseguire analyzeDiagnosticImagesStep ad ogni rigenerazione.
    const hasImageAnalysisKey = currentMetadata != null && 'imageAnalysis' in currentMetadata;
    if (!hasImageAnalysisKey && sectionUsesImages) {
      const { analyzeDiagnosticImagesStep } = await import('@/inngest/steps/link-images');
      const { imageAnalysisForMetadata } = await import('@/inngest/steps/generate-report');
      imageAnalysis = imageAnalysisForMetadata(await analyzeDiagnosticImagesStep(caseId, caseRow.case_type as CaseType));
    }

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
      documentsOcrText,
      moduleId: (caseRow.module_id ?? undefined) as string | undefined,
      patientInitials: (caseRow.patient_initials ?? null) as string | null,
      imageAnalysis,
      elaborated,
      selective,
    });

    // #2/B3 (audit 2026-06-09): regenerateSection ritorna il synthesis INVARIATO
    // quando una doc-sanitaria in variante AI materializzata viene rigenerata in
    // modo GENERICO (dal pannello "scegli cosa rigenerare", senza flag selective/
    // elaborated) — per non sovrascriverla col verbatim deterministico. Ma il
    // credito è già stato detratto: senza questo guard salveremmo una versione
    // byte-identica, azzereremmo il banner "da aggiornare" e diremmo "fatto",
    // ingannando il perito e addebitando un no-op. Quindi: rimborsa, NON inserire
    // / NON resettare lo stato, e spiega come aggiornarla davvero.
    if (updatedSynthesis === (currentReport.synthesis as string)) {
      if (authenticatedUserId && creditsDeducted) {
        await refundCredits(authenticatedUserId, CREDIT_COSTS.rigenerazione_sezione, 'rigenerazione_sezione', undefined, {
          reason: 'regeneration_noop',
        });
      }
      return NextResponse.json({
        success: false,
        unchanged: true,
        error: 'Nessuna modifica applicata: la sezione è già aggiornata. Se è la documentazione sanitaria in variante AI, aprila e usa le opzioni "Variante AI" (selettiva o integrale) per rigenerarla. Nessun credito è stato addebitato.',
      });
    }

    // Save as new version. Preserve the whole generation_metadata (per-section
    // state, promptVersion, HRS, …) — previously this was dropped on every
    // regeneration — and reset ONLY the regenerated section to 'auto'.
    const newVersion = ((currentReport.version as number) ?? 0) + 1;
    const baseMetadata = markSectionState(currentMetadata, sectionId, () => ({ status: 'auto' }))
      ?? currentMetadata ?? undefined;
    // Baseline del diff bozza→firmato: la sezione rigenerata è NUOVA bozza AI →
    // aggiorna originalSynthesis per quella sola sezione (le altre restano la
    // baseline della generazione precedente, gli edit del perito non vi entrano).
    let metadataWithBaseline = baseMetadata;
    const previousOriginal = (currentMetadata as { originalSynthesis?: string } | null)?.originalSynthesis;
    if (previousOriginal && metadataWithBaseline) {
      const { parseSections, replaceSectionContent } = await import('@/lib/section-parser-client');
      const regenerated = parseSections(updatedSynthesis).find((s) => s.canonicalId === sectionId);
      const originalTarget = parseSections(previousOriginal).find((s) => s.canonicalId === sectionId);
      if (regenerated && originalTarget) {
        metadataWithBaseline = {
          ...metadataWithBaseline,
          originalSynthesis: replaceSectionContent(previousOriginal, originalTarget.id, regenerated.content),
        };
      }
    }
    // Persist a freshly-recomputed imageAnalysis (legacy-report fallback) so later
    // regenerations skip Pixtral.
    const newMetadata = (imageAnalysis && imageAnalysis.length > 0)
      ? { ...(metadataWithBaseline ?? {}), imageAnalysis }
      : metadataWithBaseline;

    const { error: insertError } = await admin.from('reports').insert({
      case_id: caseId,
      version: newVersion,
      report_status: 'bozza',
      synthesis: updatedSynthesis,
      ...(newMetadata ? { generation_metadata: newMetadata } : {}),
    });

    if (insertError) {
      logger.error('processing/regenerate-section', `Report INSERT failed for case ${caseId}`, {
        error: insertError.message,
        code: insertError.code,
      });
      return NextResponse.json({ success: false, error: 'Errore salvataggio report.' }, { status: 500 });
    }

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

    // Refund credits on failure
    if (authenticatedUserId && creditsDeducted) {
      await refundCredits(authenticatedUserId, CREDIT_COSTS.rigenerazione_sezione, 'rigenerazione_sezione', undefined, {
        reason: 'regeneration_failed',
      });
    }

    return NextResponse.json({ success: false, error: 'Errore rigenerazione sezione. Il credito è stato rimborsato.' }, { status: 500 });
  }
}
