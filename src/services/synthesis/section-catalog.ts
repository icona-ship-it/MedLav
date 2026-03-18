import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { SectionSpec, SectionCondition } from './section-generation-types';
import { getExpectedSectionIds } from './case-type-templates';
import { getCaseTypeKnowledge, getCombinedCaseTypeKnowledge } from '@/lib/domain-knowledge';

// ── Token budget constants ──────────────────────────────────────────
// Mistral Large max output: 32,768 tokens.
// Each section runs in its own Inngest step with full Vercel budget (800s),
// so there's no competition between sections. Max out critical sections.

/** Max output for the most critical section (documentazione sanitaria). */
const MAX_TOKENS_CRITICAL = 32_768;

/** Max output for large content sections (atti, premesse, pareri, elementi). */
const MAX_TOKENS_LARGE = 16_384;

/** Max output for medium sections (riassunto, specialty). */
const MAX_TOKENS_MEDIUM = 8_192;

/** Max output for small sections (intestazione, spese, conclusioni). */
const MAX_TOKENS_SMALL = 8_192;

// ── Universal section definitions ───────────────────────────────────

const UNIVERSAL_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione',
    title: 'Premesse e Profilo Metodologico',
    maxTokens: MAX_TOKENS_SMALL,
    dataSources: ['perizia-metadata'],
    contextMaxChars: 500,
    needsOcr: false,
    condition: 'has-perizia-metadata',
    promptDirective: `Genera le premesse formali della perizia medico-legale.
Includi:
- Conferimento dell'incarico (Tribunale, n. RG, Giudice)
- Parti coinvolte (ricorrente, resistente, CTP nominati)
- Date rilevanti (conferimento incarico, inizio operazioni, termine deposito)
- Profilo metodologico: metodo di lavoro adottato (esame documentazione, criteri valutativi)
Stile formale da perizia depositabile in tribunale.`,
  },
  {
    id: 'documentazione_atti',
    title: 'Dati della Documentazione in Atti',
    maxTokens: MAX_TOKENS_LARGE,
    dataSources: ['events-non-medical'],
    contextMaxChars: 800,
    needsOcr: true,
    condition: 'has-non-medical-docs',
    promptDirective: `Riproduci FEDELMENTE il contenuto rilevante dei documenti NON sanitari presenti nel fascicolo:
ricorsi, memorie difensive, atti di citazione, testimonianze, dichiarazioni, verbali di udienza, provvedimenti del Giudice.
Stile: riporta il contenuto essenziale virgolettato o in forma di riassunto fedele, con indicazione della fonte.
FORMATO CITAZIONE per ogni documento:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."`,
  },
  {
    id: 'premesse',
    title: 'Premesse',
    maxTokens: MAX_TOKENS_LARGE,
    dataSources: ['events-non-medical'],
    contextMaxChars: 800,
    needsOcr: true,
    condition: 'has-legal-docs',
    promptDirective: `Riproduci FEDELMENTE il contenuto delle memorie difensive e dei ricorsi presenti nel fascicolo.
Per ogni documento usa il FORMATO CITAZIONE:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."
Riporta le posizioni delle parti e le argomentazioni giuridiche presentate.`,
  },
  {
    id: 'documentazione_sanitaria',
    title: 'Dati della Documentazione Sanitaria',
    maxTokens: MAX_TOKENS_CRITICAL,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 2000,
    needsOcr: true,
    promptDirective: `Genera la riproduzione DETTAGLIATA e FEDELE della documentazione sanitaria in ordine cronologico.
Questa e la sezione PIU LUNGA e IMPORTANTE del report. OGNI evento fornito DEVE comparire.

FORMATO CITAZIONE OBBLIGATORIO per OGNI documento/episodio clinico:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele riprodotto dal documento originale ..." (X)

Dove (X) e la categoria fonte: (A) Cartella Clinica, (B) Referti Controlli, (C) Radiologici/Strumentali, (D) Ematochimici.

Regole:
- Intestazione GRASSETTO con tipo, autore/struttura e data, seguita da contenuto tra VIRGOLETTE
- Diari clinici giornalieri: un bullet per ogni giorno con formato: DD.MM.YYYY: "..."
- Tabelle esami lab: riportare TUTTI i valori, una tabella PER DATA/PRELIEVO (formato pipe markdown)
- Verbali operatori: riprodurre INTEGRALMENTE
- Scrivi in PROSA DISCORSIVA, MAI elenchi puntati per la narrazione clinica
- Se sono disponibili immagini diagnostiche, inseriscile INLINE subito dopo la citazione pertinente
- NON omettere NESSUN evento. NON sintetizzare.`,
  },
  {
    id: 'spese_mediche',
    title: 'Spese Mediche Esibite',
    maxTokens: MAX_TOKENS_SMALL,
    dataSources: ['events-expenses'],
    contextMaxChars: 500,
    needsOcr: true,
    condition: 'has-expense-events',
    promptDirective: `Elenca le spese mediche documentate in tabella markdown con colonne: Data | Descrizione | Struttura | Importo.
Per ogni voce valuta congruita e necessita rispetto al quadro clinico documentato.
Includi un totale a fine tabella.`,
  },
  {
    id: 'pareri_tecnici',
    title: 'Precedenti Pareri Tecnici',
    maxTokens: MAX_TOKENS_LARGE,
    dataSources: ['events-perizie'],
    contextMaxChars: 800,
    needsOcr: true,
    condition: 'has-perizie-docs',
    promptDirective: `Riproduci le conclusioni e l'analisi delle perizie precedenti (CTP, CTU, perizie precedenti) in forma virgolettata fedele.
Per ogni perizia usa il FORMATO CITAZIONE:
**Tipo perizia, autore, in data DD.MM.YYYY:** "... conclusioni e analisi ..."
Se sono disponibili immagini diagnostiche citate nei pareri, inseriscile INLINE dopo la citazione pertinente.`,
  },
  {
    id: 'riassunto',
    title: 'Riassunto del Caso',
    maxTokens: MAX_TOKENS_MEDIUM,
    dataSources: ['context-summaries'],
    contextMaxChars: 1000,
    needsOcr: false,
    promptDirective: `Scrivi una sintesi AMPIA e COMPLETA della vicenda clinica in 6-10 paragrafi.
Questo e il quadro d'insieme che il medico legale legge per primo.
Deve coprire:
1. Presentazione del paziente e motivo del contenzioso
2. Anamnesi remota rilevante (patologie pregresse, condizioni pre-esistenti)
3. Evento indice (l'episodio clinico oggetto di valutazione) con cronologia essenziale
4. Iter diagnostico-terapeutico principale
5. Complicanze eventualmente insorte e loro gestione
6. Esiti e situazione clinica attuale del paziente
7. Documentazione esaminata e sua completezza
Non ripetere dettagli gia esposti nelle sezioni documentali precedenti.
Basa il riassunto ESCLUSIVAMENTE sui context summary delle sezioni precedenti e sugli eventi forniti.`,
  },
  // Slot 8: specialty sections are inserted here by resolveSectionPlan()
  {
    id: 'elementi_rilievo',
    title: 'Elementi per la Valutazione Medico-Legale',
    maxTokens: MAX_TOKENS_LARGE,
    dataSources: ['anomalies', 'missing-docs', 'calculations', 'context-summaries', 'guidelines'],
    contextMaxChars: 1500,
    needsOcr: false,
    promptDirective: `Genera la sezione "Elementi per la Valutazione Medico-Legale" con le seguenti sotto-sezioni:

### Profili critici documentati
Per OGNI criticita riscontrata, scrivi un paragrafo fattuale con:
- FATTO OGGETTIVO dalla documentazione [Ev.N]
- Standard di riferimento applicabile [Fonte, Anno]
- Elementi documentali a supporto [Ev.N]
- Elementi documentali contrari o attenuanti [Ev.N]
NON esprimere giudizi su responsabilita.

### Elementi per la valutazione del nesso causale
Per ogni collegamento: (1) FATTO documentato [Ev.N], (2) CONSEGUENZA clinica [Ev.N], (3) CRITERIO giuridico.

### Elementi per la quantificazione del danno
Periodi ITT/ITP con date esatte [Ev.N], criteri tabellari, esiti clinici, spese mediche documentate.

Includi anomalie e documenti mancanti rilevati dal sistema.
Scrivi in prosa fattuale, NON elenchi puntati.`,
  },
  {
    id: 'conclusioni',
    title: 'Sintesi Conclusiva',
    maxTokens: MAX_TOKENS_SMALL,
    dataSources: ['context-summaries', 'calculations', 'perizia-metadata'],
    contextMaxChars: 0, // last section, no need for context
    needsOcr: false,
    promptDirective: `Scrivi la sintesi conclusiva come paragrafo unico discorsivo.
Stile FATTUALE: "Dalla documentazione in atti esaminata risultano i seguenti elementi rilevanti..."
Includi:
- Riepilogo dei fatti principali emersi dalla documentazione
- Profili critici identificati con relativa evidenza documentale
- Dati quantitativi: periodi ITT/ITP con date, criteri tabellari applicabili
- Lacune documentali riscontrate e documentazione integrativa necessaria
Se ci sono quesiti del Giudice, per CIASCUN quesito presenta i fatti documentali pertinenti [Ev.N].
NON esprimere opinioni, giudizi o conclusioni su responsabilita o merito.
La sintesi deve contenere SOLO fatti gia trattati nel report. NON introdurre elementi nuovi.`,
  },
];

// ── Document type classification for conditions ─────────────────────

const NON_MEDICAL_DOC_TYPES = new Set([
  'memoria_difensiva',
  'documento_amministrativo',
  'certificato',
]);

const LEGAL_DOC_TYPES = new Set([
  'memoria_difensiva',
]);

const PERIZIA_DOC_TYPES = new Set([
  'perizia_precedente',
  'perizia_ctp',
  'perizia_ctu',
]);

const EXPENSE_EVENT_TYPES = new Set([
  'spesa_medica',
]);

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

    case 'has-non-medical-docs':
      return ctx.documentTypes.some((t) => NON_MEDICAL_DOC_TYPES.has(t)) ||
        ctx.events.some((e) => e.eventType === 'documento_amministrativo' || e.eventType === 'certificato');

    case 'has-legal-docs':
      return ctx.documentTypes.some((t) => LEGAL_DOC_TYPES.has(t));

    case 'has-expense-events':
      return ctx.events.some((e) => EXPENSE_EVENT_TYPES.has(e.eventType));

    case 'has-perizie-docs':
      return ctx.documentTypes.some((t) => PERIZIA_DOC_TYPES.has(t));

    default:
      return false;
  }
}

// ── Specialty section builder ───────────────────────────────────────

/**
 * Build SectionSpec entries from domain-knowledge specialty sections.
 * These go into the "slot 8" position between riassunto and elementi_rilievo.
 */
function buildSpecialtySections(
  caseTypes: CaseType[],
): SectionSpec[] {
  const knowledge = caseTypes.length === 1
    ? getCaseTypeKnowledge(caseTypes[0])
    : getCombinedCaseTypeKnowledge(caseTypes);

  // Filter out universal sections that we handle separately
  const universalIds = new Set(['riassunto', 'cronologia', 'elementi_rilievo']);

  return knowledge.reportSections
    .filter((s) => !universalIds.has(s.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      maxTokens: MAX_TOKENS_MEDIUM,
      dataSources: ['events', 'anomalies', 'guidelines', 'context-summaries'] as SectionSpec['dataSources'],
      contextMaxChars: 800,
      needsOcr: false,
      promptDirective: `Genera la sezione "${s.title}".
${s.description}
Basa l'analisi ESCLUSIVAMENTE sui fatti documentati [Ev.N].
Scrivi in prosa fattuale e formale da perizia medico-legale.
NON esprimere opinioni o giudizi.`,
    }));
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Resolve the full section plan for a case.
 * Returns an ordered array of SectionSpec, including conditional sections
 * and specialty sections from domain-knowledge.
 */
export function resolveSectionPlan(params: {
  caseType: CaseType;
  caseTypes?: CaseType[];
  caseRole: CaseRole;
  periziaMetadata?: PeriziaMetadata;
  events: ConsolidatedEvent[];
  documentTypes: string[];
}): SectionSpec[] {
  const {
    caseType, periziaMetadata, events, documentTypes,
  } = params;
  const effectiveTypes = params.caseTypes && params.caseTypes.length > 1
    ? params.caseTypes
    : [caseType];

  const conditionCtx: ConditionContext = {
    events,
    documentTypes,
    periziaMetadata,
  };

  // 1. Filter universal sections by condition
  const includedUniversal = UNIVERSAL_SECTIONS.filter((spec) => {
    if (!spec.condition) return true;
    return evaluateCondition(spec.condition, conditionCtx);
  });

  // 2. Build specialty sections from domain-knowledge
  const specialtySections = buildSpecialtySections(effectiveTypes);

  // 3. Insert specialty sections between 'riassunto' and 'elementi_rilievo'
  const result: SectionSpec[] = [];
  for (const spec of includedUniversal) {
    result.push(spec);
    if (spec.id === 'riassunto') {
      // Insert specialty sections after riassunto
      result.push(...specialtySections);
    }
  }

  return result;
}

/**
 * Get all possible section IDs (for validation/parsing).
 */
export function getAllSectionIds(caseTypes: CaseType | CaseType[]): string[] {
  const types = Array.isArray(caseTypes) ? caseTypes : [caseTypes];
  const universalIds = UNIVERSAL_SECTIONS.map((s) => s.id);
  const specialtyIds = getExpectedSectionIds(types)
    .filter((id) => !universalIds.includes(id));
  return [...universalIds, ...specialtyIds];
}
