import {
  MISTRAL_MODELS,
  streamMistralChat,
  DETERMINISTIC_SEED,
  assertNotTruncated,
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
import { runCoVe, isCoVeEnabled, COVE_ELIGIBLE_SECTION_IDS } from './cove-verifier';
import {
  CONSTITUTIONAL_PREAMBLE,
  REFUSAL_RULE,
  ANTI_FABRICATION_RULE,
  NEGATIVE_FEW_SHOT_INTESTAZIONE,
} from './peritale-formulations';
import { buildGuidelineContext } from '../rag/retrieval-service';
import {
  HEADER_JSON_SCHEMA_DESCRIPTION,
  parseHeaderData,
  type HeaderData,
} from './header-schema';
import { renderHeaderMarkdown, variantForSectionId, overlayGiudizialeFromMetadata, buildOperativeCodaFromMetadata } from './header-template';
import { buildTailPrioritizedOcrInput } from './document-summarizer';
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

  // Per-section reinforcement of the anti-fabrication contract:
  //   - REFUSAL_RULE: always — every LLM section must know how to refuse gracefully
  //   - ANTI_FABRICATION_RULE: always — short reinforcement of the constitutional rule
  //   - NEGATIVE_FEW_SHOT_INTESTAZIONE: only for intestazione sections, where the
  //     Regnoto incident showed fabrication is highest-stakes and most likely
  const isIntestazione = spec.id.startsWith('intestazione');
  const negativeShot = isIntestazione ? `\n\n${NEGATIVE_FEW_SHOT_INTESTAZIONE}` : '';

  return `${CONSTITUTIONAL_PREAMBLE}

---

Sei un sistema di organizzazione documentale medico-legale.
Il tuo compito e generare ESCLUSIVAMENTE la sezione "${spec.title}" di un report medico-legale.

## ISTRUZIONI PER QUESTA SEZIONE
${spec.promptDirective}

${ANTI_FABRICATION_RULE}

${REFUSAL_RULE}${negativeShot}

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
          // A7: tail-priority truncation (not a head-only slice). A plain
          // slice(0, N) drops the END of the OCR — exactly where the discharge
          // letter / final therapy live. buildTailPrioritizedOcrInput keeps the
          // head AND the closing pages. This is the <10-doc path (map-reduce off),
          // which is the path a few-but-huge-docs "caso grande" actually takes.
          ocrText = buildTailPrioritizedOcrInput(ocrText, MAX_OCR_CHARS_PER_SECTION);
          logger.warn('section-generator', `OCR text tail-priority truncated to ${MAX_OCR_CHARS_PER_SECTION} chars for section "${spec.id}" (was ${originalLength})`);
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

  // Bibliography: fall back to placeholder when no PubMed references available.
  // Restricted to the bibliografia section: other sections (e.g. epicrisi) list
  // pubmed-references as an OPTIONAL enrichment data source — they should still
  // run the LLM even when no PubMed refs are available, otherwise the output
  // would be an empty section title with no body.
  if (spec.id === 'bibliografia' &&
      (!synthesisParams.pubmedReferences || synthesisParams.pubmedReferences.length === 0)) {
    return {
      id: spec.id,
      title: spec.title,
      content: spec.placeholderText ?? '',
      contextSummary: '',
      wordCount: 0,
    };
  }

  // Header sections use a structured JSON-mode generation pipeline to make
  // fabrication structurally impossible (Wave 2.1, fix Regnoto-style hallucination).
  if (spec.id.startsWith('intestazione')) {
    return generateHeaderSection({ spec, synthesisParams });
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

  // Optional Chain-of-Verification post-processing for high-stakes sections.
  // ENABLED BY DEFAULT (Wave 3.1); set LEGMED_COVE_ENABLED=false to disable. See cove-verifier.ts.
  let finalContent = content;
  let coveMeta: Pick<
    GeneratedSection,
    'coveApplied' | 'coveQuestionCount' | 'coveUnsupportedCount' | 'coveRevised' |
    'coveBypassedDueToLlmFailure' | 'coveFailureReason'
  > = {};

  if (isCoVeEnabled() && COVE_ELIGIBLE_SECTION_IDS.has(spec.id)) {
    try {
      const eventsContext = formatEventsForPrompt(synthesisParams.events);
      const ocrContext = documentsOcrText && documentsOcrText.length > 0
        ? formatDocumentsOcrForPrompt(documentsOcrText)
        : undefined;

      const cove = await runCoVe({
        draftContent: content,
        sectionTitle: spec.title,
        eventsContext,
        ocrContext,
      });

      finalContent = cove.revisedContent;
      if (cove.llmStatus === 'failed') {
        // CoVe ran but at least one of the 3 phases failed silently. Surface
        // it: HRS scorer will penalize, and the section is *not* considered
        // verified for audit purposes.
        coveMeta = {
          coveApplied: false,
          coveBypassedDueToLlmFailure: true,
          coveFailureReason: cove.failureReason,
        };
        logger.error(
          'section-generator',
          `CoVe BYPASSED for ${spec.id} due to LLM failure: ${cove.failureReason}. Section saved without verification.`,
        );
      } else if (cove.llmStatus === 'skipped') {
        coveMeta = { coveApplied: false };
      } else {
        coveMeta = {
          coveApplied: true,
          coveQuestionCount: cove.questions.length,
          coveUnsupportedCount: cove.unsupportedFactsFound,
          coveRevised: cove.wasRevised,
        };
      }
    } catch (err) {
      // Defensive fallback (runCoVe is supposed to never throw post-refactor):
      // surface as bypass + reason so downstream still knows it's unverified.
      const reason = err instanceof Error ? err.message : String(err);
      logger.error('section-generator', `CoVe threw for ${spec.id}: ${reason}`);
      coveMeta = {
        coveApplied: false,
        coveBypassedDueToLlmFailure: true,
        coveFailureReason: `unexpected throw: ${reason}`,
      };
    }
  }

  // Sprint 1 S1.1 (Lavini quality, 2026-05-17): output-side cap enforcement.
  // The LLM ignores prompt-level "max N parole" instructions ~40% of the
  // time, especially on documentazione_sanitaria. If spec.maxChars is set
  // and exceeded, truncate at the LAST `\n\n## ` or `\n\n**` boundary
  // before the cap (intelligent cut at paragraph/heading, never mid-word).
  let truncatedByCap = false;
  let originalCharLength: number | undefined;
  if (spec.maxChars && finalContent.length > spec.maxChars) {
    originalCharLength = finalContent.length;
    const slice = finalContent.slice(0, spec.maxChars);
    // Find safest boundary: prefer last "\n\n**" (citation block), then "\n\n## "
    // (subsection), then "\n\n" (paragraph), then fall back to hard cut.
    let cutAt = slice.lastIndexOf('\n\n**');
    if (cutAt < spec.maxChars * 0.7) cutAt = slice.lastIndexOf('\n\n## ');
    if (cutAt < spec.maxChars * 0.7) cutAt = slice.lastIndexOf('\n\n');
    if (cutAt < spec.maxChars * 0.5) cutAt = spec.maxChars; // hard cut, no safe boundary nearby
    finalContent = finalContent.slice(0, cutAt) +
      '\n\n*[Sezione troncata automaticamente — ' +
      `originale ${originalCharLength} caratteri, cap ${spec.maxChars}. ` +
      'Il perito può rigenerare la sezione se serve più dettaglio.]*';
    truncatedByCap = true;
    logger.warn('section-generator',
      `Section "${spec.id}" truncated: ${originalCharLength} → ${finalContent.length} chars (cap=${spec.maxChars})`,
    );
  }

  // Trasparenza fedeltà: su casi voluminosi il map-reduce alimenta le sezioni
  // documentali con riassunti automatici (NON trascrizione verbatim). È silenzioso
  // di default — lo rendiamo VISIBILE al perito (decisione 2026-06-02).
  const summaryCount = synthesisParams.documentSummaries?.length ?? 0;
  const fidelity = fidelitySignal({
    needsOcr: spec.needsOcr,
    sectionId: spec.id,
    summaryCount,
    truncatedByCap,
  });

  // Context summary (rolling, per le sezioni successive) calcolato PRIMA di
  // appendere la nota di fedeltà, così la nota non inquina il contesto (#8).
  const contextSummary = spec.contextMaxChars > 0
    ? summarizeForContext(finalContent, spec.contextMaxChars)
    : '';

  if (fidelity.note) finalContent += fidelity.note;

  // Benchmark gold 2026-06-10 (3/3 CTU-RC): il blocco operativo dell'incarico
  // (CC.TT.P., ausiliario, inizio operazioni, termini, fondo spese,
  // provvedimenti) SEGUE i quesiti — coda deterministica dai metadati
  // autoritativi. L'intestazione lo omette quando la sezione Quesiti è nel
  // piano (renderGiudizialeHeader, quesitiInPlan).
  if (spec.id === 'quesiti') {
    const coda = buildOperativeCodaFromMetadata(synthesisParams.periziaMetadata);
    if (coda) finalContent += `\n\n${coda}`;
  }

  const wordCount = finalContent.split(/\s+/).filter((w) => w.length > 0).length;

  const elapsed = Date.now() - startMs;
  logger.info('section-generator',
    `Section "${spec.id}" done: ${wordCount} words, ${finalContent.length} chars, ${elapsed}ms${coveMeta.coveApplied ? ` (CoVe: ${coveMeta.coveUnsupportedCount}/${coveMeta.coveQuestionCount} unsupported, revised=${coveMeta.coveRevised})` : ''}`,
  );

  return {
    id: spec.id,
    title: spec.title,
    content: finalContent.trim(),
    contextSummary,
    wordCount,
    usage,
    ...coveMeta,
    ...(truncatedByCap ? { truncatedByCap, originalCharLength } : {}),
    ...(fidelity.mode ? { fidelityMode: fidelity.mode } : {}),
    ...(fidelity.mode === 'summaries' ? { fidelitySummaryCount: summaryCount } : {}),
  };
}

/**
 * Calcola il segnale di fedeltà di una sezione documentale e l'eventuale nota
 * visibile da appendere. Su casi voluminosi il map-reduce usa riassunti automatici
 * (NON verbatim): lo rendiamo trasparente al perito. Pura e testabile.
 */
export function fidelitySignal(params: {
  needsOcr: boolean;
  sectionId: string;
  summaryCount: number;
  truncatedByCap: boolean;
}): { mode?: 'ocr_complete' | 'ocr_truncated' | 'summaries'; note?: string } {
  if (!params.needsOcr) return {};
  const usedSummaries = params.summaryCount > 0;
  const mode = usedSummaries ? 'summaries' : (params.truncatedByCap ? 'ocr_truncated' : 'ocr_complete');
  let note: string | undefined;
  if (usedSummaries && params.sectionId.startsWith('documentazione')) {
    note = `\n\n*[⚠️ Nota di fedeltà: per la dimensione del fascicolo questa sezione è stata generata da ${params.summaryCount} riassunti automatici dei documenti, non dalla loro trascrizione integrale. Per la precisione legale delle citazioni virgolettate, fare riferimento ai documenti originali in atti.]*`;
  }
  return { mode, note };
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

// ── Structured header generation (Wave 2.1) ──────────────────────────
//
// The intestazione is the highest-stakes section for fabrication: when the
// perizia metadata is empty, the LLM previously invented entire patient
// identities (Regnoto incident → "Mario Bianchi"). To make fabrication
// structurally impossible, we generate the header in two stages:
//   1. LLM produces a JSON object that conforms to HeaderDataSchema. Missing
//      fields MUST be `null` (the prompt and schema both enforce this).
//   2. A pure-function template renders the JSON to markdown, mapping null
//      values to "[da compilare dal perito]" (or omitting them entirely).
// The model literally cannot write a name into a `null`-valued field that
// then gets rendered, because the rendering step is deterministic code.

async function generateHeaderSection(params: {
  spec: SectionSpec;
  synthesisParams: SynthesisParams;
}): Promise<GeneratedSection> {
  const { spec, synthesisParams } = params;
  const startMs = Date.now();

  const variant = variantForSectionId(spec.id, synthesisParams.caseRole) ?? 'stragiudiziale';

  // Build a JSON-only system prompt. The constitutional preamble + anti-
  // fabrication rule + JSON schema description are sufficient — no role
  // directive needed (the role only affects narrative tone, not data
  // extraction). The LLM's job is purely: read events + metadata, fill
  // a fixed schema with what's there, leave the rest null.
  const systemPrompt = `${CONSTITUTIONAL_PREAMBLE}

---

Sei un assistente medico-legale incaricato di estrarre i dati anagrafici e di incarico per l'intestazione di un report. Il tuo unico compito è produrre un OGGETTO JSON conforme allo schema sottostante.

${ANTI_FABRICATION_RULE}

REGOLA REFUSAL JSON: per OGNI campo del JSON: se il dato non è esplicitamente presente nei metadati o nei documenti/eventi forniti dall'utente, scrivi \`null\`. NON DEDURRE, NON INFERIRE, NON COMPLETARE con valori plausibili.

${HEADER_JSON_SCHEMA_DESCRIPTION}

${NEGATIVE_FEW_SHOT_INTESTAZIONE}

OUTPUT: ESCLUSIVAMENTE l'oggetto JSON validato. NIENTE prefazione, niente backticks, niente commenti.`;

  // User prompt: feed the perizia metadata + medical events (light projection)
  // so the LLM has everything it needs to extract real values.
  const userPrompt = buildHeaderUserPrompt(synthesisParams);

  // Call Mistral with JSON-object response format. This nudges the model to
  // produce strict JSON; combined with our Zod parse, it's a hard contract.
  const headerResult = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    maxTokens: spec.maxTokens,
    responseFormat: { type: 'json_object' },
    timeoutMs: SECTION_TIMEOUT_MS,
    randomSeed: DETERMINISTIC_SEED,
    label: `header:${spec.id}`,
  });
  assertNotTruncated(headerResult, `header:${spec.id}`);
  const { content, usage } = headerResult;

  // Parse + validate. If invalid, render with all-null data so we get a
  // safe "[da compilare dal perito]" output rather than fabricated values.
  const parsed = parseHeaderData(content);
  let headerData: HeaderData;
  if (parsed.error !== null) {
    logger.warn('section-generator', `Header JSON parse/validation failed for ${spec.id}: ${parsed.error}. Falling back to empty header.`);
    headerData = emptyHeaderData();
  } else {
    headerData = parsed.data;
  }

  // CTU/CTP: i campi formali d'incarico (tribunale, R.G., giudice, CC.TT.P., date
  // operazioni, fondo spese, tipo procedimento) provengono dai metadati che il
  // perito ha compilato — autoritativi e non fabbricabili. Sovrapponili sull'estratto
  // LLM così l'intestazione Del Porto è completa e deterministica.
  if (variant === 'ctu' || variant === 'ctp') {
    headerData = overlayGiudizialeFromMetadata(headerData, synthesisParams.periziaMetadata);
  }

  // Benchmark gold 2026-06-10: il template conosce l'ambito (penale vs civile)
  // e se la sezione Quesiti segue nel piano (formula-ponte vs rinvio ordinanza).
  const pm = synthesisParams.periziaMetadata;
  const markdown = renderHeaderMarkdown(headerData, {
    variant,
    ambitoPenale: pm?.ambitoPenale,
    quesitiInPlan:
      (pm?.quesiti?.length ?? 0) > 0 &&
      !(pm?.excludedReportSections ?? []).includes('quesiti'),
  });
  const wordCount = markdown.split(/\s+/).filter((w) => w.length > 0).length;

  const elapsed = Date.now() - startMs;
  logger.info(
    'section-generator',
    `Header section "${spec.id}" generated via JSON mode: ${wordCount} words, ${markdown.length} chars, ${elapsed}ms${parsed.error ? ' [PARSE_FAILED—rendered empty]' : ''}`,
  );

  return {
    id: spec.id,
    title: spec.title,
    content: markdown,
    contextSummary: '',
    wordCount,
    usage,
  };
}

function buildHeaderUserPrompt(params: SynthesisParams): string {
  const parts: string[] = [];

  // Perizia metadata (when present)
  const metaText = params.periziaMetadata
    ? formatPeriziaMetadataForPrompt(params.periziaMetadata)
    : '';
  if (metaText) {
    parts.push('## METADATI PERIZIA');
    parts.push(metaText);
    parts.push('');
  } else {
    parts.push('## METADATI PERIZIA');
    parts.push('(nessun metadato perizia fornito)');
    parts.push('');
  }

  // Medical events — these are the primary source for patient name, lesion,
  // event date, structure when metadata is empty. Truncate to keep the prompt
  // focused; the header only needs the first ~30 events to extract identity.
  const eventsToInclude = params.events.slice(0, 30);
  if (eventsToInclude.length > 0) {
    parts.push('## EVENTI CLINICI (primi 30 per estrazione dati identificativi e dell\'evento indice)');
    parts.push(formatEventsForPrompt(eventsToInclude));
    parts.push('');
    parts.push(
      'NOTA IMPORTANTE: il nome del paziente, la data di nascita, la struttura sanitaria, e l\'evento indice (es. "frattura collo femore sx", "caduta accidentale") sono spesso scritti nelle intestazioni delle cartelle cliniche e dei referti — leggili dal contenuto degli eventi sopra. Non inventare.',
    );
    parts.push('');
  } else {
    parts.push('## EVENTI CLINICI');
    parts.push('(nessun evento estratto dai documenti)');
    parts.push('');
  }

  parts.push('---');
  parts.push('Restituisci ESCLUSIVAMENTE l\'oggetto JSON conforme allo schema. Tutti i campi non documentati = `null`.');

  return parts.join('\n');
}

function emptyHeaderData(): HeaderData {
  return {
    perito: null,
    paziente: {
      nome: null,
      dataNascita: null,
      luogoNascita: null,
      residenza: null,
      codiceFiscale: null,
      telefono: null,
    },
    oggetto: {
      eventoIndice: null,
      dataEvento: null,
      lesione: null,
      struttura: null,
      ambito: null,
    },
    dataVisitaMedicoLegale: null,
    soggettoRichiedente: null,
    giudiziale: null,
  };
}
