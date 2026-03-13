import {
  MISTRAL_MODELS,
  streamMistralChat,
  TIMEOUT_SYNTHESIS,
} from '@/lib/mistral/client';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  buildChronologySystemPrompt,
  buildChronologyUserPrompt,
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  CASE_TYPE_LABELS,
} from './synthesis-prompts';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import type { ImageAnalysisResult } from '../image-analysis/diagnostic-image-analyzer';
import { formatDate } from '@/lib/format';
import { buildGuidelineContext } from '../rag/retrieval-service';
import { validateReport } from './report-validator';
import { logger } from '@/lib/logger';

export interface SynthesisResult {
  synthesis: string;
  wordCount: number;
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
}

const SYNTHESIS_SPLIT_THRESHOLD_CHARS = 40_000;

/**
 * Check if synthesis needs to be split into multiple Mistral calls.
 * Used by the Inngest pipeline to decide whether to use 1 or 2 steps.
 */
export function shouldSplitSynthesis(params: SynthesisParams): boolean {
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
    patientInitials, calculations, periziaMetadata, imageAnalysis,
  } = params;
  const caseTypeLabel = params.caseTypeLabel ?? CASE_TYPE_LABELS[caseType] ?? caseType;
  const expertRole = params.expertRole ?? caseRole;

  const eventsFormatted = formatEventsForPrompt(events);
  const anomaliesFormatted = formatAnomalies(anomalies);
  const missingDocsFormatted = formatMissingDocs(missingDocuments);
  const calculationsFormatted = formatCalculations(calculations);

  const totalPromptChars = eventsFormatted.length +
    (anomaliesFormatted?.length ?? 0) +
    (missingDocsFormatted?.length ?? 0);

  const needsSplit = totalPromptChars > SYNTHESIS_SPLIT_THRESHOLD_CHARS;

  const guidelineContext = await fetchGuidelineContext(events, caseType, caseTypes);

  logger.info('synthesis',
    ` Total prompt: ${totalPromptChars} chars, split: ${needsSplit}, ` +
    `events: ${events.length}, role: ${caseRole}, type: ${caseType}`,
  );

  let report: string;

  if (!needsSplit) {
    report = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        {
          role: 'system',
          content: buildSynthesisSystemPrompt({ caseType, caseRole, caseTypes, periziaMetadata }),
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
          }) + (guidelineContext ? `\n\n${guidelineContext}` : ''),
        },
      ],
      temperature: 0.1,
      maxTokens: 16384,
      timeoutMs: TIMEOUT_SYNTHESIS,
      label: 'synthesis:full',
    });
  } else {
    logger.info('synthesis', ' Split mode: generating chronology...');

    const chronology = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        { role: 'system', content: buildChronologySystemPrompt() },
        {
          role: 'user',
          content: buildChronologyUserPrompt(
            eventsFormatted,
            caseTypeLabel,
            expertRole,
            patientInitials ?? undefined,
          ),
        },
      ],
      temperature: 0.1,
      maxTokens: 16384,
      timeoutMs: TIMEOUT_SYNTHESIS,
      label: 'synthesis:chronology',
    });

    logger.info('synthesis', ` Chronology: ${chronology.length} chars. Generating summary...`);

    const summaryAndAnalysis = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        {
          role: 'system',
          content: buildSummarySystemPrompt({ caseType, caseRole, caseTypes }),
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
      temperature: 0.1,
      maxTokens: 16384,
      timeoutMs: TIMEOUT_SYNTHESIS,
      label: 'synthesis:summary',
    });

    logger.info('synthesis', ` Summary: ${summaryAndAnalysis.length} chars. Assembling...`);
    report = assembleSplitReport(summaryAndAnalysis, chronology);
  }

  return finalizeReport(report, events.length);
}

/**
 * Split mode step 1: Generate chronology section only.
 * Runs in its own Inngest step with full 800s Vercel budget.
 */
export async function generateSynthesisChronology(params: SynthesisParams): Promise<string> {
  const { events, caseType, caseRole, patientInitials } = params;
  const caseTypeLabel = params.caseTypeLabel ?? CASE_TYPE_LABELS[caseType] ?? caseType;
  const expertRole = params.expertRole ?? caseRole;
  const eventsFormatted = formatEventsForPrompt(events);

  logger.info('synthesis', ` Split step 1: generating chronology (${events.length} events)...`);

  const chronology = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: buildChronologySystemPrompt() },
      {
        role: 'user',
        content: buildChronologyUserPrompt(
          eventsFormatted,
          caseTypeLabel,
          expertRole,
          patientInitials ?? undefined,
        ),
      },
    ],
    temperature: 0.3,
    maxTokens: 16384,
    timeoutMs: TIMEOUT_SYNTHESIS,
    label: 'synthesis:chronology',
  });

  logger.info('synthesis', ` Chronology done: ${chronology.length} chars`);
  return chronology;
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

  const summaryAndAnalysis = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      {
        role: 'system',
        content: buildSummarySystemPrompt({ caseType, caseRole, caseTypes }),
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
    temperature: 0.3,
    maxTokens: 16384,
    timeoutMs: TIMEOUT_SYNTHESIS,
    label: 'synthesis:summary',
  });

  logger.info('synthesis', ` Summary done: ${summaryAndAnalysis.length} chars. Assembling...`);
  const report = assembleSplitReport(summaryAndAnalysis, chronology);
  return finalizeReport(report, events.length);
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
    return '';
  }
}

function finalizeReport(report: string, eventCount?: number): SynthesisResult {
  const cleaned = stripSectionMarkers(report);
  const wordCount = cleaned.split(/\s+/).filter((w) => w.length > 0).length;

  const validation = validateReport(cleaned, eventCount ?? 0);
  if (validation.issues.length > 0) {
    const errors = validation.issues.filter((i) => i.severity === 'error');
    const warnings = validation.issues.filter((i) => i.severity === 'warning');
    if (errors.length > 0) {
      logger.warn('synthesis', ` Validation errors: ${errors.map((e) => e.message).join('; ')}. Using as-is.`);
    }
    if (warnings.length > 0) {
      logger.info('synthesis', ` Validation warnings: ${warnings.map((w) => w.message).join('; ')}`);
    }
  }

  logger.info('synthesis',
    ` Report: ${wordCount} words, valid: ${validation.valid}, event coverage: ${Math.round(validation.eventCoverage)}%`,
  );
  return { synthesis: cleaned, wordCount };
}

// ── Formatting helpers ──

function formatEventsForPrompt(events: ConsolidatedEvent[]): string {
  return events
    .map((e, i) => {
      const date = formatDate(e.eventDate);
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
