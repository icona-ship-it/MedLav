import {
  MISTRAL_MODELS,
  streamMistralChat,
  TIMEOUT_SYNTHESIS,
  TIMEOUT_EXTRACTION,
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
import type { CaseType, CaseRole } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import { formatDate } from '@/lib/format';
import { buildGuidelineContext } from '../rag/retrieval-service';

interface SynthesisResult {
  synthesis: string;
  wordCount: number;
}

const SYNTHESIS_SPLIT_THRESHOLD_CHARS = 40_000;
const MAX_SYNTHESIS_ATTEMPTS = 2;

/**
 * Generate the medico-legal synthesis using Mistral Large with streaming.
 * Now role-adaptive, case-type-specific, with calculations integration.
 * Splits into chronology + summary for large cases (>40K chars).
 */
export async function generateSynthesis(params: {
  caseType: CaseType;
  caseTypes?: CaseType[];
  caseRole: CaseRole;
  patientInitials: string | null;
  events: ConsolidatedEvent[];
  anomalies: DetectedAnomaly[];
  missingDocuments: MissingDocument[];
  calculations?: MedicoLegalCalculation[];
  caseTypeLabel?: string;
  expertRole?: string;
}): Promise<SynthesisResult> {
  const {
    caseType, caseTypes, caseRole, events, anomalies, missingDocuments,
    patientInitials, calculations,
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

  const shouldSplit = totalPromptChars > SYNTHESIS_SPLIT_THRESHOLD_CHARS;

  // RAG: retrieve relevant clinical guidelines
  let guidelineContext = '';
  try {
    guidelineContext = await buildGuidelineContext({
      events: events.map((e) => ({ title: e.title, description: e.description, eventType: e.eventType })),
      caseType,
      caseTypes,
    });
    if (guidelineContext) {
      console.log(`[synthesis] RAG: retrieved guideline context (${guidelineContext.length} chars)`);
    }
  } catch (ragError) {
    // RAG is optional — don't block synthesis if it fails
    console.warn(`[synthesis] RAG retrieval failed (non-blocking): ${ragError instanceof Error ? ragError.message : 'unknown'}`);
  }

  console.log(
    `[synthesis] Total prompt: ${totalPromptChars} chars, split: ${shouldSplit}, ` +
    `events: ${events.length}, role: ${caseRole}, type: ${caseType}`,
  );

  for (let attempt = 0; attempt < MAX_SYNTHESIS_ATTEMPTS; attempt++) {
    let report: string;

    if (!shouldSplit) {
      // Single-call mode: full report with role-adaptive prompt
      report = await streamMistralChat({
        model: MISTRAL_MODELS.MISTRAL_LARGE,
        messages: [
          {
            role: 'system',
            content: buildSynthesisSystemPrompt({ caseType, caseRole, caseTypes }),
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
            }) + (guidelineContext ? `\n\n${guidelineContext}` : ''),
          },
        ],
        temperature: 0.3,
        maxTokens: 16384,
        timeoutMs: TIMEOUT_SYNTHESIS,
        label: 'synthesis:full',
      });
    } else {
      // Split mode: chronology first, then summary + analysis
      console.log('[synthesis] Split mode: generating chronology...');

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

      console.log(`[synthesis] Chronology: ${chronology.length} chars. Generating summary...`);

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
            }) + (guidelineContext ? `\n\n${guidelineContext}` : ''),
          },
        ],
        temperature: 0.3,
        maxTokens: 4096,
        timeoutMs: TIMEOUT_EXTRACTION,
        label: 'synthesis:summary',
      });

      console.log(`[synthesis] Summary: ${summaryAndAnalysis.length} chars. Assembling...`);

      report = assembleSplitReport(summaryAndAnalysis, chronology);
    }

    // Validate required sections (base 3 — always required)
    const validation = validateReportSections(report);
    if (validation.valid) {
      report = stripSectionMarkers(report);
      const wordCount = report.split(/\s+/).filter((w) => w.length > 0).length;
      console.log(`[synthesis] Report valid: ${wordCount} words (attempt ${attempt + 1})`);
      return { synthesis: report, wordCount };
    }

    if (attempt < MAX_SYNTHESIS_ATTEMPTS - 1) {
      console.warn(
        `[synthesis] Missing sections: ${validation.missing.join(', ')}. Retrying (attempt ${attempt + 2})...`,
      );
    } else {
      console.error(
        `[synthesis] Report still missing sections after ${MAX_SYNTHESIS_ATTEMPTS} attempts: ${validation.missing.join(', ')}. Using as-is.`,
      );
      report = stripSectionMarkers(report);
      const wordCount = report.split(/\s+/).filter((w) => w.length > 0).length;
      return { synthesis: report, wordCount };
    }
  }

  throw new Error('[synthesis] Unreachable');
}

// ── Formatting helpers (for split mode events formatting) ──

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
  // Level 1: Deterministic marker-based assembly
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
      console.log('[synthesis] Assembly: marker-based (level 1)');
      return [riassunto, crono, elementi].join('\n\n');
    }
  }

  // Level 2: Heading regex fallback
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
        console.log('[synthesis] Assembly: heading-based (level 2)');
        return [summary, chronology.trim(), elements].join('\n\n');
      }
    }
  }

  // Level 3: Sequential fallback
  console.log('[synthesis] Assembly: sequential fallback (level 3)');
  return [summaryAndAnalysis.trim(), chronology.trim()].join('\n\n');
}

// ── Validation ──

function validateReportSections(report: string): { valid: boolean; missing: string[] } {
  const requiredSections = [
    { name: 'Riassunto del caso', pattern: /riassunto\s+(del\s+)?caso/i },
    { name: 'Cronologia medico-legale', pattern: /cronologia\s+medico/i },
    {
      name: 'Elementi di rilievo',
      pattern: /elementi\s+di\s+rilievo|aspetti\s+(critici|rilevanti)|osservazioni\s+medico|profili\s+di\s+responsabilit|valutazione\s+di\s+merito/i,
    },
  ];

  const missing = requiredSections
    .filter((s) => !s.pattern.test(report))
    .map((s) => s.name);

  return { valid: missing.length === 0, missing };
}

function stripSectionMarkers(report: string): string {
  return report
    .replace(/<!-- (?:SECTION|END):\w+ -->\n?/g, '')
    .replace(/\n{3,}/g, '\n\n');
}
