import {
  MISTRAL_MODELS,
  streamMistralChat,
  TIMEOUT_SYNTHESIS,
  DETERMINISTIC_SEED,
} from '@/lib/mistral/client';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { createEmptyUsage, mergeUsage } from '@/services/cost-tracking/cost-calculator';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  buildChronologySystemPrompt,
  buildChronologyUserPrompt,
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  formatDocumentsOcrForPrompt,
  CASE_TYPE_LABELS,
} from './synthesis-prompts';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import type { ImageAnalysisResult } from '../image-analysis/diagnostic-image-analyzer';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import { formatDate, formatEventDateByPrecision } from '@/lib/format';
import { buildGuidelineContext } from '../rag/retrieval-service';
import { validateReport, getBlockingIssues, formatIssuesForLog } from './report-validator';
import type { ReportValidationContext, ReportIssue } from './report-validator';
import { computeHrs, getHrsLevel } from './hallucination-risk-scorer';
import { computePromptVersion } from './prompt-version';
import type { DocumentSummary } from './document-summarizer';
import { logger } from '@/lib/logger';

export interface SynthesisResult {
  synthesis: string;
  wordCount: number;
  promptVersion: string;
  usage?: TokenUsage;
  /** Hallucination Risk Score (0-100). 100 = no validator issues. */
  hrs?: number;
  /** Qualitative level matching hrs. */
  hrsLevel?: 'eccellente' | 'buono' | 'da_rivedere' | 'critico';
}

export interface SynthesisParams {
  caseType: CaseType;
  caseTypes?: CaseType[];
  caseRole: CaseRole;
  patientInitials: string | null;
  events: ConsolidatedEvent[];
  anomalies: DetectedAnomaly[];
  missingDocuments: MissingDocument[];
  calculations?: MedicoLegalCalculation[];
  imageAnalysis?: ImageAnalysisResult[];
  caseTypeLabel?: string;
  expertRole?: string;
  periziaMetadata?: PeriziaMetadata;
  /** Original OCR text for faithful transcription in report */
  documentsOcrText?: DocumentOcrContext[];
  /** Per-document AI summaries for large cases (map-reduce mode) */
  documentSummaries?: DocumentSummary[];
}

const SYNTHESIS_SPLIT_THRESHOLD_CHARS = 40_000;

/**
 * Check if synthesis needs to be split into multiple Mistral calls.
 * Used by the Inngest pipeline to decide whether to use 1 or 2 steps.
 * Split is mandatory when OCR text is provided (faithful transcription is long).
 * When documentSummaries are provided (map-reduce mode), OCR is NOT fetched,
 * so the split decision is based purely on prompt size.
 */
export function shouldSplitSynthesis(params: SynthesisParams): boolean {
  // When using document summaries (map-reduce mode), don't force split for OCR
  // because OCR text won't be fetched — summaries replace it
  const hasSummaries = params.documentSummaries && params.documentSummaries.length > 0;

  // Always split when OCR text is available AND we're not in summary mode
  if (!hasSummaries && params.documentsOcrText && params.documentsOcrText.length > 0) {
    return true;
  }
  const eventsFormatted = formatEventsForPrompt(params.events);
  const anomaliesFormatted = formatAnomalies(params.anomalies);
  const missingDocsFormatted = formatMissingDocs(params.missingDocuments);
  const totalPromptChars = eventsFormatted.length +
    (anomaliesFormatted?.length ?? 0) +
    (missingDocsFormatted?.length ?? 0);
  return totalPromptChars > SYNTHESIS_SPLIT_THRESHOLD_CHARS;
}

/**
 * Generate the full synthesis — auto-detects single vs split mode.
 * Used by non-Inngest callers (e.g. /api/processing/regenerate).
 * For the Inngest pipeline, use the explicit split functions instead
 * so each Mistral call runs in its own step with full Vercel budget.
 */
export async function generateSynthesis(params: SynthesisParams): Promise<SynthesisResult> {
  const {
    caseType, caseTypes, caseRole, events, anomalies, missingDocuments,
    patientInitials, calculations, periziaMetadata, imageAnalysis, documentsOcrText,
    documentSummaries,
  } = params;
  const caseTypeLabel = params.caseTypeLabel ?? CASE_TYPE_LABELS[caseType] ?? caseType;
  const expertRole = params.expertRole ?? caseRole;

  const eventsFormatted = formatEventsForPrompt(events);
  const anomaliesFormatted = formatAnomalies(anomalies);
  const missingDocsFormatted = formatMissingDocs(missingDocuments);
  const calculationsFormatted = formatCalculations(calculations);
  const ocrFormatted = formatDocumentsOcrForPrompt(documentsOcrText);
  const ocrTotalChars = documentsOcrText?.reduce((sum, d) => sum + d.totalChars, 0) ?? 0;

  const totalPromptChars = eventsFormatted.length +
    (anomaliesFormatted?.length ?? 0) +
    (missingDocsFormatted?.length ?? 0) +
    ocrFormatted.length;

  // Always split when OCR text is present
  const needsSplit = (documentsOcrText && documentsOcrText.length > 0) ||
    totalPromptChars > SYNTHESIS_SPLIT_THRESHOLD_CHARS;

  const guidelineContext = await fetchGuidelineContext(events, caseType, caseTypes);

  logger.info('synthesis',
    ` Total prompt: ${totalPromptChars} chars (OCR: ${ocrTotalChars}), split: ${needsSplit}, ` +
    `events: ${events.length}, role: ${caseRole}, type: ${caseType}`,
  );

  let report: string;
  let totalUsage: TokenUsage = createEmptyUsage();

  let lastFinishReason: 'stop' | 'length' | 'error' | 'tool_calls' | null = null;

  if (!needsSplit) {
    const { content: fullReport, usage, finishReason } = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        {
          role: 'system',
          content: buildSynthesisSystemPrompt({ caseType, caseRole, caseTypes, periziaMetadata, hasOcrText: ocrTotalChars > 0 }),
        },
        {
          role: 'user',
          content: buildSynthesisUserPrompt({
            caseType,
            patientInitials,
            caseRole,
            events,
            anomalies,
            missingDocuments,
            calculations,
            caseTypes,
            periziaMetadata,
            imageAnalysis,
            documentsOcrText,
            documentSummaries,
          }) + (guidelineContext ? `\n\n${guidelineContext}` : ''),
        },
      ],
      temperature: 0,
      maxTokens: 32768,
      timeoutMs: TIMEOUT_SYNTHESIS,
      randomSeed: DETERMINISTIC_SEED,
      label: 'synthesis:full',
    });
    report = fullReport;
    totalUsage = usage;
    lastFinishReason = finishReason;
  } else {
    logger.info('synthesis', ` Split mode: generating chronology (OCR: ${ocrTotalChars} chars)...`);

    const hasSummaries = documentSummaries && documentSummaries.length > 0;
    const { content: chronology, usage: chronoUsage, finishReason: chronoFinishReason } = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        { role: 'system', content: buildChronologySystemPrompt({ hasOcrText: ocrTotalChars > 0 || hasSummaries }) },
        {
          role: 'user',
          content: buildChronologyUserPrompt({
            eventsFormatted,
            caseTypeLabel,
            expertRole,
            patientInitials: patientInitials ?? undefined,
            documentsOcrText,
            documentSummaries,
          }),
        },
      ],
      temperature: 0,
      maxTokens: 24576,
      timeoutMs: TIMEOUT_SYNTHESIS,
      randomSeed: DETERMINISTIC_SEED,
      label: 'synthesis:chronology',
    });

    logger.info('synthesis', ` Chronology: ${chronology.length} chars. Generating summary...`);

    const { content: summaryAndAnalysis, usage: summaryUsage, finishReason: summaryFinishReason } = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        {
          role: 'system',
          content: buildSummarySystemPrompt({ caseType, caseRole, caseTypes, periziaMetadata }),
        },
        {
          role: 'user',
          content: buildSummaryUserPrompt({
            chronology,
            caseTypeLabel,
            expertRole,
            patientInitials: patientInitials ?? undefined,
            anomalies: anomaliesFormatted,
            missingDocs: missingDocsFormatted,
            calculations: calculationsFormatted,
            periziaMetadata,
          }) + (guidelineContext ? `\n\n${guidelineContext}` : ''),
        },
      ],
      temperature: 0,
      maxTokens: 16384,
      timeoutMs: TIMEOUT_SYNTHESIS,
      randomSeed: DETERMINISTIC_SEED,
      label: 'synthesis:summary',
    });

    logger.info('synthesis', ` Summary: ${summaryAndAnalysis.length} chars. Assembling...`);
    report = assembleSplitReport(summaryAndAnalysis, chronology);
    totalUsage = mergeUsage(chronoUsage, summaryUsage);
    // Track finishReason from either call — 'length' in any = truncation
    lastFinishReason = chronoFinishReason === 'length' ? 'length' : summaryFinishReason;
  }

  const promptVersion = computePromptVersion({ caseType, caseRole, caseTypes: params.caseTypes });
  const validationContext: ReportValidationContext = {
    events: events.map((e) => ({ orderNumber: e.orderNumber, eventDate: e.eventDate })),
    calculations: calculations?.map((c) => ({ label: c.label, value: c.value, days: c.days })),
    ocrText: ocrTotalChars > 0 ? documentsOcrText : undefined,
  };
  return finalizeReport(report, events.length, promptVersion, validationContext, imageAnalysis, totalUsage, lastFinishReason);
}

/**
 * Split mode step 1: Generate chronology section only.
 * Runs in its own Inngest step with full 800s Vercel budget.
 */
export async function generateSynthesisChronology(params: SynthesisParams): Promise<{ chronology: string; usage: TokenUsage }> {
  const { events, caseType, caseRole, patientInitials, documentsOcrText, documentSummaries } = params;
  const caseTypeLabel = params.caseTypeLabel ?? CASE_TYPE_LABELS[caseType] ?? caseType;
  const expertRole = params.expertRole ?? caseRole;
  const eventsFormatted = formatEventsForPrompt(events);
  const ocrTotalChars = documentsOcrText?.reduce((sum, d) => sum + d.totalChars, 0) ?? 0;
  const hasSummaries = documentSummaries && documentSummaries.length > 0;

  logger.info('synthesis', ` Split step 1: generating chronology (${events.length} events, OCR: ${ocrTotalChars} chars, summaries: ${hasSummaries ? documentSummaries!.length : 0})...`);

  const { content: chronology, usage, finishReason } = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: buildChronologySystemPrompt({ hasOcrText: ocrTotalChars > 0 || hasSummaries }) },
      {
        role: 'user',
        content: buildChronologyUserPrompt({
          eventsFormatted,
          caseTypeLabel,
          expertRole,
          patientInitials: patientInitials ?? undefined,
          documentsOcrText,
          documentSummaries,
        }),
      },
    ],
    temperature: 0,
    maxTokens: 24576,
    timeoutMs: TIMEOUT_SYNTHESIS,
    randomSeed: DETERMINISTIC_SEED,
    label: 'synthesis:chronology',
  });

  if (finishReason === 'length') {
    const msg = `Cronologia TRONCATA dal LLM (finishReason=length, ${chronology.length} chars). Cronologia incompleta non utilizzabile per la sintesi.`;
    logger.error('synthesis', msg);
    throw new Error(msg);
  }

  logger.info('synthesis', ` Chronology done: ${chronology.length} chars`);
  return { chronology, usage };
}

/**
 * Split mode step 2: Generate summary + analysis from chronology.
 * Runs in its own Inngest step with full 800s Vercel budget.
 */
export async function generateSynthesisSummary(params: SynthesisParams & {
  chronology: string;
}): Promise<SynthesisResult> {
  const {
    caseType, caseTypes, caseRole, events, anomalies, missingDocuments,
    patientInitials, calculations, chronology, periziaMetadata,
  } = params;
  const caseTypeLabel = params.caseTypeLabel ?? CASE_TYPE_LABELS[caseType] ?? caseType;
  const expertRole = params.expertRole ?? caseRole;
  const anomaliesFormatted = formatAnomalies(anomalies);
  const missingDocsFormatted = formatMissingDocs(missingDocuments);
  const calculationsFormatted = formatCalculations(calculations);

  const guidelineContext = await fetchGuidelineContext(events, caseType, caseTypes);

  logger.info('synthesis', ` Split step 2: generating summary from ${chronology.length} char chronology...`);

  const { content: summaryAndAnalysis, usage: summaryUsage, finishReason } = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      {
        role: 'system',
        content: buildSummarySystemPrompt({ caseType, caseRole, caseTypes, periziaMetadata }),
      },
      {
        role: 'user',
        content: buildSummaryUserPrompt({
          chronology,
          caseTypeLabel,
          expertRole,
          patientInitials: patientInitials ?? undefined,
          anomalies: anomaliesFormatted,
          missingDocs: missingDocsFormatted,
          calculations: calculationsFormatted,
          periziaMetadata,
        }) + (guidelineContext ? `\n\n${guidelineContext}` : ''),
      },
    ],
    temperature: 0,
    maxTokens: 16384,
    timeoutMs: TIMEOUT_SYNTHESIS,
    randomSeed: DETERMINISTIC_SEED,
    label: 'synthesis:summary',
  });

  logger.info('synthesis', ` Summary done: ${summaryAndAnalysis.length} chars. Assembling...`);
  const report = assembleSplitReport(summaryAndAnalysis, chronology);
  const promptVersion = computePromptVersion({ caseType, caseRole, caseTypes: params.caseTypes });
  const ocrTotalChars = params.documentsOcrText?.reduce((sum, d) => sum + d.totalChars, 0) ?? 0;
  const validationContext: ReportValidationContext = {
    events: events.map((e) => ({ orderNumber: e.orderNumber, eventDate: e.eventDate })),
    calculations: calculations?.map((c) => ({ label: c.label, value: c.value, days: c.days })),
    ocrText: ocrTotalChars > 0 ? params.documentsOcrText : undefined,
  };
  return finalizeReport(report, events.length, promptVersion, validationContext, params.imageAnalysis, summaryUsage, finishReason);
}

// ── Shared helpers ──

async function fetchGuidelineContext(
  events: ConsolidatedEvent[],
  caseType: CaseType,
  caseTypes?: CaseType[],
): Promise<string> {
  try {
    const ctx = await buildGuidelineContext({
      events: events.map((e) => ({ title: e.title, description: e.description, eventType: e.eventType })),
      caseType,
      caseTypes,
    });
    if (ctx) {
      logger.info('synthesis', ` RAG: retrieved guideline context (${ctx.length} chars)`);
    }
    return ctx;
  } catch (ragError) {
    logger.warn('synthesis', ` RAG retrieval failed (non-blocking): ${ragError instanceof Error ? ragError.message : 'unknown'}`);
    // Return a warning note so the LLM and perito know guidelines were not available
    return '[NOTA: Le linee guida cliniche non sono state recuperate per un errore tecnico. Il report è stato generato senza il supporto delle linee guida RAG.]';
  }
}

/**
 * No-op: images are now inline-only (no ALLEGATI ICONOGRAFICI section).
 * Kept for backward compatibility with callers.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function appendImageAppendix(report: string, imageAnalysis?: ImageAnalysisResult[]): string {
  return report;
}

function finalizeReport(
  report: string,
  eventCount: number,
  promptVersion: string,
  validationContext?: ReportValidationContext,
  imageAnalysis?: ImageAnalysisResult[],
  usage?: TokenUsage,
  finishReason?: 'stop' | 'length' | 'error' | 'tool_calls' | null,
): SynthesisResult {
  const withImages = appendImageAppendix(report, imageAnalysis);
  const cleaned = stripSectionMarkers(withImages);
  const wordCount = cleaned.split(/\s+/).filter((w) => w.length > 0).length;

  const validation = validateReport(cleaned, eventCount, validationContext);

  // Add truncated_response issue if finishReason indicates truncation
  if (finishReason === 'length') {
    const truncationIssue: ReportIssue = {
      type: 'truncated_response',
      severity: 'error',
      message: 'LLM response was truncated (hit maxTokens limit). Report may be incomplete.',
    };
    validation.issues.push(truncationIssue);
    validation.valid = false;
  }

  if (validation.issues.length > 0) {
    const errors = validation.issues.filter((i) => i.severity === 'error');
    const warnings = validation.issues.filter((i) => i.severity === 'warning');

    // CRITICAL: truncated reports must NEVER be saved silently in a medical-legal context.
    // A truncated report missing sections could mislead the expert and the court.
    if (finishReason === 'length') {
      const msg = `Report TRONCATO dal LLM (finishReason=length, ${wordCount} parole). Report incompleto — non salvato per sicurezza. Il sistema ritenterà la generazione.`;
      logger.error('synthesis', msg);
      throw new Error(msg);
    }

    // GDPR Art.9: solo tipo+conteggio nei log (i message possono citare testo clinico).
    if (errors.length > 0) {
      logger.warn('synthesis', ` Validation errors: ${formatIssuesForLog(errors)}.`);
    }
    if (warnings.length > 0) {
      logger.info('synthesis', ` Validation warnings: ${formatIssuesForLog(warnings)}`);
    }

    // A3: hard-block on any blocking-policy error (centralized in
    // report-validator.ts). Covers broken_ocr_marker (Wave A.1) plus
    // required-section-missing, too_short, sentinel dates, coverage floor and
    // header mismatch/fabrication — mirror of the sectional path block in
    // generate-report.ts so both pipelines refuse unsignable reports.
    const blocking = getBlockingIssues(validation);
    if (blocking.length > 0) {
      // GDPR Art.9: tipo+conteggio (l'Error → log/Sentry); dettaglio in UI/metadata.
      const msg = `Report non valido: ${formatIssuesForLog(blocking)}. Output non salvato — il sistema ritenterà.`;
      logger.error('synthesis', msg);
      throw new Error(msg);
    }
  }

  const hrs = computeHrs(validation);
  const hrsLevel = getHrsLevel(hrs);

  logger.info('synthesis',
    ` Report: ${wordCount} words, valid: ${validation.valid}, event coverage: ${Math.round(validation.eventCoverage)}%, hrs: ${hrs} (${hrsLevel}), promptVersion: ${promptVersion}`,
  );
  return { synthesis: cleaned, wordCount, promptVersion, usage, hrs, hrsLevel };
}

// ── Formatting helpers ──

function formatEventsForPrompt(events: ConsolidatedEvent[]): string {
  return events
    .map((e, i) => {
      // Data precision-aware: "solo anno" non diventa "01.01.YYYY" (fix Bigon).
      const date = formatEventDateByPrecision(e.eventDate, e.datePrecision);
      const precision = e.datePrecision !== 'giorno' ? ` [data ${e.datePrecision}]` : '';
      const type = e.eventType ?? 'altro';
      const source = e.sourceType ?? '';
      const title = e.title ?? '';
      const desc = e.description ?? '';
      const diagnosis = e.diagnosis ? ` | Diagnosi: ${e.diagnosis}` : '';
      const doctor = e.doctor ? ` | Medico: ${e.doctor}` : '';
      const facility = e.facility ? ` | Struttura: ${e.facility}` : '';

      return `${i + 1}. [${date}]${precision} (${source}) ${type}: ${title}\n   ${desc}${diagnosis}${doctor}${facility}`;
    })
    .join('\n\n');
}

function formatAnomalies(anomalies: DetectedAnomaly[]): string {
  if (anomalies.length === 0) return 'Nessuna anomalia rilevata.';
  return anomalies
    .map((a) => {
      const involvedDates = a.involvedEvents
        .map((e) => `${formatDate(e.date)} - ${e.title}`)
        .join(', ');
      return `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description} (Eventi: ${involvedDates})`;
    })
    .join('\n');
}

function formatMissingDocs(missingDocuments: MissingDocument[]): string {
  if (missingDocuments.length === 0) return 'Nessuna documentazione mancante rilevata.';
  return missingDocuments
    .map((d) => `- ${d.documentName}: ${d.reason}`)
    .join('\n');
}

function formatCalculations(calculations?: MedicoLegalCalculation[]): string {
  if (!calculations || calculations.length === 0) return '';
  const lines = calculations.map((c) =>
    `- ${c.label}: ${c.value}${c.startDate && c.endDate ? ` (${formatDate(c.startDate)} — ${formatDate(c.endDate)})` : ''}`,
  );
  return `## PERIODI MEDICO-LEGALI CALCOLATI\n${lines.join('\n')}`;
}

// ── Assembly for split mode ──

function assembleSplitReport(summaryAndAnalysis: string, chronology: string): string {
  const riassuntoMatch = summaryAndAnalysis.match(
    /<!-- SECTION:RIASSUNTO -->([\s\S]*?)<!-- END:RIASSUNTO -->/,
  );
  const elementiMatch = summaryAndAnalysis.match(
    /<!-- SECTION:ELEMENTI -->([\s\S]*?)<!-- END:ELEMENTI -->/,
  );
  const cronologiaMatch = chronology.match(
    /<!-- SECTION:CRONOLOGIA -->([\s\S]*?)<!-- END:CRONOLOGIA -->/,
  );

  if (riassuntoMatch && elementiMatch && cronologiaMatch) {
    const riassunto = riassuntoMatch[1].trim();
    const elementi = elementiMatch[1].trim();
    const crono = cronologiaMatch[1].trim();

    if (riassunto.length > 50 && elementi.length > 50 && crono.length > 50) {
      logger.info('synthesis', ' Assembly: marker-based (level 1)');
      return [riassunto, crono, elementi].join('\n\n');
    }
  }

  const elementiPatterns = [
    /^#{1,3}\s*(?:\d+[.)]\s*)?(?:SEZIONE\s*\d*\s*[—–\-]\s*)?ELEMENTI\s+DI\s+RILIEVO/im,
    /^#{1,3}\s*ASPETTI\s+(?:CRITICI|RILEVANTI)\s+MEDICO/im,
    /^#{1,3}\s*ANALISI\s+MEDICO[—–\-\s]*LEGALE/im,
    /^#{1,3}\s*OSSERVAZIONI\s+MEDICO/im,
    /^#{1,3}\s*CRITICITÀ/im,
  ];

  for (const pattern of elementiPatterns) {
    const match = pattern.exec(summaryAndAnalysis);
    if (match && match.index !== undefined) {
      const summary = summaryAndAnalysis.slice(0, match.index).trim();
      const elements = summaryAndAnalysis.slice(match.index).trim();

      if (summary.length > 100 && elements.length > 100) {
        logger.info('synthesis', ' Assembly: heading-based (level 2)');
        return [summary, chronology.trim(), elements].join('\n\n');
      }
    }
  }

  logger.info('synthesis', ' Assembly: sequential fallback (level 3)');
  return [summaryAndAnalysis.trim(), chronology.trim()].join('\n\n');
}

function stripSectionMarkers(report: string): string {
  return report
    .replace(/<!-- (?:SECTION|END):\w+ -->\n?/g, '')
    .replace(/\n{3,}/g, '\n\n');
}
