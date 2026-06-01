import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateSynthesis,
  generateSynthesisChronology,
  generateSynthesisSummary,
  shouldSplitSynthesis,
} from '@/services/synthesis/synthesis-service';
import type { SynthesisParams } from '@/services/synthesis/synthesis-service';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import { DETERMINISTIC_MARKERS, expandDeterministicBlocks } from '@/services/calculations/deterministic-tables';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { DetectedAnomaly } from '@/services/validation/anomaly-detector';
import type { MissingDocument } from '@/services/validation/missing-doc-detector';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';
import type { CaseMetadata, SynthesisStepResult, DocumentOcrContext } from './types';
import { logger } from '@/lib/logger';

/**
 * Fetch OCR text for all documents in a case.
 * Called INSIDE step functions to avoid serializing large text between steps.
 */
export async function fetchDocumentsOcrContext(caseId: string): Promise<DocumentOcrContext[]> {
  const supabase = createAdminClient();

  const { data: docs } = await supabase
    .from('documents')
    .select('id, file_name, document_type')
    .eq('case_id', caseId);

  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((d) => d.id as string);

  // Batch pages fetch to avoid PostgREST URL limit with 500+ documents
  const pages: Array<Record<string, unknown>> = [];
  const PAGE_BATCH = 200;
  for (let i = 0; i < docIds.length; i += PAGE_BATCH) {
    const { data } = await supabase
      .from('pages')
      .select('document_id, page_number, ocr_text')
      .in('document_id', docIds.slice(i, i + PAGE_BATCH))
      .order('page_number', { ascending: true });
    if (data) pages.push(...data);
  }

  if (pages.length === 0) return [];

  const pagesByDoc = new Map<string, Array<{ pageNumber: number; ocrText: string }>>();
  for (const page of pages) {
    const docId = page.document_id as string;
    if (!pagesByDoc.has(docId)) pagesByDoc.set(docId, []);
    if (page.ocr_text) {
      pagesByDoc.get(docId)!.push({
        pageNumber: page.page_number as number,
        ocrText: page.ocr_text as string,
      });
    }
  }

  const result = docs
    .map((doc) => {
      const docPages = pagesByDoc.get(doc.id) ?? [];
      const totalChars = docPages.reduce((sum, p) => sum + p.ocrText.length, 0);
      return {
        documentId: doc.id as string,
        fileName: doc.file_name as string,
        documentType: (doc.document_type ?? 'altro') as string,
        pages: docPages,
        totalChars,
      };
    })
    .filter((d) => d.pages.length > 0);

  const totalChars = result.reduce((sum, d) => sum + d.totalChars, 0);
  logger.info('pipeline', `Fetched OCR text: ${result.length} docs, ${totalChars} total chars`);
  return result;
}

/**
 * Step 7a: Calculate medico-legal periods (instant, no API call).
 */
export function calculatePeriodsStep(
  allEvents: ConsolidatedEvent[],
  caseType: CaseMetadata['caseType'],
): MedicoLegalCalculation[] {
  const calcEvents = allEvents.map((e) => ({
    event_date: e.eventDate,
    event_type: e.eventType,
    title: e.title,
    description: e.description,
  }));
  return calculateMedicoLegalPeriods(calcEvents, caseType);
}

/**
 * Build shared SynthesisParams from pipeline state.
 */
export function buildSynthesisParams(
  metadata: CaseMetadata,
  allEvents: ConsolidatedEvent[],
  anomalies: DetectedAnomaly[],
  missingDocs: MissingDocument[],
  calculations: MedicoLegalCalculation[],
  imageAnalysisResults: ImageAnalysisResult[],
  documentSummaries?: import('@/services/synthesis/document-summarizer').DocumentSummary[],
  pubmedReferences?: import('@/services/pubmed/evidence-enricher').PubMedSearchResult[],
): SynthesisParams {
  return {
    caseType: metadata.caseType,
    caseTypes: metadata.caseTypes.length > 1 ? metadata.caseTypes : undefined,
    caseRole: metadata.caseRole,
    patientInitials: metadata.patientInitials,
    events: allEvents,
    anomalies,
    missingDocuments: missingDocs,
    calculations,
    periziaMetadata: metadata.periziaMetadata,
    imageAnalysis: imageAnalysisResults.length > 0 ? imageAnalysisResults : undefined,
    documentSummaries,
    pubmedReferences: pubmedReferences && pubmedReferences.length > 0 ? pubmedReferences : undefined,
  };
}

/**
 * Step 7b: Check if split mode is needed (instant).
 */
export function checkSynthesisSplit(
  synthesisParams: SynthesisParams,
  eventCount: number,
): boolean {
  const split = shouldSplitSynthesis(synthesisParams);
  logger.info('pipeline', ` Step 7: ${eventCount} events, split: ${split}`);
  return split;
}

/**
 * Save report to DB with error handling. Throws on failure so Inngest retries.
 */
async function insertReport(
  caseId: string,
  synthesisText: string,
  wordCount: number,
  promptVersion?: string,
): Promise<SynthesisStepResult> {
  return insertReportWithMetadata(
    caseId,
    synthesisText,
    wordCount,
    promptVersion ? { promptVersion } : undefined,
  );
}

/**
 * Save report to DB with full generation metadata.
 */
async function insertReportWithMetadata(
  caseId: string,
  synthesisText: string,
  wordCount: number,
  generationMetadata?: Record<string, unknown>,
): Promise<SynthesisStepResult> {
  const supabase = createAdminClient();

  // Retry version insertion to handle concurrent race conditions
  let report: { id: string } | null = null;
  for (let versionAttempt = 0; versionAttempt < 3; versionAttempt++) {
    const { data: latestReport } = await supabase
      .from('reports')
      .select('version')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newVersion = ((latestReport?.version as number | null) ?? 0) + 1 + versionAttempt;

    const { data: inserted, error } = await supabase
      .from('reports')
      .insert({
        case_id: caseId,
        version: newVersion,
        report_status: 'bozza',
        synthesis: synthesisText,
        ...(generationMetadata ? { generation_metadata: generationMetadata } : {}),
      })
      .select('id')
      .single();

    if (!error && inserted) {
      report = inserted;
      logger.info('pipeline', `Report saved: case=${caseId} version=${newVersion} words=${wordCount} id=${inserted.id}`);
      break;
    }

    // If unique constraint violation (23505), retry with higher version
    if (error?.code === '23505') {
      logger.warn('pipeline', `Report version ${newVersion} conflict for case ${caseId}, retrying...`);
      continue;
    }

    logger.error('pipeline', `Failed to insert report for case ${caseId}`, {
      error: error?.message ?? 'No data returned',
      code: error?.code,
      synthesisLength: synthesisText?.length ?? 0,
    });
    throw new Error(`Report insert failed: ${error?.message ?? 'no data returned'}`);
  }

  if (!report) {
    throw new Error(`Report insert failed after 3 version attempts for case ${caseId}`);
  }

  return { reportId: report.id, reportVersion: 0, wordCount };
}

/**
 * Step 7c+f: Generate full synthesis AND save to DB in a single step.
 * The synthesis text stays within the step — never serialized into Inngest step output.
 * Only small metadata is returned (reportId, version, wordCount).
 * Fetches OCR text inside the step to avoid serializing large data between steps.
 */
export async function generateAndSaveReport(
  caseId: string,
  synthesisParams: SynthesisParams,
): Promise<SynthesisStepResult & { promptVersion?: string }> {
  const startMs = Date.now();

  // When document summaries are available (map-reduce mode), skip OCR fetch —
  // summaries already cover 100% of document content and are much smaller.
  // Otherwise, fetch OCR text inside this step (avoids serialization between Inngest steps).
  const hasSummaries = synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0;
  let paramsForSynthesis: SynthesisParams;
  let ocrChars: number;

  if (hasSummaries) {
    paramsForSynthesis = synthesisParams;
    ocrChars = 0;
    logger.info('pipeline', ` Using ${synthesisParams.documentSummaries!.length} document summaries (skipping OCR fetch)`);
  } else {
    const documentsOcrText = await fetchDocumentsOcrContext(caseId);
    paramsForSynthesis = { ...synthesisParams, documentsOcrText };
    ocrChars = documentsOcrText.reduce((sum, d) => sum + d.totalChars, 0);
  }

  const r = await generateSynthesis(paramsForSynthesis);
  logger.info('pipeline', ` Synthesis done in ${Date.now() - startMs}ms (${r.wordCount} words, ${r.synthesis.length} chars, OCR: ${ocrChars} chars)`);

  const generationMetadata: Record<string, unknown> = { promptVersion: r.promptVersion };
  if (r.hrs !== undefined) {
    generationMetadata.hrs = r.hrs;
    generationMetadata.hrsLevel = r.hrsLevel;
  }
  if (ocrChars > 0) {
    generationMetadata.ocrTextProvided = true;
    generationMetadata.ocrTotalChars = ocrChars;
  }
  if (synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0) {
    generationMetadata.useDocumentSummaries = true;
    generationMetadata.documentSummaryCount = synthesisParams.documentSummaries.length;
  }

  // HARD FILTER: Strip hallucinated image references
  const realPaths = new Set(
    (synthesisParams.imageAnalysis ?? []).filter((img) => img.storagePath).map((img) => img.storagePath!),
  );
  const cleanSynthesis = r.synthesis.replace(
    /!\[[^\]]*\]\(ocr-image:([^)]+)\)\n*/g,
    (match, path) => realPaths.has(path) ? match : '',
  );

  const result = await insertReportWithMetadata(caseId, cleanSynthesis, r.wordCount, generationMetadata);
  return { ...result, promptVersion: r.promptVersion, usage: r.usage };
}

/**
 * Step 7d: Generate chronology part (large case, split mode).
 * Returns chronology text — stored in Inngest step output for use by next step.
 * Fetches OCR text inside the step for faithful transcription.
 */
export async function generateChronologyPart(
  caseId: string,
  synthesisParams: SynthesisParams,
): Promise<{ chronology: string; ocrTotalChars: number; usage?: import('@/services/cost-tracking/cost-calculator').TokenUsage }> {
  const startMs = Date.now();

  // When document summaries are available (map-reduce mode), skip OCR fetch —
  // summaries replace OCR text in the prompt.
  const hasSummaries = synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0;
  let paramsForChronology: SynthesisParams;
  let ocrTotalChars: number;

  if (hasSummaries) {
    paramsForChronology = synthesisParams;
    ocrTotalChars = 0;
    logger.info('pipeline', ` Chronology: using ${synthesisParams.documentSummaries!.length} document summaries (skipping OCR fetch)`);
  } else {
    const documentsOcrText = await fetchDocumentsOcrContext(caseId);
    paramsForChronology = { ...synthesisParams, documentsOcrText };
    ocrTotalChars = documentsOcrText.reduce((sum, d) => sum + d.totalChars, 0);
  }

  const { chronology, usage } = await generateSynthesisChronology(paramsForChronology);
  logger.info('pipeline', ` Chronology done in ${Date.now() - startMs}ms (${chronology.length} chars, OCR: ${ocrTotalChars} chars)`);
  return { chronology, ocrTotalChars, usage };
}

/**
 * Step 7e+f: Generate summary part AND save to DB in a single step.
 * The final synthesis text stays within the step.
 */
export async function generateSummaryAndSaveReport(
  caseId: string,
  synthesisParams: SynthesisParams,
  chronology: string,
  ocrTotalChars?: number,
): Promise<SynthesisStepResult & { promptVersion?: string }> {
  const startMs = Date.now();
  const r = await generateSynthesisSummary({ ...synthesisParams, chronology });
  logger.info('pipeline', ` Summary done in ${Date.now() - startMs}ms (${r.wordCount} words, ${r.synthesis.length} chars)`);

  const generationMetadata: Record<string, unknown> = { promptVersion: r.promptVersion };
  if (r.hrs !== undefined) {
    generationMetadata.hrs = r.hrs;
    generationMetadata.hrsLevel = r.hrsLevel;
  }
  if (ocrTotalChars && ocrTotalChars > 0) {
    generationMetadata.ocrTextProvided = true;
    generationMetadata.ocrTotalChars = ocrTotalChars;
  }
  if (synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0) {
    generationMetadata.useDocumentSummaries = true;
    generationMetadata.documentSummaryCount = synthesisParams.documentSummaries.length;
  }

  // HARD FILTER: Strip hallucinated image references
  const realPaths2 = new Set(
    (synthesisParams.imageAnalysis ?? []).filter((img) => img.storagePath).map((img) => img.storagePath!),
  );
  const cleanSynthesis = r.synthesis.replace(
    /!\[[^\]]*\]\(ocr-image:([^)]+)\)\n*/g,
    (match, path) => realPaths2.has(path) ? match : '',
  );

  const result = await insertReportWithMetadata(caseId, cleanSynthesis, r.wordCount, generationMetadata);
  return { ...result, promptVersion: r.promptVersion, usage: r.usage };
}

// Keep for backward compatibility but mark as deprecated
export { insertReport as saveReportStep };

// ── Sectional report generation ─────────────────────────────────────

import { resolveSectionPlan } from '@/services/synthesis/section-catalog';
import { generateSingleSection } from '@/services/synthesis/section-generator';
import { computeSectionalPromptVersion } from './prompt-version-sectional';
import { validateReport, getBlockingIssues } from '@/services/synthesis/report-validator';
import type { ReportValidationContext } from '@/services/synthesis/report-validator';
import { computeHrs, getHrsLevel } from '@/services/synthesis/hallucination-risk-scorer';
import type { SectionSpec, GeneratedSection, SectionContext } from '@/services/synthesis/section-generation-types';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { createEmptyUsage, mergeUsage } from '@/services/cost-tracking/cost-calculator';

/** Escape special regex characters in a string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Plan which sections to generate based on case metadata.
 * Returns serializable SectionSpec array for Inngest step output.
 * @param documentTypes - actual document types from classification (NOT event sourceTypes)
 */
export function planReportSections(
  metadata: CaseMetadata,
  allEvents: ConsolidatedEvent[],
  documentTypes: string[],
): SectionSpec[] {

  const plan = resolveSectionPlan({
    caseType: metadata.caseType,
    caseTypes: metadata.caseTypes.length > 1 ? metadata.caseTypes : undefined,
    caseRole: metadata.caseRole,
    periziaMetadata: metadata.periziaMetadata,
    events: allEvents,
    documentTypes,
    moduleId: metadata.moduleId,
  });

  logger.info('pipeline', `Section plan: ${plan.length} sections [${plan.map((s) => s.id).join(', ')}]`);
  return plan;
}

/**
 * Generate a single section inside an Inngest step.
 * Fetches OCR text from DB if needed (avoids serialization between steps).
 */
/** Section ids whose perito-filled placeholder should be pre-populated with the
 * computed graduated ITT/ITP table. For CTU/CTP the danno biologico temporaneo
 * lives in `considerazioni_ml` (a placeholder), so without this the A2 table
 * would never reach the report body — only the events-tab UI. */
const ITT_ITP_PLACEHOLDER_SECTIONS = new Set(['considerazioni_ml']);

/**
 * A2 + B3: build placeholder content, embedding the ITT/ITP DETERMINISTIC
 * SENTINEL for sections where the perito assesses temporary disability. The
 * sentinel is expanded at read time (UI + export) from the CURRENT events, so
 * the table is ALWAYS in sync — if the perito later corrects an event, the
 * table updates by itself, no regeneration. The arithmetic is a proposal to
 * verify; the medico-legal judgment stays the perito's.
 */
export function buildPlaceholderContent(spec: SectionSpec): string {
  const base = spec.placeholderText ?? '';
  if (!ITT_ITP_PLACEHOLDER_SECTIONS.has(spec.id)) {
    return base;
  }
  return `${base}\n\n**Periodi di invalidità temporanea (proposta automatica — il perito verifica e corregge):**\n\n${DETERMINISTIC_MARKERS.ITT_ITP}`;
}

export async function generateSectionStep(
  caseId: string,
  spec: SectionSpec,
  synthesisParams: SynthesisParams,
  previousContext: SectionContext[],
): Promise<GeneratedSection> {
  // Placeholder sections emit static text — no LLM call needed.
  if (spec.isPlaceholder) {
    return {
      id: spec.id,
      title: spec.title,
      content: buildPlaceholderContent(spec),
      contextSummary: '',
      wordCount: 0,
    };
  }

  // Fetch OCR text inside the step if this section needs it
  let documentsOcrText: DocumentOcrContext[] | undefined;
  if (spec.needsOcr) {
    const hasSummaries = synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0;
    if (!hasSummaries) {
      documentsOcrText = await fetchDocumentsOcrContext(caseId);
    }
  }

  return generateSingleSection({
    spec,
    synthesisParams,
    previousContext,
    documentsOcrText,
  });
}

/**
 * Assemble all generated sections into a final report and save to DB.
 * No LLM call — pure assembly + validation + DB insert.
 */
export async function assembleSectionsAndSaveReport(
  caseId: string,
  sections: GeneratedSection[],
  synthesisParams: SynthesisParams,
): Promise<SynthesisStepResult & { promptVersion?: string }> {
  // Assemble full report markdown
  // Strip any duplicate ## heading the LLM may have generated despite instructions
  const reportParts = sections.map((s) => {
    const headingPattern = new RegExp(`^##\\s+${escapeRegex(s.title)}\\s*\\n+`, 'i');
    const cleanContent = s.content.replace(headingPattern, '').trim();
    return `## ${s.title}\n\n${cleanContent}`;
  });
  let fullReport = reportParts.join('\n\n');

  // HARD FILTER: Strip hallucinated image references.
  // Build set of REAL image paths from imageAnalysis results.
  // Any ocr-image: reference NOT in this set is hallucinated and gets stripped.
  const realImagePaths = new Set(
    (synthesisParams.imageAnalysis ?? [])
      .filter((img) => img.storagePath)
      .map((img) => img.storagePath!),
  );
  fullReport = fullReport.replace(
    /!\[[^\]]*\]\(ocr-image:([^)]+)\)\n*/g,
    (match, path) => {
      if (realImagePaths.has(path)) return match; // Real image — keep
      logger.warn('pipeline', `Stripped hallucinated image ref: ocr-image:${path}`);
      return ''; // Hallucinated — remove
    },
  );

  // Wave 3.3 — Source attribution appendix: append a "## Riferimenti
  // Documentali" section listing each unique document cited in the report.
  // This gives the perito a quick index of the source events without changing
  // the body of the report. Uses date-based matching against synthesisParams.events.
  const appendix = buildDocumentReferencesAppendix(fullReport, synthesisParams.events);
  if (appendix) {
    fullReport = `${fullReport}\n\n${appendix}`;
  }

  const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);

  // Compute prompt version from section system prompts
  const promptVersion = computeSectionalPromptVersion({
    caseType: synthesisParams.caseType,
    caseRole: synthesisParams.caseRole,
    caseTypes: synthesisParams.caseTypes,
    sectionIds: sections.map((s) => s.id),
  });

  // Validate assembled report. A3: pass the assembled section titles as
  // role-mandatory sections so an empty/failed section blocks the save.
  const validationContext: ReportValidationContext = {
    events: synthesisParams.events.map((e) => ({ orderNumber: e.orderNumber, eventDate: e.eventDate })),
    calculations: synthesisParams.calculations?.map((c) => ({ label: c.label, value: c.value, days: c.days })),
    requiredSectionTitles: sections.map((s) => s.title),
  };

  // Valida il report ESPANSO: i marker deterministici (ITT/ITP, spese, cronologia)
  // si espandono in tabelle con contenuto reale solo at-read-time. Un report molto
  // ridotto (selettore sezioni) ha pochi "parole" in forma grezza ma supera la soglia
  // una volta espanso → evitiamo il falso "report troppo corto" (e il retry Inngest).
  // NB: salviamo comunque `fullReport` GREZZO (marker intatti) → l'espansione resta
  // dinamica a read-time (ITT/ITP/spese sempre in sync con gli eventi correnti).
  const validationEvents = synthesisParams.events.map((e) => ({
    event_date: e.eventDate,
    event_type: e.eventType,
    title: e.title,
    description: e.description,
  }));
  const reportForValidation = expandDeterministicBlocks(fullReport, validationEvents);
  const validation = validateReport(reportForValidation, synthesisParams.events.length, validationContext);
  if (validation.issues.length > 0) {
    const errors = validation.issues.filter((i) => i.severity === 'error');
    const warnings = validation.issues.filter((i) => i.severity === 'warning');
    if (errors.length > 0) {
      logger.warn('pipeline', `Sectional report validation errors: ${errors.map((e) => e.message).join('; ')}`);
    }
    if (warnings.length > 0) {
      logger.info('pipeline', `Sectional report validation warnings: ${warnings.map((w) => w.message).join('; ')}`);
    }

    // A3: block saving for all blocking-policy errors (centralized in
    // report-validator.ts). Includes required-section-missing, coverage floor,
    // sentinel dates, broken OCR markers, header mismatch/fabrication.
    const criticalErrors = getBlockingIssues(validation);
    if (criticalErrors.length > 0) {
      throw new Error(
        `Report non valido: ${criticalErrors.map((e) => e.message).join('; ')}. ` +
        `Inngest riprovera la generazione.`,
      );
    }
  }

  // Merge all token usage
  let totalUsage: TokenUsage = createEmptyUsage();
  for (const section of sections) {
    if (section.usage) {
      totalUsage = mergeUsage(totalUsage, section.usage);
    }
  }

  // Compute Hallucination Risk Score (informational, doesn't block save)
  const hrs = computeHrs(validation);
  const hrsLevel = getHrsLevel(hrs);

  // Surface CoVe bypass failures so the perito can see "verifier did not run".
  const coveBypassed = sections
    .filter((s) => s.coveBypassedDueToLlmFailure === true)
    .map((s) => ({ id: s.id, reason: s.coveFailureReason ?? 'unknown' }));

  // Build generation metadata
  const generationMetadata: Record<string, unknown> = {
    promptVersion,
    generationMode: 'sectional',
    sectionCount: sections.length,
    sectionIds: sections.map((s) => s.id),
    sectionWordCounts: Object.fromEntries(sections.map((s) => [s.id, s.wordCount])),
    eventCoverage: Math.round(validation.eventCoverage),
    hrs,
    hrsLevel,
    issueCount: validation.issues.length,
    issuesByType: Object.fromEntries(
      Array.from(
        validation.issues.reduce((acc, i) => {
          acc.set(i.type, (acc.get(i.type) ?? 0) + 1);
          return acc;
        }, new Map<string, number>()),
      ),
    ),
    ...(coveBypassed.length > 0 ? { coveBypassed } : {}),
  };

  if (coveBypassed.length > 0) {
    logger.error(
      'pipeline',
      `CoVe bypassed for ${coveBypassed.length} section(s): ${coveBypassed.map((b) => `${b.id} (${b.reason})`).join(', ')}. Sections saved without verification.`,
    );
  }

  logger.info('pipeline',
    `Assembled report: ${sections.length} sections, ${totalWordCount} words, ` +
    `${fullReport.length} chars, coverage: ${Math.round(validation.eventCoverage)}%, hrs: ${hrs} (${hrsLevel})`,
  );

  const result = await insertReportWithMetadata(caseId, fullReport, totalWordCount, generationMetadata);
  return { ...result, promptVersion, usage: totalUsage };
}

// ── Wave 3.3 helpers — source-attribution appendix ────────────────────

/**
 * Build a "## Riferimenti Documentali" appendix listing each unique
 * (date, event title) pair cited in the report. Matches the same date
 * patterns used elsewhere (DD/MM/YYYY, DD.MM.YYYY) and dedupes results.
 *
 * Returns empty string if no events or no date citations are found.
 */
function buildDocumentReferencesAppendix(
  report: string,
  events: ConsolidatedEvent[],
): string {
  if (events.length === 0) return '';

  // Index events by ISO and DD/MM/YYYY date
  const eventsByDate = new Map<string, ConsolidatedEvent[]>();
  for (const e of events) {
    if (!e.eventDate || e.eventDate === '1900-01-01') continue;
    const iso = e.eventDate;
    const parts = iso.split('-');
    if (parts.length !== 3) continue;
    const dmy = `${parts[2]}/${parts[1]}/${parts[0]}`;
    const dmyDot = `${parts[2]}.${parts[1]}.${parts[0]}`;
    for (const key of [iso, dmy, dmyDot]) {
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key)!.push(e);
    }
  }

  // Find date references in the report
  const dateRegex = /\b(\d{2})[./](\d{2})[./](\d{4})\b/g;
  const referencedOrderNumbers = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = dateRegex.exec(report)) !== null) {
    const slash = `${match[1]}/${match[2]}/${match[3]}`;
    const dot = `${match[1]}.${match[2]}.${match[3]}`;
    const matched = eventsByDate.get(slash) ?? eventsByDate.get(dot);
    if (matched) {
      for (const e of matched) referencedOrderNumbers.add(e.orderNumber);
    }
  }

  if (referencedOrderNumbers.size === 0) return '';

  // Render appendix
  const cited = events
    .filter((e) => referencedOrderNumbers.has(e.orderNumber))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const lines: string[] = ['## Riferimenti Documentali', ''];
  lines.push(
    '_Indice degli eventi documentali citati nel report. Ogni riga riporta data, tipo di evento e titolo come risulta dal documento sorgente. Numero progressivo e ID interno tra parentesi per la tracciabilità._',
  );
  lines.push('');
  for (const e of cited) {
    const isoDate = e.eventDate;
    const parts = isoDate.split('-');
    const display = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : isoDate;
    lines.push(`- **${display}** — ${e.eventType}: ${e.title} _(ev. #${e.orderNumber})_`);
  }
  return lines.join('\n');
}
