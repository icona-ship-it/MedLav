/**
 * Section catalog FACADE: plan resolution, condition evaluation, section
 * selector metadata and the doc-sanitaria on-demand variants.
 *
 * rc-mvp fase 7: il catalogo è MONO-RUOLO — restano solo le 7 sezioni della
 * perizia RC stragiudiziale (catalog-stragiudiziale.ts). I cataloghi CTU/CTP
 * e pareri (con le transform penale/decesso) vivono in legacy/ e su main.
 * I frammenti condivisi (tier token, direttive doc-sanitaria) restano in
 * catalog-shared.ts.
 */
import type { CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { SectionSpec, SectionCondition } from './section-generation-types';
import { renderAnamnesiMarkdown } from './anamnesi-template';
import {
  NON_MEDICAL_DOC_TYPES,
  LEGAL_DOC_TYPES,
  PERIZIA_DOC_TYPES,
  EXPENSE_EVENT_TYPES,
  TOKENS_NONE,
  TOKENS_HUGE,
  DOC_SANITARIA_SELECTIVE_DIRECTIVE,
  DOC_SANITARIA_RC_DIRECTIVE,
} from './catalog-shared';
import { STRAGIUDIZIALE_SECTIONS } from './catalog-stragiudiziale';
import { isSsrCostNotification } from '@/services/expenses/expense-analyzer';

// ── Condition evaluation ────────────────────────────────────────────

interface ConditionContext {
  events: ConsolidatedEvent[];
  documentTypes: string[];
  periziaMetadata?: PeriziaMetadata;
}

/**
 * Evaluate whether a section condition is met.
 */
export function evaluateCondition(
  condition: SectionCondition,
  ctx: ConditionContext,
): boolean {
  switch (condition) {
    case 'has-non-medical-docs':
      return ctx.documentTypes.some((t) => NON_MEDICAL_DOC_TYPES.has(t)) ||
        ctx.events.some((e) => e.eventType === 'documento_amministrativo' || e.eventType === 'certificato');

    case 'has-legal-docs':
      return ctx.documentTypes.some((t) => LEGAL_DOC_TYPES.has(t));

    case 'has-expense-events':
      // Spese REALI (out-of-pocket del danneggiato): le notifiche-costo SSR/SSN non sono
      // risarcibili e vengono escluse dalla tabella (analyzeExpenses) → se restano SOLO
      // quelle, la sezione Spese sarebbe vuota ("Nessuna spesa documentata"). Meglio
      // OMETTERE la sezione del tutto (direttiva utente: niente avvisi di assenza).
      return ctx.events.some((e) =>
        EXPENSE_EVENT_TYPES.has(e.eventType) && !isSsrCostNotification(e.title, e.description),
      );

    case 'has-perizie-docs':
      return ctx.documentTypes.some((t) => PERIZIA_DOC_TYPES.has(t));

    case 'has-ausiliario':
      // Accertamento specialistico dell'Ausiliario: solo se nominato nei metadati.
      return !!ctx.periziaMetadata?.collaboratoreName?.trim();

    default:
      return false;
  }
}

// ── RC medico-legale: sezioni compilate dal perito ─────────────────

/**
 * Per le perizie RC medico-legali, "Dati Anamnestici" e "Il Fatto e la Storia
 * Clinica" rispettano il nord di prodotto "l'AI non reinterpreta ciò che il perito
 * scrive":
 * - campo COMPILATO nel form perizia → placeholder col testo del perito (verbatim,
 *   nessuna generazione LLM su un testo che il perito ha già scritto);
 * - campo VUOTO → si lascia la spec LLM del catalogo invariata: l'AI genera una
 *   BOZZA dai documenti (Anamnesi = solo dati documentati; Fatto/Storia = prosa
 *   stile-benchmark Antoniazzi), che il perito poi rifinisce. (Decisione utente
 *   2026-06-29: meglio una bozza editabile che uno scaffold bianco; il fuori-stile
 *   che aveva motivato lo scaffold — tag [A/B/C/D] + tassonomia — è risolto dai
 *   cleanup C1/C5.)
 * La "Visita Clinica" resta sempre placeholder (è la visita in presenza, non è nei doc).
 */
function applyRcPeritoSections(
  specs: SectionSpec[],
  periziaMetadata?: PeriziaMetadata,
): SectionSpec[] {
  const anamnesiMarkdown = periziaMetadata ? renderAnamnesiMarkdown(periziaMetadata) : '';
  const ilFatto = periziaMetadata?.ilFattoEStoriaClinica?.trim();

  return specs.map((spec) => {
    if (spec.id === 'anamnesi' && anamnesiMarkdown) {
      return { ...spec, isPlaceholder: true, maxTokens: TOKENS_NONE, placeholderText: anamnesiMarkdown };
    }
    if (spec.id === 'il_fatto_e_storia_clinica' && ilFatto) {
      return { ...spec, isPlaceholder: true, maxTokens: TOKENS_NONE, placeholderText: ilFatto };
    }
    return spec;
  });
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Sezioni strutturali SEMPRE incluse, non disattivabili dal selettore "Sezioni
 * del report": l'intestazione e la sezione conclusiva. Una perizia senza queste
 * non è un documento valido/depositabile.
 */
export const MANDATORY_SECTION_IDS: ReadonlySet<string> = new Set([
  'intestazione_stragiudiziale',
  'epicrisi', // stragiudiziale — conclusioni
]);

/**
 * Elenco delle sezioni che POSSONO comparire nel report, con titolo e flag
 * `mandatory` — alimenta il selettore "Sezioni del report" del form
 * info-perizia. Non filtra per condizioni-dati: il perito sceglie; le sezioni
 * senza dati semplicemente non verranno generate.
 */
export function getSelectableSections(): Array<{ id: string; title: string; mandatory: boolean }> {
  return STRAGIUDIZIALE_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    mandatory: MANDATORY_SECTION_IDS.has(s.id),
  }));
}

/**
 * Ordine capitoli del perito (feedback beta 2026-07-20): riordina le sezioni
 * secondo `sectionOrder` (id canonici). Invarianti di documento valido:
 * l'intestazione resta SEMPRE prima e l'epicrisi SEMPRE ultima, qualunque cosa
 * dica l'ordine salvato. Id sconosciuti ignorati; sezioni non elencate mantengono
 * l'ordine di catalogo e vanno DOPO quelle elencate (prima dell'epicrisi).
 * Generica su {id} così ordina sia le SectionSpec sia le opzioni del selettore.
 */
export function applySectionOrder<T extends { id: string }>(
  items: T[],
  sectionOrder?: string[],
): T[] {
  if (!sectionOrder || sectionOrder.length === 0) return items;
  const pos = new Map(sectionOrder.map((id, i) => [id, i]));
  const rank = (item: T, catalogIndex: number): number => {
    if (item.id === 'intestazione_stragiudiziale') return Number.MIN_SAFE_INTEGER;
    if (item.id === 'epicrisi') return Number.MAX_SAFE_INTEGER;
    const p = pos.get(item.id);
    return p !== undefined ? p : sectionOrder.length + catalogIndex;
  };
  return items
    .map((item, i) => ({ item, r: rank(item, i) }))
    .sort((a, b) => a.r - b.r)
    .map(({ item }) => item);
}

/**
 * Resolve the full section plan for a case.
 * Returns an ordered array of SectionSpec with conditional sections filtered
 * by available data.
 */
export function resolveSectionPlan(params: {
  caseType: string;
  caseTypes?: string[];
  caseRole: CaseRole;
  periziaMetadata?: PeriziaMetadata;
  events: ConsolidatedEvent[];
  documentTypes: string[];
  moduleId?: string;
}): SectionSpec[] {
  const { periziaMetadata, events, documentTypes } = params;

  const conditionCtx: ConditionContext = {
    events,
    documentTypes,
    periziaMetadata,
  };

  const baseSections: SectionSpec[] = STRAGIUDIZIALE_SECTIONS;

  // Filter by conditions
  const conditionFilteredRaw = baseSections.filter((spec) => {
    if (!spec.condition) return true;
    return evaluateCondition(spec.condition, conditionCtx);
  });

  const conditionFiltered = conditionFilteredRaw.map((spec) => (
    // Decisione medici 2026-06-12: la documentazione sanitaria nasce SELETTIVA
    // (narrativa che virgoletta verbatim i passaggi significativi, citazioni
    // hard-verificate vs OCR, routine parafrasata) — la riproduzione INTEGRALE
    // da 100+ pagine "prende troppe informazioni" e resta disponibile con
    // docSanitariaMode: 'integrale' o on-demand dall'editor.
    // 'rubriche' (2026-09-04): come 'integrale' è un placeholder deterministico
    // espanso a lettura, ma con i soli passaggi-chiave per rubrica (doc-rubriche/).
    spec.id === 'documentazione_sanitaria'
      && periziaMetadata?.docSanitariaMode !== 'integrale'
      && periziaMetadata?.docSanitariaMode !== 'rubriche'
      ? buildDocSanitariaSelectiveSpec(spec)
      : spec
  ));

  // Selettore "Sezioni del report": il perito può disattivare le sezioni OPZIONALI
  // (risparmio token + report su misura). Le sezioni MANDATORY non sono mai rimosse.
  // Lista assente/vuota = tutte le sezioni (retrocompatibile coi casi esistenti).
  const excluded = periziaMetadata?.excludedReportSections;
  const selectorFiltered = excluded && excluded.length > 0
    ? conditionFiltered.filter((spec) => MANDATORY_SECTION_IDS.has(spec.id) || !excluded.includes(spec.id))
    : conditionFiltered;

  // Ordine capitoli del perito (intestazione/epicrisi restano fisse agli estremi).
  const ordered = applySectionOrder(selectorFiltered, periziaMetadata?.sectionOrder);

  // RC medico-legale: anamnesi + il_fatto compilati dal perito → deterministici
  return applyRcPeritoSections(ordered, periziaMetadata);
}

/**
 * Resolve the CANONICAL SectionSpec for a single section id, ignoring inclusion
 * conditions and the section selector (the perito explicitly asked to regenerate
 * THIS section, so we want its spec regardless of whether a condition would have
 * excluded it from a fresh plan). Le transform RC-perito SONO applicate così la
 * spec coincide con quella della generazione iniziale.
 *
 * Used by the single-section regeneration path so it inherits the exact same
 * promptDirective / token budget / intestazione routing as initial generation.
 */
/**
 * Alias CANONICI → id di catalogo (prova dal vivo 224, 2026-07-17): il parser
 * canonicalizza per titolo ("I Dati Anamnestici" → 'i_dati_anamnestici') mentre
 * il catalogo usa 'anamnesi'. La revisione automatica e il bottone "Correggi
 * con AI" arrivano coi canonici dei claim-finding e devono risolvere comunque.
 */
const CANONICAL_SECTION_ALIASES: Record<string, string> = {
  i_dati_anamnestici: 'anamnesi',
};

export function getSectionSpecById(
  sectionId: string,
  periziaMetadata?: PeriziaMetadata,
): SectionSpec | undefined {
  const sections = applyRcPeritoSections(STRAGIUDIZIALE_SECTIONS, periziaMetadata);
  const resolved = CANONICAL_SECTION_ALIASES[sectionId] ?? sectionId;
  return sections.find((s) => s.id === resolved);
}

/**
 * On-demand "elaborated (AI)" variant of the documentazione_sanitaria spec: the
 * default spec is a deterministic placeholder (verbatim OCR, no LLM), but it
 * still carries the full LLM promptDirective + OCR config. This returns the spec
 * with the placeholder short-circuit disabled, so the perito can explicitly
 * regenerate the LLM-elaborated version (translation, lab tables, grouping) when
 * they want readability over the raw verbatim. No-op for non-placeholder specs.
 */
export function buildDocSanitariaLlmSpec(spec: SectionSpec): SectionSpec {
  if (spec.id !== 'documentazione_sanitaria' || !spec.isPlaceholder) return spec;
  // Restore the LLM runtime config (the placeholder zeroes it); the per-role
  // promptDirective is kept dormant on the spec and reused as-is.
  return {
    ...spec,
    isPlaceholder: false,
    maxTokens: TOKENS_HUGE,
    maxChars: 60_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1500,
    needsOcr: true,
  };
}

/**
 * On-demand "selective (AI)" variant of documentazione_sanitaria — the THIRD
 * mode (alongside the deterministic-verbatim default and the integral-readable
 * LLM variant). It produces a chronological clinical narrative that QUOTES the
 * significant findings verbatim (diagnoses, lesion descriptions, prognosis,
 * contested declarations) and PARAPHRASES routine content, never losing a
 * clinically relevant fact. Reserves «...» for verbatim citation so every quote
 * can be hard-verified against the OCR downstream (verifyGeneratedQuotes).
 * No-op for non-placeholder specs.
 */
export function buildDocSanitariaSelectiveSpec(spec: SectionSpec): SectionSpec {
  if (spec.id !== 'documentazione_sanitaria' || !spec.isPlaceholder) return spec;
  return {
    ...spec,
    isPlaceholder: false,
    maxTokens: TOKENS_HUGE,
    maxChars: 60_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1500,
    needsOcr: true,
    // Perizia RC stragiudiziale (excludeLabTests = marker RC): directive DEDICATO
    // trascrizione fedele (feedback beta 2026-07-20: verbatim sostanzialmente
    // integrale, niente inventario né parafrasi, PS integrale, lab esclusi).
    promptDirective: spec.excludeLabTests
      ? DOC_SANITARIA_RC_DIRECTIVE
      : DOC_SANITARIA_SELECTIVE_DIRECTIVE,
  };
}

/**
 * Get all possible section IDs (for validation/parsing).
 */
export function getAllSectionIds(): string[] {
  return STRAGIUDIZIALE_SECTIONS.map((s) => s.id);
}

// ── Re-exports (consumers/tests keep importing from this facade) ────

export { STRAGIUDIZIALE_SECTIONS } from './catalog-stragiudiziale';
