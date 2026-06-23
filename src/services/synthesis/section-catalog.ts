/**
 * Section catalog FACADE (Sprint 2.6 split): plan resolution, condition
 * evaluation, section selector metadata and the doc-sanitaria on-demand
 * variants. The section templates live in the role catalogs:
 *   - catalog-shared.ts        → token tiers, condition sets, prompt fragments
 *   - catalog-ctu.ts           → CTU/CTP sections + penale/decesso transforms
 *   - catalog-stragiudiziale.ts → stragiudiziale sections
 *   - catalog-pareri.ts        → parere pro veritate / scopo riserva sections
 *
 * Consumers keep importing EVERYTHING from this module (re-exports at the
 * bottom) — the split is mechanical and byte-identical in the prompt strings,
 * so generation_metadata.promptVersion (ADR-011) is unchanged.
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
  PREMESSE_ATTI_EXCLUSION,
  PREMESSE_STANDALONE_NOTE,
  DOC_SANITARIA_SELECTIVE_DIRECTIVE,
  DOC_SANITARIA_RC_RULES,
} from './catalog-shared';
import {
  CTU_SECTIONS,
  CTP_SECTIONS,
  CONSIDERAZIONI_PENALE_SECTION,
  applyPenaleSections,
  applyDecessoSections,
} from './catalog-ctu';
import { STRAGIUDIZIALE_SECTIONS } from './catalog-stragiudiziale';
import { PARERE_PRO_VERITATE_SECTIONS, PARERE_SCOPO_RISERVA_SECTIONS } from './catalog-pareri';

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
    case 'has-perizia-metadata':
      return !!(ctx.periziaMetadata && (
        ctx.periziaMetadata.tribunale ||
        (ctx.periziaMetadata.quesiti && ctx.periziaMetadata.quesiti.length > 0)
      ));

    case 'has-quesiti':
      return !!(ctx.periziaMetadata?.quesiti && ctx.periziaMetadata.quesiti.length > 0);

    case 'has-non-medical-docs':
      return ctx.documentTypes.some((t) => NON_MEDICAL_DOC_TYPES.has(t)) ||
        ctx.events.some((e) => e.eventType === 'documento_amministrativo' || e.eventType === 'certificato');

    case 'has-legal-docs':
      return ctx.documentTypes.some((t) => LEGAL_DOC_TYPES.has(t));

    case 'has-expense-events':
      return ctx.events.some((e) => EXPENSE_EVENT_TYPES.has(e.eventType));

    case 'has-perizie-docs':
      return ctx.documentTypes.some((t) => PERIZIA_DOC_TYPES.has(t));

    case 'has-conciliazione-procedure': {
      // Tentativo di conciliazione: dovuto nell'ATP ex art. 696-bis c.p.c.
      // (funzione conciliativa) MA ANCHE quando il Giudice lo demanda con il
      // quesito "tenti la conciliazione" in causa ordinaria (benchmark gold
      // 2026-06-10). Si testa quindi tipoProcedimento + testo dei quesiti.
      const quesitiText = (ctx.periziaMetadata?.quesiti ?? []).join(' ');
      return /\b696[\s-]?bis\b|concilia/i.test(
        `${ctx.periziaMetadata?.tipoProcedimento ?? ''} ${quesitiText}`,
      );
    }

    case 'has-ausiliario':
      // Accertamento specialistico dell'Ausiliario: solo se nominato nei metadati.
      return !!ctx.periziaMetadata?.collaboratoreName?.trim();

    case 'has-ctp-nominati':
      // Preventivi/proforme dei CC.TT.P.: solo se almeno un CTP è nominato.
      return !!(ctx.periziaMetadata?.ctpRicorrente?.trim() || ctx.periziaMetadata?.ctpResistente?.trim());

    default:
      return false;
  }
}

// ── RC medico-legale: sezioni compilate dal perito ─────────────────

/** Module id della perizia medico-legale di Responsabilità Civile. */
const RC_CIVILE_MODULE_ID = 'perizia_ml_rc_civile';

/**
 * Per le perizie RC medico-legali, "Dati Anamnestici" e "Il Fatto e la Storia
 * Clinica" sono compilati dal perito nel form info-perizia. Quando i campi sono
 * valorizzati, trasformiamo quelle sezioni in placeholder DETERMINISTICI (testo
 * del perito, nessuna generazione LLM) — coerente col nord di prodotto: ciò che
 * il perito scrive non viene reinterpretato dall'AI.
 * Se i campi mancano, la sezione resta affidata all'LLM (fallback invariato).
 */
function applyRcPeritoSections(
  specs: SectionSpec[],
  periziaMetadata?: PeriziaMetadata,
): SectionSpec[] {
  if (!periziaMetadata) return specs;

  const anamnesiMarkdown = renderAnamnesiMarkdown(periziaMetadata);
  const ilFatto = periziaMetadata.ilFattoEStoriaClinica?.trim();

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
 * del report": l'intestazione e la sezione conclusiva di ciascun ruolo. Una
 * perizia senza queste non è un documento valido/depositabile.
 */
export const MANDATORY_SECTION_IDS: ReadonlySet<string> = new Set([
  'intestazione',
  'intestazione_stragiudiziale',
  'intestazione_parere',
  'considerazioni_ml', // CTU/CTP civile — considerazioni/conclusioni
  'considerazioni_penale', // CTU/CTP penale — considerazioni/conclusioni
  'epicrisi', // stragiudiziale — conclusioni
  'conclusioni_parere', // parere — conclusioni
]);

/**
 * Elenco delle sezioni che POSSONO comparire nel report per questo ruolo/modulo,
 * con titolo e flag `mandatory` — alimenta il selettore "Sezioni del report" del
 * form info-perizia. Non filtra per condizioni-dati: il perito sceglie; le sezioni
 * senza dati semplicemente non verranno generate.
 */
export function getSelectableSections(
  caseRole: CaseRole,
  moduleId?: string,
  ambitoPenale?: boolean,
): Array<{ id: string; title: string; mandatory: boolean }> {
  let specs: SectionSpec[];
  if (moduleId === 'parere_pro_veritate') specs = PARERE_PRO_VERITATE_SECTIONS;
  else if (moduleId === 'parere_scopo_riserva') specs = PARERE_SCOPO_RISERVA_SECTIONS;
  else if (caseRole === 'ctp') specs = CTP_SECTIONS;
  else if (caseRole === 'stragiudiziale') specs = STRAGIUDIZIALE_SECTIONS;
  else specs = CTU_SECTIONS;
  // Ambito penale (CTU/CTP role-based): il selettore mostra considerazioni_penale
  // e NON le spese mediche (civilistiche), coerente con resolveSectionPlan.
  if (ambitoPenale && (caseRole === 'ctu' || caseRole === 'ctp') &&
      moduleId !== 'parere_pro_veritate' && moduleId !== 'parere_scopo_riserva' &&
      moduleId !== RC_CIVILE_MODULE_ID) {
    specs = applyPenaleSections(specs);
  }
  return specs.map((s) => ({ id: s.id, title: s.title, mandatory: MANDATORY_SECTION_IDS.has(s.id) }));
}

/**
 * Resolve the full section plan for a case.
 * Returns an ordered array of SectionSpec, with role-specific structure
 * and conditional sections filtered by available data.
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
  const { caseRole, periziaMetadata, events, documentTypes, moduleId } = params;

  const conditionCtx: ConditionContext = {
    events,
    documentTypes,
    periziaMetadata,
  };

  // Module-specific section templates take priority over role-based ones
  let baseSections: SectionSpec[];
  if (moduleId === 'parere_pro_veritate') {
    baseSections = PARERE_PRO_VERITATE_SECTIONS;
  } else if (moduleId === 'parere_scopo_riserva') {
    baseSections = PARERE_SCOPO_RISERVA_SECTIONS;
  } else {
    // Select role-specific section template
    switch (caseRole) {
      case 'ctu':
        baseSections = CTU_SECTIONS;
        break;
      case 'ctp':
        baseSections = CTP_SECTIONS;
        break;
      case 'stragiudiziale':
        baseSections = STRAGIUDIZIALE_SECTIONS;
        break;
      default:
        baseSections = CTU_SECTIONS;
    }
  }

  // Filter by conditions
  const conditionFilteredRaw = baseSections.filter((spec) => {
    if (!spec.condition) return true;
    return evaluateCondition(spec.condition, conditionCtx);
  });

  // QA 2026-06-11: la sezione "Quesiti" della CTU/CTP non sparisce mai (i gold
  // la hanno in 6 casi su 6) — senza quesiti nel form degrada a placeholder
  // guidato, così il perito vede DOVE vanno e li inserisce dall'editor.
  const hasQuesiti = !!(periziaMetadata?.quesiti && periziaMetadata.quesiti.length > 0);
  const conditionFiltered = conditionFilteredRaw.map((spec) => (
    spec.id === 'quesiti' && !hasQuesiti
      ? {
        ...spec,
        isPlaceholder: true,
        maxTokens: 0,
        dataSources: [],
        placeholderText: '*[Inserire qui, come unico blocco virgolettato fedele all\'ordinanza di conferimento, i quesiti formulati dal Giudice — con la numerazione originale. I quesiti non erano presenti nei dati della perizia al momento della generazione.]*',
      } as SectionSpec
      : spec
  )).map((spec) => (
    // Decisione medici 2026-06-12: la documentazione sanitaria nasce SELETTIVA
    // (narrativa che virgoletta verbatim i passaggi significativi, citazioni
    // hard-verificate vs OCR, routine parafrasata) — la riproduzione INTEGRALE
    // da 100+ pagine "prende troppe informazioni" e resta disponibile con
    // docSanitariaMode: 'integrale' o on-demand dall'editor.
    spec.id === 'documentazione_sanitaria' && periziaMetadata?.docSanitariaMode !== 'integrale'
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

  // Benchmark gold 2026-06-10: premesse e documentazione_atti sono mutuamente
  // esclusive — 5 gold su 6 riproducono ricorsi/memorie UNA sola volta dentro
  // "I Dati della Documentazione in Atti" (LEGAL_DOC_TYPES ⊂ NON_MEDICAL_DOC_TYPES
  // attiverebbe entrambe sugli stessi atti, duplicandoli). Premesse resta
  // raggiungibile escludendo documentazione_atti dal selettore (profilo Del Porto);
  // in quel caso la sua directive diventa STANDALONE (copre anche gli
  // stragiudiziali, che altrimenti sparirebbero dal report).
  const filtered = selectorFiltered.some((s) => s.id === 'documentazione_atti')
    ? selectorFiltered.filter((s) => s.id !== 'premesse')
    : selectorFiltered.map((s) => (s.id === 'premesse'
      ? { ...s, promptDirective: s.promptDirective.replace(PREMESSE_ATTI_EXCLUSION, PREMESSE_STANDALONE_NOTE) }
      : s));

  // Ambito penale (CTU/CTP role-based): considerazioni civilistiche → penali e
  // niente spese mediche. Non si applica ai moduli parere/RC (civilistici).
  const penaleApplicable = !!periziaMetadata?.ambitoPenale &&
    (caseRole === 'ctu' || caseRole === 'ctp') &&
    moduleId !== 'parere_pro_veritate' &&
    moduleId !== 'parere_scopo_riserva' &&
    moduleId !== RC_CIVILE_MODULE_ID;
  // Decesso (civile): variante considerazioni/operazioni senza visita né ITT/ITP.
  // In penale non si applica (la morte è già il fulcro di considerazioni_penale).
  const penaleOrDecesso = penaleApplicable
    ? applyPenaleSections(filtered)
    : (periziaMetadata?.decesso ? applyDecessoSections(filtered) : filtered);
  const roleAdjusted = penaleOrDecesso;

  // RC medico-legale: anamnesi + il_fatto compilati dal perito → deterministici
  if (moduleId === RC_CIVILE_MODULE_ID) {
    return applyRcPeritoSections(roleAdjusted, periziaMetadata);
  }

  return roleAdjusted;
}

/**
 * Resolve the CANONICAL SectionSpec for a single section id, ignoring inclusion
 * conditions and the section selector (the perito explicitly asked to regenerate
 * THIS section, so we want its spec regardless of whether a condition would have
 * excluded it from a fresh plan). Penale/RC transforms ARE applied so the spec
 * matches what the case actually uses (e.g. considerazioni_penale, RC deterministic).
 *
 * Used by the single-section regeneration path so it inherits the exact same
 * promptDirective / token budget / intestazione routing as initial generation.
 */
export function getSectionSpecById(
  sectionId: string,
  caseRole: CaseRole,
  moduleId?: string,
  periziaMetadata?: PeriziaMetadata,
): SectionSpec | undefined {
  let base: SectionSpec[];
  if (moduleId === 'parere_pro_veritate') {
    base = PARERE_PRO_VERITATE_SECTIONS;
  } else if (moduleId === 'parere_scopo_riserva') {
    base = PARERE_SCOPO_RISERVA_SECTIONS;
  } else {
    switch (caseRole) {
      case 'ctu': base = CTU_SECTIONS; break;
      case 'ctp': base = CTP_SECTIONS; break;
      case 'stragiudiziale': base = STRAGIUDIZIALE_SECTIONS; break;
      default: base = CTU_SECTIONS;
    }
  }

  const penaleApplicable = !!periziaMetadata?.ambitoPenale &&
    (caseRole === 'ctu' || caseRole === 'ctp') &&
    moduleId !== 'parere_pro_veritate' &&
    moduleId !== 'parere_scopo_riserva' &&
    moduleId !== RC_CIVILE_MODULE_ID;
  let sections = penaleApplicable
    ? applyPenaleSections(base)
    : (periziaMetadata?.decesso ? applyDecessoSections(base) : base);
  if (moduleId === RC_CIVILE_MODULE_ID) {
    sections = applyRcPeritoSections(sections, periziaMetadata);
  }

  return sections.find((s) => s.id === sectionId);
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
    // Perizia RC stragiudiziale (excludeLabTests = marker RC): appende le regole
    // di Lavini (PS condensato, verbatim della sostanza, lab esclusi). Altri ruoli
    // (CTU/CTP) usano la direttiva selettiva invariata.
    promptDirective: spec.excludeLabTests
      ? `${DOC_SANITARIA_SELECTIVE_DIRECTIVE}\n\n${DOC_SANITARIA_RC_RULES}`
      : DOC_SANITARIA_SELECTIVE_DIRECTIVE,
  };
}

/**
 * Get all possible section IDs for a given role/module (for validation/parsing).
 */
export function getAllSectionIds(caseRole: CaseRole, moduleId?: string): string[] {
  // Module-specific sections take priority
  if (moduleId === 'parere_pro_veritate') {
    return PARERE_PRO_VERITATE_SECTIONS.map((s) => s.id);
  }
  if (moduleId === 'parere_scopo_riserva') {
    return PARERE_SCOPO_RISERVA_SECTIONS.map((s) => s.id);
  }

  switch (caseRole) {
    case 'ctu':
      // considerazioni_penale: variante penale, swappata in resolveSectionPlan.
      return [...CTU_SECTIONS.map((s) => s.id), CONSIDERAZIONI_PENALE_SECTION.id];
    case 'ctp':
      return [...CTP_SECTIONS.map((s) => s.id), CONSIDERAZIONI_PENALE_SECTION.id];
    case 'stragiudiziale':
      return STRAGIUDIZIALE_SECTIONS.map((s) => s.id);
    default:
      return [...CTU_SECTIONS.map((s) => s.id), CONSIDERAZIONI_PENALE_SECTION.id];
  }
}

// ── Re-exports (consumers/tests keep importing from this facade) ────

export { CTU_SECTIONS, CTP_SECTIONS } from './catalog-ctu';
export { STRAGIUDIZIALE_SECTIONS } from './catalog-stragiudiziale';
export {
  PARERE_PRO_VERITATE_SECTIONS,
  PARERE_SCOPO_RISERVA_SECTIONS,
} from './catalog-pareri';
