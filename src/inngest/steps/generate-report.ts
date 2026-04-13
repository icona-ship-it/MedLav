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
  if (ocrChars > 0) {
    generationMetadata.ocrTextProvided = true;
    generationMetadata.ocrTotalChars = ocrChars;
  }
  if (synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0) {
    generationMetadata.useDocumentSummaries = true;
    generationMetadata.documentSummaryCount = synthesisParams.documentSummaries.length;
  }

  // HARD FILTER: Strip hallucinated image references if no real images
  let cleanSynthesis = r.synthesis;
  const hasImages = synthesisParams.imageAnalysis && synthesisParams.imageAnalysis.length > 0;
  if (!hasImages) {
    cleanSynthesis = cleanSynthesis.replace(/!\[[^\]]*\]\(ocr-image:[^)]+\)\n*/g, '');
  }

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
  if (ocrTotalChars && ocrTotalChars > 0) {
    generationMetadata.ocrTextProvided = true;
    generationMetadata.ocrTotalChars = ocrTotalChars;
  }
  if (synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0) {
    generationMetadata.useDocumentSummaries = true;
    generationMetadata.documentSummaryCount = synthesisParams.documentSummaries.length;
  }

  // HARD FILTER: Strip hallucinated image references if no real images
  let cleanSynthesis = r.synthesis;
  const hasImgs = synthesisParams.imageAnalysis && synthesisParams.imageAnalysis.length > 0;
  if (!hasImgs) {
    cleanSynthesis = cleanSynthesis.replace(/!\[[^\]]*\]\(ocr-image:[^)]+\)\n*/g, '');
  }

  const result = await insertReportWithMetadata(caseId, cleanSynthesis, r.wordCount, generationMetadata);
  return { ...result, promptVersion: r.promptVersion, usage: r.usage };
}

// Keep for backward compatibility but mark as deprecated
export { insertReport as saveReportStep };

// ── Sectional report generation ─────────────────────────────────────

import { resolveSectionPlan } from '@/services/synthesis/section-catalog';
import { generateSingleSection } from '@/services/synthesis/section-generator';
import { computeSectionalPromptVersion } from './prompt-version-sectional';
import { validateReport } from '@/services/synthesis/report-validator';
import type { ReportValidationContext } from '@/services/synthesis/report-validator';
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
export async function generateSectionStep(
  caseId: string,
  spec: SectionSpec,
  synthesisParams: SynthesisParams,
  previousContext: SectionContext[],
): Promise<GeneratedSection> {
  // Placeholder sections emit static text — no LLM call needed
  if (spec.isPlaceholder) {
    return {
      id: spec.id,
      title: spec.title,
      content: spec.placeholderText ?? '',
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
  // If no real images were provided to the LLM (imageAnalysis empty),
  // remove ALL ![...](ocr-image:...) — they are 100% hallucinated.
  const hasRealImages = synthesisParams.imageAnalysis && synthesisParams.imageAnalysis.length > 0;
  if (!hasRealImages) {
    const before = fullReport;
    fullReport = fullReport.replace(/!\[[^\]]*\]\(ocr-image:[^)]+\)\n*/g, '');
    const stripped = before.length - fullReport.length;
    if (stripped > 0) {
      logger.warn('pipeline', `Stripped ${stripped} chars of hallucinated image references (no real images available)`);
    }
  }

  const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);

  // Compute prompt version from section system prompts
  const promptVersion = computeSectionalPromptVersion({
    caseType: synthesisParams.caseType,
    caseRole: synthesisParams.caseRole,
    caseTypes: synthesisParams.caseTypes,
    sectionIds: sections.map((s) => s.id),
  });

  // Validate assembled report
  const validationContext: ReportValidationContext = {
    events: synthesisParams.events.map((e) => ({ orderNumber: e.orderNumber, eventDate: e.eventDate })),
    calculations: synthesisParams.calculations?.map((c) => ({ label: c.label, value: c.value, days: c.days })),
  };

  const validation = validateReport(fullReport, synthesisParams.events.length, validationContext);
  if (validation.issues.length > 0) {
    const errors = validation.issues.filter((i) => i.severity === 'error');
    const warnings = validation.issues.filter((i) => i.severity === 'warning');
    if (errors.length > 0) {
      logger.warn('pipeline', `Sectional report validation errors: ${errors.map((e) => e.message).join('; ')}`);
    }
    if (warnings.length > 0) {
      logger.info('pipeline', `Sectional report validation warnings: ${warnings.map((w) => w.message).join('; ')}`);
    }

    // Block saving for critical validation errors (empty report, too short, missing required sections)
    const criticalErrors = errors.filter((e) =>
      e.type === 'empty_report' || e.type === 'too_short' || e.type === 'missing_section',
    );
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

  // Build generation metadata
  const generationMetadata: Record<string, unknown> = {
    promptVersion,
    generationMode: 'sectional',
    sectionCount: sections.length,
    sectionIds: sections.map((s) => s.id),
    sectionWordCounts: Object.fromEntries(sections.map((s) => [s.id, s.wordCount])),
    eventCoverage: Math.round(validation.eventCoverage),
  };

  logger.info('pipeline',
    `Assembled report: ${sections.length} sections, ${totalWordCount} words, ` +
    `${fullReport.length} chars, coverage: ${Math.round(validation.eventCoverage)}%`,
  );

  const result = await insertReportWithMetadata(caseId, fullReport, totalWordCount, generationMetadata);
  return { ...result, promptVersion, usage: totalUsage };
}
