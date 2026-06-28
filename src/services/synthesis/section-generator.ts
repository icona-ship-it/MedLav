import {
  MISTRAL_MODELS,
  streamMistralChat,
  DETERMINISTIC_SEED,
  assertNotTruncated,
} from '@/lib/mistral/client';
import type { CaseType, CaseRole } from '@/types';
import { isExcludableLabEvent } from '@/lib/event-relevance';
import { stripLabBlocks } from '@/lib/lab-block-stripper';
import type { SynthesisParams } from './synthesis-service';
import type { SectionSpec, GeneratedSection, SectionContext } from './section-generation-types';
import { formatRoleDirectiveForPrompt } from './role-prompts';
import {
  ABSOLUTE_RULES,
  CHRONOLOGY_SOURCES_GUIDE,
  formatEventsForPrompt,
  formatEventsByDocumentForPrompt,
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
import { analyzeExpenses } from '@/services/expenses/expense-analyzer';
import { formatEuro, formatEventDateByPrecision } from '@/lib/format';
import { annotateDocSanitariaQuotes, annotateDocSanitariaQuotesGated } from '../validation/doc-sanitaria-quote-check';
import { EPICRISI_COMPLETAMENTO_GUIDE } from './section-placeholders';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import {
  HEADER_JSON_SCHEMA_DESCRIPTION,
  parseHeaderData,
  type HeaderData,
} from './header-schema';
import { renderHeaderMarkdown, variantForSectionId, overlayGiudizialeFromMetadata, buildOperativeCodaFromMetadata } from './header-template';
import { buildTailPrioritizedOcrInput } from './document-summarizer';
import { mergeUsage, createEmptyUsage } from '@/services/cost-tracking/cost-calculator';
import { logger } from '@/lib/logger';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { PubMedSearchResult } from '../pubmed/evidence-enricher';
import { formatCausalNexusForPrompt } from '@/lib/domain-knowledge/causal-nexus';

/** Timeout per section LLM call: 10 minutes (Vercel maxDuration is 800s, same budget as monolithic synthesis). */
const SECTION_TIMEOUT_MS = 600_000;

/**
 * Auto-split della documentazione sanitaria SELETTIVA sui casi voluminosi.
 * Causa (Lavini caso-2026-195, 217 eventi): una singola chiamata LLM sforava il
 * tetto token in output (finishReason=length) → tutti i retry fallivano →
 * fallback vuoto + banner "217 eventi omessi". Sopra la soglia la sezione è
 * generata in blocchi cronologici e concatenata, restando SELETTIVA (non il
 * deterministico verbatim, che gonfierebbe il report). Soglia/blocco scelti per
 * tenere l'output di ogni blocco ben sotto TOKENS_HUGE; i casi normali
 * (< soglia eventi) restano un'unica chiamata, comportamento invariato.
 */
const DOC_SANITARIA_CHUNK_THRESHOLD = 80;
const DOC_SANITARIA_CHUNK_SIZE = 50;

/**
 * Random seed for a given Inngest retry attempt (Sprint 2.4-A1).
 *
 * Why vary the seed: generation is deterministic (temperature 0 + fixed seed)
 * and the report validator BLOCKS saving on certain errors. With a fixed seed,
 * a validator false positive reproduces the SAME blocked report on every
 * Inngest retry — the 3 retries are burned on byte-identical output and the
 * case dies permanently (report-validator.ts admits this risk). Adding the
 * attempt number keeps the first run reproducible (seed 42) while making
 * retry 2 and 3 produce real variants that can pass the gate.
 */
export function seedForAttempt(attempt?: number): number {
  const extra = typeof attempt === 'number' && attempt > 0 ? Math.floor(attempt) : 0;
  return DETERMINISTIC_SEED + extra;
}

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
    let medical = filterMedicalEvents(events);
    // Lavini (perizia RC): esami ematochimici/di laboratorio di ROUTINE esclusi dalla
    // riproduzione. NB: un lab T1 load-bearing (es. D-dimero→TVP) resta — "mai perdere
    // un fatto" prevale (isExcludableLabEvent esclude solo i lab T2/T3).
    if (spec.excludeLabTests) {
      medical = medical.filter((e) => !isExcludableLabEvent(e));
      // I valori lab restano annegati negli eventi sopravvissuti su DUE campi riprodotti
      // dal prompt: il sourceText (citazione verbatim) E la description. Capita per i lab
      // T1 tenuti (diagnosi load-bearing) e per le cartelle con lab inline. Strip a livello
      // TESTO su entrambi: i NUMERI vanno, titolo/diagnosi (= il fatto) restano.
      medical = medical.map((e) => ({
        ...e,
        ...(e.sourceText ? { sourceText: stripLabBlocks(e.sourceText).text } : {}),
        ...(e.description ? { description: stripLabBlocks(e.description).text } : {}),
      }));
    }
    // Doc-sanitaria RC: gli eventi vanno RAGGRUPPATI PER DOCUMENTO (un atto = un blocco,
    // come il gold), non per-evento (564 voci frammentate = il gonfiore 3,7x su Bigon).
    if (spec.id === 'documentazione_sanitaria') {
      parts.push(`## DOCUMENTAZIONE SANITARIA RAGGRUPPATA PER DOCUMENTO (${new Set(medical.map((e) => e.documentId)).size} documenti, ${medical.length} reperti)\n\n${formatEventsByDocumentForPrompt(medical)}\n`);
    } else {
      parts.push(`## EVENTI CLINICI (${medical.length} medici su ${events.length} totali)\n\n${formatEventsForPrompt(medical)}\n`);
    }
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
  // QA 2026-06-11: l'epicrisi citava "totale di euro [da compilare]" mentre la
  // tabella spese deterministica aveva già il totale — il dato calcolato va
  // fornito esplicitamente al prompt (stessa fonte della tabella: analyzeExpenses).
  if (spec.id === 'epicrisi') {
    const expenseRows = synthesisParams.events.map((e) => ({
      event_type: e.eventType,
      title: e.title,
      description: e.description,
      event_date: e.eventDate,
      facility: e.facility ?? null,
      source_type: e.sourceType,
    }));
    const expenseTotal = analyzeExpenses(expenseRows).totalAmount;
    if (expenseTotal !== null && expenseTotal > 0) {
      parts.push(`TOTALE SPESE MEDICHE DOCUMENTATE (calcolo deterministico, stesso valore della tabella spese): ${formatEuro(expenseTotal)}. Usa ESATTAMENTE questo importo nella riga sulle spese. NON dichiararle "congrue/giustificate" né esprimere giudizi di congruità: è valutazione riservata al perito (lascia eventualmente un placeholder). NON inventare un totale diverso.\n`);
    } else {
      parts.push('SPESE MEDICHE: non risultano spese mediche risarcibili documentate (out-of-pocket del danneggiato) nel fascicolo. NON inventare un totale di spesa né dichiarare spese "esibite/congrue": al più rimanda alla tabella spese e lascia che il perito integri eventuali ricevute.\n');
    }
  }

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
      let filteredOcr = filterOcrForSection(spec, documentsOcrText);
      // Canale DOMINANTE dei lab (perizia RC): i valori vivono dentro l'OCR grezzo delle
      // cartelle (non in un documento lab a sé). Strip dei blocchi-lab a livello TESTO.
      if (spec.excludeLabTests) filteredOcr = filteredOcr.map(stripLabFromOcrContext);
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
  /** Inngest retry attempt (0-based). Varies the seed so retries are real variants. */
  attempt?: number;
  /** Internal: set by the doc-sanitaria auto-split to avoid infinite recursion. */
  disableChunking?: boolean;
}): Promise<GeneratedSection> {
  const { spec, synthesisParams, previousContext, documentsOcrText, attempt, disableChunking } = params;
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
    return generateHeaderSection({ spec, synthesisParams, attempt });
  }

  // Auto-split selettivo della documentazione sanitaria sui casi voluminosi:
  // una singola chiamata sforerebbe il tetto token in output. Si genera in
  // blocchi cronologici e si concatena (vedi DOC_SANITARIA_CHUNK_*).
  if (
    !disableChunking &&
    spec.id === 'documentazione_sanitaria' &&
    !spec.isPlaceholder &&
    synthesisParams.events.length > DOC_SANITARIA_CHUNK_THRESHOLD
  ) {
    return generateDocSanitariaChunked({ spec, synthesisParams, previousContext, documentsOcrText, attempt });
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
    randomSeed: seedForAttempt(attempt),
    label: `section:${spec.id}`,
  });

  if (finishReason === 'length') {
    const msg = `Sezione "${spec.id}" TRONCATA dal LLM (finishReason=length, ${content.length} chars). Sezione incompleta — il sistema ritenterà.`;
    logger.error('section-generator', msg);
    throw new Error(msg);
  }

  // QA 2026-06-11: the LLM occasionally wraps the whole section in a markdown
  // code fence (the Tedesco epicrisi shipped fenced). Una perizia non contiene mai
  // codice → toglierle è sempre sicuro. (Riapplicato anche DOPO CoVe, vedi sotto.)
  const cleanedContent = stripCodeFences(content);
  if (cleanedContent !== content.trim()) {
    logger.warn('section-generator', `Section "${spec.id}": stripped code fence(s)`);
  }

  // Optional Chain-of-Verification post-processing for high-stakes sections.
  // ENABLED BY DEFAULT (Wave 3.1); set LEGMED_COVE_ENABLED=false to disable. See cove-verifier.ts.
  let finalContent = cleanedContent;
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
        draftContent: cleanedContent,
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

  // CoVe può RE-avvolgere la revisione in un code-fence DOPO lo strip iniziale
  // (bug Bigon v4: l'Epicrisi rivista da CoVe arrivava monospace). Riapplica lo strip
  // sul risultato post-CoVe, prima delle append deterministiche.
  finalContent = stripCodeFences(finalContent);

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
    excludeLabTests: spec.excludeLabTests,
  });

  // Context summary (rolling, per le sezioni successive) calcolato PRIMA di
  // appendere la nota di fedeltà, così la nota non inquina il contesto (#8).
  const contextSummary = spec.contextMaxChars > 0
    ? summarizeForContext(finalContent, spec.contextMaxChars)
    : '';

  if (fidelity.note) finalContent += fidelity.note;

  // Doc-sanitaria (tutti i ruoli): togli il codice classificatore A-/B-/C-/D- che
  // l'LLM copia nei titoli grassetto dei blocchi-documento (leak su Bigon, ~336).
  // Backstop deterministico; la radice è già tolta in formatEventsByDocumentForPrompt.
  if (spec.id === 'documentazione_sanitaria' && !spec.isPlaceholder) {
    finalContent = stripClassifierCodeFromDocSanitariaTitles(finalContent);
  }

  // Doc-sanitaria SELETTIVA (default dal 2026-06-12): ogni citazione «...»
  // viene hard-verificata contro l'OCR sorgente — una citazione non riscontrata
  // viene annotata visibilmente, mai consegnata come fedele. Gira in TUTTI i
  // path (pipeline batched, pipeline singola, rigenerazione).
  if (spec.id === 'documentazione_sanitaria' && !spec.isPlaceholder
    && documentsOcrText && documentsOcrText.length > 0) {
    // RC (excludeLabTests): NIENTE marker ⚠️ inline nella perizia firmata (Lavini
    // 2026-06-28) — il contenuto resta pulito, resta solo il log di audit.
    const checked = annotateDocSanitariaQuotesGated(finalContent, documentsOcrText, { excludeLabTests: spec.excludeLabTests });
    finalContent = checked.annotatedMarkdown;
    if (checked.ungroundedCount > 0) {
      const auditOnly = spec.excludeLabTests ? ' (audit; marker non renderizzati)' : ' — annotate per il perito';
      logger.warn('section-generator', `Doc-sanitaria: ${checked.ungroundedCount}/${checked.total} citazioni non riscontrate nell'OCR${auditOnly}`);
    }
  } else if (spec.verifyQuotes && !spec.isPlaceholder
    && documentsOcrText && documentsOcrText.length > 0) {
    // Sezioni che riproducono VERBATIM atti/pareri (documentazione_atti, premesse,
    // pareri_tecnici): le citazioni "..." sono hard-verificate contro l'OCR — una
    // citazione fabbricata/alterata (es. una percentuale di invalidità modificata
    // in una conclusione CTP) viene annotata, mai consegnata come fedele.
    const checked = annotateDocSanitariaQuotes(finalContent, documentsOcrText, { annotateStraightQuotes: true });
    finalContent = checked.annotatedMarkdown;
    if (checked.ungroundedCount > 0) {
      logger.warn('section-generator', `Sezione "${spec.id}": ${checked.ungroundedCount}/${checked.total} citazioni non riscontrate nell'OCR — annotate per il perito`);
    }
  }

  // Citazioni in PROSA (NO_EVN_RULE): togli i riferimenti tra parentesi quadre
  // `[Tipo, dd.mm.yyyy]` che l'LLM emette in Epicrisi/sezioni analitiche (~58 su Bigon).
  // Backstop deterministico sul corpo LLM, PRIMA delle append deterministiche (coda
  // quesiti, scaffold Epicrisi) — così i placeholder [N]/[DATA] dello scaffold restano
  // intatti. ESCLUSE le sezioni di RIPRODUZIONE VERBATIM (doc-sanitaria, atti/pareri):
  // lì un `[…]` potrebbe vivere dentro una citazione «…»/"…" fedele.
  if (spec.id !== 'documentazione_sanitaria' && !spec.verifyQuotes) {
    finalContent = stripBracketedDocRefs(finalContent);
  }

  // Benchmark gold 2026-06-10 (3/3 CTU-RC): il blocco operativo dell'incarico
  // (CC.TT.P., ausiliario, inizio operazioni, termini, fondo spese,
  // provvedimenti) SEGUE i quesiti — coda deterministica dai metadati
  // autoritativi. L'intestazione lo omette quando la sezione Quesiti è nel
  // piano (renderGiudizialeHeader, quesitiInPlan).
  if (spec.id === 'quesiti') {
    const coda = buildOperativeCodaFromMetadata(synthesisParams.periziaMetadata);
    if (coda) finalContent += `\n\n${coda}`;
  }

  // Epicrisi (stragiudiziale RC): appendi DETERMINISTICAMENTE (1) i FATTI calcolati
  // — giorni di ricovero inclusivi + durata complessiva malattia, via marker espanso a
  // read-time (l'LLM li rifiutava/sbagliava); poi (2) lo scaffold di completamento del
  // perito (nesso, ITT graduata 4 fasce, danno biologico, sofferenza, art.138). Prima lo
  // scaffold era solo nel prompt → l'LLM non lo emetteva (guida_present=0 su Bigon).
  if (spec.id === 'epicrisi') {
    finalContent += `\n\n${DETERMINISTIC_MARKERS.ITT_RICOVERO_FACTS}\n\n${EPICRISI_COMPLETAMENTO_GUIDE}`;
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
 * Spezza un array in blocchi di dimensione `size` (l'ultimo può essere più corto).
 * Puro e testabile. size <= 0 → un solo blocco con tutto.
 */
export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** ISO date → DD.MM.YYYY (senza dipendenze; fallback alla stringa originale).
 * La data sentinella 1900-01-01 (evento senza data: fatture/spese/atti non datati)
 * NON va mai stampata come "01.01.1900" → è un leak che il validator blocca
 * (sentinel_date_leak). Reso come "s.d." (senza data). */
function isoToItDate(iso: string): string {
  if (!iso || iso.startsWith('1900-01-01')) return 's.d.';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || 's.d.');
}

/**
 * Backstop deterministico (fix Bigon): toglie il codice classificatore A-/B-/C-/D-
 * in testa ai titoli GRASSETTO della doc-sanitaria. Il codice arriva da
 * SOURCE_TYPE_LABELS ("B - REFERTI...") e l'LLM lo copiava nell'intestazione del
 * blocco ("**B - Referto di controllo medico, in data 01.01.2002:**"). La radice è
 * già tolta in formatEventsByDocumentForPrompt; questo copre la non-determinismo
 * dell'LLM e il nudge di CHRONOLOGY_SOURCES_GUIDE.
 *
 * Ancorato a: inizio del grassetto (^\*\*) + SOLO i 4 codici [A-D] + separatore
 * (trattino/en-dash). Non tocca prosa che inizia con "A - ", titoli legittimi
 * ("**Cartella clinica...**"), né lettere fuori range (E-Z).
 */
export function stripClassifierCodeFromDocSanitariaTitles(markdown: string): string {
  return markdown.replace(/^(\*\*)\s*[A-D]\s*[-–]\s+/gm, '$1');
}

/**
 * Backstop deterministico (fix Bigon Epicrisi, ~58): toglie i riferimenti-citazione
 * tra parentesi quadre del tipo `[Tipo documento, dd.mm.yyyy]` che l'LLM emetteva
 * (es. "[Ricovero, 13.11.2024]") nonostante la regola "cita in prosa". Il discriminante
 * è una DATA dd.mm.yyyy DENTRO le parentesi: così risparmia
 *  - i placeholder dello scaffold perito: [N], [X], [DATA], [DIAGNOSI IN MAIUSCOLO], [classe/voce]
 *  - [da compilare dal perito], [DA VERIFICARE], [Sezione non producibile: ...]
 *  - le citazioni scientifiche con anno NUDO: [Autore, Rivista, 2020]
 *  - i marker deterministici <!--MEDLAV:...--> (sono commenti HTML, non parentesi quadre)
 * Richiede iniziale MAIUSCOLA (il Tipo documento) e la data completa prima di `]`.
 */
const BRACKETED_DOC_REF = /[ \t]?\[[A-ZÀ-Ÿ][^[\]\n]{0,80}?\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\][ \t]?/g;
export function stripBracketedDocRefs(text: string): string {
  return text.replace(BRACKETED_DOC_REF, ' ').replace(/[ \t]+([.,;:])/g, '$1');
}

/**
 * Toglie un wrapper markdown ``` attorno al contenuto di una sezione: l'LLM a volte
 * avvolge l'intera sezione in un code-fence → renderizzerebbe monospace (bug Bigon v4
 * sull'Epicrisi). Gestisce il wrapper completo (```lang\n...\n```) e le fence sparse.
 * Una perizia non contiene mai codice, quindi toglierle è sempre sicuro. Idempotente —
 * per questo va riapplicato DOPO CoVe, che può re-introdurre un fence nella revisione.
 */
export function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fullFence = trimmed.match(/^```[a-z]*\n([\s\S]*?)\n?```$/);
  if (fullFence) return fullFence[1].trim();
  if (/```/.test(trimmed)) return trimmed.replace(/```[a-z]*\n?/g, '').trim();
  return trimmed;
}

/**
 * Elenco analitico COMPLETO degli atti (uno per evento, ordine cronologico),
 * costruito in modo deterministico da TUTTI gli eventi: in split mode i singoli
 * blocchi LLM omettono l'indice (ne vedrebbero solo una fetta), così l'indice
 * resta completo e accurato senza costare token.
 */
/**
 * Chunka gli eventi PER DOCUMENTO senza mai spezzare un documento tra due blocchi
 * (impacchetta i gruppi-documento fino a ~maxSize eventi). Usato dalla doc-sanitaria RC
 * voluminosa: così il raggruppamento per-documento regge anche col chunking (Bigon).
 */
export function chunkEventsByDocument(events: ConsolidatedEvent[], maxSize: number): ConsolidatedEvent[][] {
  const byDoc = new Map<string, ConsolidatedEvent[]>();
  const order: string[] = [];
  for (const e of events) {
    if (!byDoc.has(e.documentId)) { byDoc.set(e.documentId, []); order.push(e.documentId); }
    byDoc.get(e.documentId)!.push(e);
  }
  const chunks: ConsolidatedEvent[][] = [];
  let cur: ConsolidatedEvent[] = [];
  for (const id of order) {
    const group = byDoc.get(id) ?? [];
    if (cur.length > 0 && cur.length + group.length > maxSize) { chunks.push(cur); cur = []; }
    cur.push(...group);
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks.length > 0 ? chunks : [[]];
}

export function buildAttiIndex(events: ConsolidatedEvent[]): string {
  const lines = events.map((e) => {
    const who = (e.facility || e.doctor || '').trim();
    const tipo = e.eventType ? e.eventType.charAt(0).toUpperCase() + e.eventType.slice(1) : 'Documento';
    // Data precision-aware: una menzione "solo anno" non diventa "01.01.YYYY" (fix Bigon).
    return `- ${tipo}${who ? ` — ${who}` : ''} (${formatEventDateByPrecision(e.eventDate, e.datePrecision)})`;
  });
  return `**Elenco analitico degli atti sanitari esaminati (${lines.length}, in ordine cronologico):**\n\n${lines.join('\n')}`;
}

/** Direttiva per-blocco: niente indice/intestazione, solo narrazione continua. */
export function buildDocSanitariaChunkSpec(spec: SectionSpec, index: number, total: number): SectionSpec {
  const continua = index > 0 ? ', proseguendo senza ripetere i blocchi precedenti' : '';
  // RC (excludeLabTests): la nota NON deve spingere alla "narrazione selettiva" (= parafrasi),
  // ma riprodurre VERBATIM un blocco per DOCUMENTO (coerente con DOC_SANITARIA_RC_DIRECTIVE).
  const note = spec.excludeLabTests
    ? `\n\nNOTA OPERATIVA (blocco ${index + 1} di ${total}): per la mole documentale la sezione è in ${total} blocchi concatenati. NON produrre alcun elenco/indice degli atti né intestazioni di sezione. Per i SOLI documenti qui forniti riproduci il loro contenuto clinico VERBATIM tra «...», UN blocco per documento (come da direttiva), senza riassumere e senza parafrasare${continua}.`
    : `\n\nNOTA OPERATIVA (blocco ${index + 1} di ${total}): per la mole documentale questa sezione è prodotta in ${total} blocchi cronologici, poi concatenati. NON produrre l'ELENCO ANALITICO iniziale degli atti (viene aggiunto separatamente) né intestazioni di sezione: redigi SOLO la narrazione cronologica selettiva dei SOLI eventi qui forniti${continua}.`;
  return { ...spec, promptDirective: `${spec.promptDirective}${note}` };
}

/**
 * Genera la documentazione sanitaria SELETTIVA in blocchi cronologici e li
 * concatena: mantiene lo stile selettivo (conciso) ma scala a qualsiasi numero
 * di eventi senza sforare il tetto token in output. MAI vuota: se un blocco
 * fallisce lascia un marker localizzato e prosegue; solo se TUTTI i blocchi
 * falliscono rilancia (→ retry/fallback esterno).
 */
async function generateDocSanitariaChunked(params: {
  spec: SectionSpec;
  synthesisParams: SynthesisParams;
  previousContext: SectionContext[];
  documentsOcrText?: DocumentOcrContext[];
  attempt?: number;
}): Promise<GeneratedSection> {
  const { spec, synthesisParams, previousContext, documentsOcrText, attempt } = params;
  // RC: chunk per-DOCUMENTO (un atto non viene spezzato tra blocchi → niente duplicazione);
  // altri ruoli: chunk per-evento come prima.
  const chunks = spec.excludeLabTests
    ? chunkEventsByDocument(synthesisParams.events, DOC_SANITARIA_CHUNK_SIZE)
    : chunkArray(synthesisParams.events, DOC_SANITARIA_CHUNK_SIZE);
  logger.info('section-generator', `Doc-sanitaria auto-split: ${synthesisParams.events.length} eventi → ${chunks.length} blocchi`);

  const parts: string[] = [];
  let rollingContext: SectionContext[] = [...previousContext];
  let totalUsage = createEmptyUsage();
  let okChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const sub = await generateSingleSection({
        spec: buildDocSanitariaChunkSpec(spec, i, chunks.length),
        synthesisParams: { ...synthesisParams, events: chunks[i] },
        previousContext: rollingContext,
        documentsOcrText,
        attempt,
        disableChunking: true,
      });
      const body = sub.content.trim();
      if (body.length > 0) {
        parts.push(body);
        rollingContext = [...rollingContext, { id: spec.id, title: spec.title, contextSummary: sub.contextSummary }];
        if (sub.usage) totalUsage = mergeUsage(totalUsage, sub.usage);
        okChunks++;
      }
    } catch (err) {
      const chunk = chunks[i];
      const range = chunk.length > 0
        ? `${isoToItDate(chunk[0].eventDate)} – ${isoToItDate(chunk[chunk.length - 1].eventDate)}`
        : '';
      logger.error('section-generator', `Doc-sanitaria blocco ${i + 1}/${chunks.length} (${range}) fallito: ${err instanceof Error ? err.message : 'unknown'}`);
      parts.push(`*[⚠ Blocco ${i + 1}/${chunks.length} (${range}) non generato per un errore tecnico — usare "Rigenera sezione" per completarlo.]*`);
    }
  }

  if (okChunks === 0) {
    throw new Error(`Doc-sanitaria auto-split: tutti i ${chunks.length} blocchi falliti`);
  }

  // RC (perizia "semplice", gold Lavini): NIENTE elenco-inventario degli atti (era
  // l'"Elenco analitico degli atti sanitari esaminati (415...)" su Bigon). Altri ruoli: invariato.
  const content = [...(spec.excludeLabTests ? [] : [buildAttiIndex(synthesisParams.events)]), ...parts].join('\n\n');
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
  const contextSummary = spec.contextMaxChars > 0 ? summarizeForContext(content, spec.contextMaxChars) : '';
  logger.info('section-generator', `Doc-sanitaria auto-split completato: ${okChunks}/${chunks.length} blocchi ok, ${wordCount} parole`);

  return { id: spec.id, title: spec.title, content, contextSummary, wordCount, usage: totalUsage };
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
  /** RC stragiudiziale: sopprime la nota di fedeltà (è falsa — il testo è verbatim da OCR). */
  excludeLabTests?: boolean;
}): { mode?: 'ocr_complete' | 'ocr_truncated' | 'summaries'; note?: string } {
  if (!params.needsOcr) return {};
  const usedSummaries = params.summaryCount > 0;
  const mode = usedSummaries ? 'summaries' : (params.truncatedByCap ? 'ocr_truncated' : 'ocr_complete');
  let note: string | undefined;
  // RC (perizia firmata, decisione Lavini 2026-06-28): NIENTE nota "generata da N
  // riassunti automatici". È anche FALSA per RC: la doc-sanitaria è riprodotta verbatim
  // dall'OCR scoped per-batch, non dai riassunti. Il mode resta per telemetria/HRS.
  if (usedSummaries && params.sectionId.startsWith('documentazione') && !params.excludeLabTests) {
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
    // Lavini (perizia RC): se excludeLabTests, scarta anche i referti di laboratorio.
    return docs.filter((d) =>
      (!EXCLUDED_FROM_MEDICAL.has(d.documentType) || isUniversal(d)) &&
      !(spec.excludeLabTests && d.documentType === 'esame_laboratorio'),
    );
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

/**
 * Strip dei blocchi-lab da ogni pagina OCR di un documento (perizia RC, excludeLabTests).
 * Mappa immutabile; ricalcola totalChars così che la truncation a valle usi le lunghezze reali.
 */
function stripLabFromOcrContext(doc: DocumentOcrContext): DocumentOcrContext {
  const pages = doc.pages.map((p) => ({ ...p, ocrText: stripLabBlocks(p.ocrText).text }));
  const totalChars = pages.reduce((sum, p) => sum + p.ocrText.length, 0);
  return { ...doc, pages, totalChars };
}

// Exported for testing only
export { filterOcrForSection as _filterOcrForSection_test };
export { stripLabFromOcrContext as _stripLabFromOcrContext_test };
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

/**
 * Build the JSON-only system prompt for the intestazione sections. The
 * constitutional preamble + anti-fabrication rule + JSON schema description
 * are sufficient — no role directive needed (the role only affects narrative
 * tone, not data extraction). The LLM's job is purely: read events + metadata,
 * fill a fixed schema with what's there, leave the rest null.
 *
 * Exported so computeSectionalPromptVersion can hash the REAL header prompt
 * (Sprint 2.3): any change here changes the prompt-version of new reports.
 */
export function buildHeaderSystemPrompt(): string {
  return `${CONSTITUTIONAL_PREAMBLE}

---

Sei un assistente medico-legale incaricato di estrarre i dati anagrafici e di incarico per l'intestazione di un report. Il tuo unico compito è produrre un OGGETTO JSON conforme allo schema sottostante.

${ANTI_FABRICATION_RULE}

REGOLA REFUSAL JSON: per OGNI campo del JSON: se il dato non è esplicitamente presente nei metadati o nei documenti/eventi forniti dall'utente, scrivi \`null\`. NON DEDURRE, NON INFERIRE, NON COMPLETARE con valori plausibili.

${HEADER_JSON_SCHEMA_DESCRIPTION}

${NEGATIVE_FEW_SHOT_INTESTAZIONE}

OUTPUT: ESCLUSIVAMENTE l'oggetto JSON validato. NIENTE prefazione, niente backticks, niente commenti.`;
}

async function generateHeaderSection(params: {
  spec: SectionSpec;
  synthesisParams: SynthesisParams;
  attempt?: number;
}): Promise<GeneratedSection> {
  const { spec, synthesisParams, attempt } = params;
  const startMs = Date.now();

  const variant = variantForSectionId(spec.id, synthesisParams.caseRole) ?? 'stragiudiziale';

  const systemPrompt = buildHeaderSystemPrompt();

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
    randomSeed: seedForAttempt(attempt),
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
