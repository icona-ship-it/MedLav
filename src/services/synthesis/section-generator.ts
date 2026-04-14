import {
  MISTRAL_MODELS,
  streamMistralChat,
  DETERMINISTIC_SEED,
} from '@/lib/mistral/client';
import type { CaseType, CaseRole } from '@/types';
import type { SynthesisParams } from './synthesis-service';
import type { SectionSpec, GeneratedSection, SectionContext } from './section-generation-types';
import { formatRoleDirectiveForPrompt } from './role-prompts';
import {
  ABSOLUTE_RULES,
  CHRONOLOGY_SOURCES_GUIDE,
  formatEventsForPrompt,
  formatAnomaliesForPrompt,
  formatMissingDocsForPrompt,
  formatCalculationsForPrompt,
  formatPeriziaMetadataForPrompt,
  formatImageAnalysisForPrompt,
  formatDocumentsOcrForPrompt,
  formatDocumentSummariesForPrompt,
} from './synthesis-prompts';
import { buildGuidelineContext } from '../rag/retrieval-service';
import { logger } from '@/lib/logger';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { PubMedSearchResult } from '../pubmed/evidence-enricher';
import { formatCausalNexusForPrompt } from '@/lib/domain-knowledge/causal-nexus';

/** Timeout per section LLM call: 10 minutes (Vercel maxDuration is 800s, same budget as monolithic synthesis). */
const SECTION_TIMEOUT_MS = 600_000;

// ── System prompt builder ───────────────────────────────────────────

/**
 * Build the system prompt for a single section generation.
 */
export function buildSectionSystemPrompt(params: {
  spec: SectionSpec;
  caseRole: CaseRole;
  caseType: CaseType;
  caseTypes?: CaseType[];
  hasOcrText: boolean;
}): string {
  const { spec, caseRole, hasOcrText } = params;
  const roleDirective = formatRoleDirectiveForPrompt(caseRole);

  const ocrDirective = hasOcrText ? `
## TESTO OCR DISPONIBILE
Ti verra fornito il testo OCR dei documenti originali pertinenti. Usalo come FONTE PRIMARIA.
- Il testo tra virgolette ("...") DEVE provenire dal testo OCR originale — NON parafrasare
- Testo illeggibile nell'OCR → "[non leggibile]"
- Tabelle di esami: riportare valori ESATTI dal testo OCR` : '';

  return `Sei un sistema di organizzazione documentale medico-legale.
Il tuo compito e generare ESCLUSIVAMENTE la sezione "${spec.title}" di un report medico-legale.

## ISTRUZIONI PER QUESTA SEZIONE
${spec.promptDirective}

${roleDirective}

${ABSOLUTE_RULES}
${ocrDirective}

## FORMATO OUTPUT
Genera SOLO il contenuto della sezione, SENZA l'intestazione "## ${spec.title}" (viene aggiunta automaticamente).
Usa ### per sotto-sezioni se necessario.
NON generare altre sezioni del report — SOLO "${spec.title}".

${CHRONOLOGY_SOURCES_GUIDE}`;
}

// ── User prompt builder ─────────────────────────────────────────────

/**
 * Build the user prompt for a single section, with relevant data based on dataSources.
 */
export function buildSectionUserPrompt(params: {
  spec: SectionSpec;
  synthesisParams: SynthesisParams;
  previousContext: SectionContext[];
  documentsOcrText?: DocumentOcrContext[];
  guidelineContext?: string;
}): string {
  const { spec, synthesisParams, previousContext, documentsOcrText, guidelineContext } = params;
  const parts: string[] = [];

  parts.push(`Genera la sezione "${spec.title}" del report medico-legale.\n`);

  // Add context from previous sections
  if (spec.dataSources.includes('context-summaries') && previousContext.length > 0) {
    parts.push('## CONTESTO DALLE SEZIONI PRECEDENTI\n');
    for (const ctx of previousContext) {
      parts.push(`### ${ctx.title}\n${ctx.contextSummary}\n`);
    }
  }

  // Add events based on dataSource type
  const events = synthesisParams.events;
  if (spec.dataSources.includes('events')) {
    parts.push(`## TUTTI GLI EVENTI CLINICI (${events.length} totali)\n\n${formatEventsForPrompt(events)}\n`);
  } else if (spec.dataSources.includes('events-medical')) {
    const medical = filterMedicalEvents(events);
    parts.push(`## EVENTI CLINICI (${medical.length} medici su ${events.length} totali)\n\n${formatEventsForPrompt(medical)}\n`);
  } else if (spec.dataSources.includes('events-non-medical')) {
    const nonMedical = filterNonMedicalEvents(events);
    if (nonMedical.length > 0) {
      parts.push(`## DOCUMENTI NON SANITARI (${nonMedical.length} eventi)\n\n${formatEventsForPrompt(nonMedical)}\n`);
    }
  } else if (spec.dataSources.includes('events-expenses')) {
    const expenses = events.filter((e) => e.eventType === 'spesa_medica');
    if (expenses.length > 0) {
      parts.push(`## EVENTI SPESE MEDICHE (${expenses.length} voci)\n\n${formatEventsForPrompt(expenses)}\n`);
    }
  } else if (spec.dataSources.includes('events-perizie')) {
    // Events from perizia documents don't have distinct sourceType/eventType,
    // so pass ALL events as chronological context. The filtered OCR text
    // (only perizia docs) and the prompt directive guide the LLM.
    parts.push(`## EVENTI CLINICI PER CONTESTO (${events.length} totali)\n\n${formatEventsForPrompt(events)}\n`);
  }

  // Add anomalies
  if (spec.dataSources.includes('anomalies')) {
    parts.push(`## ANOMALIE RILEVATE\n\n${formatAnomaliesForPrompt(synthesisParams.anomalies)}\n`);
  }

  // Add missing docs
  if (spec.dataSources.includes('missing-docs')) {
    parts.push(`## DOCUMENTAZIONE MANCANTE\n\n${formatMissingDocsForPrompt(synthesisParams.missingDocuments)}\n`);
  }

  // Add calculations
  if (spec.dataSources.includes('calculations') && synthesisParams.calculations) {
    const calcText = formatCalculationsForPrompt(synthesisParams.calculations);
    if (calcText) parts.push(`${calcText}\n`);
  }

  // Add perizia metadata
  if (spec.dataSources.includes('perizia-metadata') && synthesisParams.periziaMetadata) {
    const metaText = formatPeriziaMetadataForPrompt(synthesisParams.periziaMetadata);
    if (metaText) parts.push(`## DATI PERIZIA\n${metaText}\n`);
  }

  // Add image analysis
  if (spec.dataSources.includes('image-analysis') && synthesisParams.imageAnalysis) {
    const imgText = formatImageAnalysisForPrompt(synthesisParams.imageAnalysis);
    if (imgText) parts.push(`${imgText}\n`);
  }

  // Add document content: OCR text or document summaries (for sections that need it)
  if (spec.needsOcr) {
    const hasSummaries = synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0;
    if (hasSummaries) {
      // Map-reduce mode: use AI summaries instead of raw OCR
      const summaryText = formatDocumentSummariesForPrompt(synthesisParams.documentSummaries);
      if (summaryText) parts.push(summaryText);
    } else if (documentsOcrText && documentsOcrText.length > 0) {
      // Direct OCR mode: filter and include raw OCR text
      const filteredOcr = filterOcrForSection(spec, documentsOcrText);
      if (filteredOcr.length > 0) {
        let ocrText = formatDocumentsOcrForPrompt(filteredOcr);
        // Cap OCR text to prevent Vercel timeout on large cases.
        // Mistral Large 3: 262K token context (~470K chars).
        // Budget: ~20K system+events + ~60K output = ~390K available for OCR.
        // 200K cap per section: fits comfortably, zero truncation on most cases.
        const MAX_OCR_CHARS_PER_SECTION = 200_000;
        if (ocrText && ocrText.length > MAX_OCR_CHARS_PER_SECTION) {
          const originalLength = ocrText.length;
          ocrText = ocrText.slice(0, MAX_OCR_CHARS_PER_SECTION) + '\n\n[... testo OCR troncato per limiti di contesto. I documenti successivi non sono inclusi in questa sezione.]';
          logger.warn('section-generator', `OCR text truncated to ${MAX_OCR_CHARS_PER_SECTION} chars for section "${spec.id}" (was ${originalLength})`);
        }
        if (ocrText) parts.push(ocrText);
      }
    }
  }

  // Add PubMed references
  if (spec.dataSources.includes('pubmed-references') && synthesisParams.pubmedReferences) {
    const pubmedText = formatPubMedReferencesForPrompt(synthesisParams.pubmedReferences);
    if (pubmedText) parts.push(pubmedText);
  }

  // Add guidelines
  if (spec.dataSources.includes('guidelines') && guidelineContext) {
    parts.push(`\n${guidelineContext}\n`);
  }

  parts.push(`---\nGenera SOLO la sezione "${spec.title}". NON includere l'intestazione ## — viene aggiunta automaticamente.`);

  return parts.join('\n');
}

// ── Main generation function ────────────────────────────────────────

/**
 * Generate a single report section via Mistral LLM.
 */
export async function generateSingleSection(params: {
  spec: SectionSpec;
  synthesisParams: SynthesisParams;
  previousContext: SectionContext[];
  documentsOcrText?: DocumentOcrContext[];
}): Promise<GeneratedSection> {
  const { spec, synthesisParams, previousContext, documentsOcrText } = params;
  const startMs = Date.now();

  // Bibliography: fall back to placeholder when no PubMed references available
  if (spec.dataSources.includes('pubmed-references') &&
      (!synthesisParams.pubmedReferences || synthesisParams.pubmedReferences.length === 0)) {
    return {
      id: spec.id,
      title: spec.title,
      content: spec.placeholderText ?? '',
      contextSummary: '',
      wordCount: 0,
    };
  }

  const hasOcrText = !!(documentsOcrText && documentsOcrText.length > 0);

  // Fetch guideline context if needed
  let guidelineContext = '';
  if (spec.dataSources.includes('guidelines')) {
    try {
      guidelineContext = await buildGuidelineContext({
        events: synthesisParams.events.map((e) => ({
          title: e.title,
          description: e.description,
          eventType: e.eventType,
        })),
        caseType: synthesisParams.caseType,
        caseTypes: synthesisParams.caseTypes,
      });
    } catch {
      logger.warn('section-generator', `RAG retrieval failed for section ${spec.id} (non-blocking)`);
      guidelineContext = '[NOTA: Le linee guida cliniche non sono state recuperate per un errore tecnico.]';
    }
  }

  const systemPrompt = buildSectionSystemPrompt({
    spec,
    caseRole: synthesisParams.caseRole,
    caseType: synthesisParams.caseType,
    caseTypes: synthesisParams.caseTypes,
    hasOcrText,
  });

  const userPrompt = buildSectionUserPrompt({
    spec,
    synthesisParams,
    previousContext,
    documentsOcrText,
    guidelineContext,
  });

  const { content, usage, finishReason } = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    maxTokens: spec.maxTokens,
    timeoutMs: SECTION_TIMEOUT_MS,
    randomSeed: DETERMINISTIC_SEED,
    label: `section:${spec.id}`,
  });

  if (finishReason === 'length') {
    const msg = `Sezione "${spec.id}" TRONCATA dal LLM (finishReason=length, ${content.length} chars). Sezione incompleta — il sistema ritenterà.`;
    logger.error('section-generator', msg);
    throw new Error(msg);
  }

  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

  // Generate context summary for subsequent sections
  const contextSummary = spec.contextMaxChars > 0
    ? summarizeForContext(content, spec.contextMaxChars)
    : '';

  const elapsed = Date.now() - startMs;
  logger.info('section-generator',
    `Section "${spec.id}" done: ${wordCount} words, ${content.length} chars, ${elapsed}ms`,
  );

  return {
    id: spec.id,
    title: spec.title,
    content: content.trim(),
    contextSummary,
    wordCount,
    usage,
  };
}

// ── Context summarization ───────────────────────────────────────────

/**
 * Compress section content into a context summary for subsequent sections.
 * Strategy varies by content type.
 */
export function summarizeForContext(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // For medical documentation: extract sentences with dates and key terms
  const dateKeywordPattern = /[^.!?]*\b\d{2}[./]\d{2}[./]\d{4}\b[^.!?]*[.!?]/g;
  const dateSentences = content.match(dateKeywordPattern) ?? [];

  if (dateSentences.length > 0) {
    let summary = '';
    for (const sentence of dateSentences) {
      if (summary.length + sentence.length > maxChars) break;
      summary += sentence + ' ';
    }
    if (summary.length > 100) return summary.trim();
  }

  // Fallback: truncate with ellipsis
  return content.slice(0, maxChars - 3) + '...';
}

// ── Event filtering helpers ─────────────────────────────────────────

const NON_MEDICAL_EVENT_TYPES = new Set([
  'documento_amministrativo',
  'certificato',
]);

function filterMedicalEvents(events: ConsolidatedEvent[]): ConsolidatedEvent[] {
  return events.filter((e) =>
    !NON_MEDICAL_EVENT_TYPES.has(e.eventType) && e.eventType !== 'spesa_medica',
  );
}

function filterNonMedicalEvents(events: ConsolidatedEvent[]): ConsolidatedEvent[] {
  return events.filter((e) => NON_MEDICAL_EVENT_TYPES.has(e.eventType));
}

// ── OCR filtering by section type ───────────────────────────────────

// Documents that are explicitly NOT medical documentation.
// Everything else is included in documentazione_sanitaria — this ensures
// no medical document (PS, referti, cartelle, etc.) is ever accidentally excluded.
const EXCLUDED_FROM_MEDICAL = new Set([
  'memoria_difensiva',
  'documento_amministrativo',
  'certificato',
  'perizia_precedente',
  'perizia_ctp',
  'perizia_ctu',
  'spese_mediche',
]);

const NON_MEDICAL_DOC_TYPES = new Set([
  'memoria_difensiva',
  'documento_amministrativo',
  'certificato',
]);

const PERIZIA_DOC_TYPES = new Set([
  'perizia_precedente',
  'perizia_ctp',
  'perizia_ctu',
]);

function filterOcrForSection(
  spec: SectionSpec,
  docs: DocumentOcrContext[],
): DocumentOcrContext[] {
  // "misto" and "altro" documents are included in ALL sections — they may contain any type of content
  const isUniversal = (d: DocumentOcrContext) => d.documentType === 'altro' || d.documentType === 'misto';

  if (spec.dataSources.includes('events-medical') || spec.id === 'documentazione_sanitaria') {
    // Inclusive approach: include ALL documents EXCEPT known non-medical types.
    // This ensures pronto_soccorso, any new document type, or misclassified docs are never lost.
    return docs.filter((d) => !EXCLUDED_FROM_MEDICAL.has(d.documentType) || isUniversal(d));
  }
  if (spec.dataSources.includes('events-non-medical') || spec.id === 'documentazione_atti' || spec.id === 'premesse') {
    return docs.filter((d) => NON_MEDICAL_DOC_TYPES.has(d.documentType) || isUniversal(d));
  }
  if (spec.dataSources.includes('events-perizie') || spec.id === 'pareri_tecnici') {
    return docs.filter((d) => PERIZIA_DOC_TYPES.has(d.documentType) || isUniversal(d));
  }
  if (spec.dataSources.includes('events-expenses') || spec.id === 'spese_mediche') {
    return docs.filter((d) => d.documentType === 'spese_mediche' || isUniversal(d));
  }
  // Default: return all
  return docs;
}

// Exported for testing only
export { filterOcrForSection as _filterOcrForSection_test };
export { EXCLUDED_FROM_MEDICAL as _EXCLUDED_FROM_MEDICAL_test };

// ── PubMed formatting ─────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  diagnosis: 'Diagnosi e linee guida',
  treatment: 'Trattamento e outcomes',
  causal_nexus: 'Nesso causale ed evidenze prognostiche',
};

function formatPubMedReferencesForPrompt(results: PubMedSearchResult[]): string {
  if (results.length === 0) return '';

  // Group articles by category
  const grouped = new Map<string, PubMedSearchResult[]>();
  for (const result of results) {
    const key = result.category ?? 'diagnosis';
    const existing = grouped.get(key) ?? [];
    existing.push(result);
    grouped.set(key, existing);
  }

  const parts: string[] = ['## EVIDENZE SCIENTIFICHE PUBMED\n'];
  const categoryOrder = ['diagnosis', 'treatment', 'causal_nexus'];

  for (const category of categoryOrder) {
    const categoryResults = grouped.get(category);
    if (!categoryResults || categoryResults.length === 0) continue;

    const label = CATEGORY_LABELS[category] ?? category;
    parts.push(`### ${label}`);
    for (const result of categoryResults) {
      parts.push(`Ricerca: "${result.query}"`);
      for (const article of result.articles) {
        const doi = article.doi ? ` DOI: ${article.doi}.` : '';
        parts.push(`- ${article.authors}. ${article.title}. ${article.journal}. ${article.year}.${doi} PMID: ${article.pmid}`);
      }
    }
    parts.push('');
  }

  // Append causal nexus legal criteria
  const causalNexusText = formatCausalNexusForPrompt();
  if (causalNexusText) {
    parts.push('## CRITERI MEDICO-LEGALI PER IL NESSO CAUSALE');
    parts.push(causalNexusText);
    parts.push('');
  }

  return parts.join('\n');
}
