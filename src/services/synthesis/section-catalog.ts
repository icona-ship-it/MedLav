import type { CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { SectionSpec, SectionCondition } from './section-generation-types';

// ── Token budget constants (calibrated for 5,000-8,000 word reports) ──

/** Documentazione sanitaria — the longest, ~50% of report. */
const TOKENS_CRITICAL = 32_768;

/** Large content sections: atti, premesse, pareri — must reproduce faithfully, need full budget. */
const TOKENS_LARGE = 16_384;

/** Medium sections: epicrisi, conclusioni, spese, fatto_storia_clinica. */
const TOKENS_MEDIUM = 8_192;

/** Small sections: intestazione, quesiti, profilo. */
const TOKENS_SMALL = 2_048;

/** Placeholder sections — no LLM call. */
const TOKENS_NONE = 0;

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

// ── Shared prompt fragments ─────────────────────────────────────────

const NO_EVN_RULE = 'Cita i documenti per tipo, autore e data. NON usare riferimenti numerati agli eventi.';

const CITATION_FORMAT = `FORMATO CITAZIONE per ogni documento:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."`;

// ── CTU Giudiziale sections (15) ────────────────────────────────────

const CTU_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione',
    title: 'Intestazione',
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata'],
    contextMaxChars: 300,
    needsOcr: false,
    condition: 'has-perizia-metadata',
    promptDirective: `Genera l'intestazione formale della perizia medico-legale.
Includi:
- Tribunale, Sezione, numero di Ruolo Generale
- Giudice delegato/istruttore
- Parti coinvolte: ricorrente (con dati identificativi), resistente, eventuali chiamati in causa
- Consulenti Tecnici di Parte nominati da ciascuna parte
- Data di conferimento dell'incarico, data di giuramento se disponibile
- Termini per l'invio della bozza, per le osservazioni dei CTP e per il deposito definitivo
Stile formale da perizia depositabile in tribunale, passato remoto.
${NO_EVN_RULE}`,
  },
  {
    id: 'quesiti',
    title: 'Quesiti',
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata'],
    contextMaxChars: 500,
    needsOcr: false,
    condition: 'has-quesiti',
    promptDirective: `Riproduci FEDELMENTE e INTEGRALMENTE i quesiti del Giudice cosi come formulati nell'ordinanza di conferimento.
Numera ciascun quesito progressivamente.
NON modificare, riassumere o parafrasare il testo dei quesiti.
Se un quesito contiene sotto-punti, riportali tutti fedelmente.
${NO_EVN_RULE}`,
  },
  {
    id: 'profilo_metodologico',
    title: 'Profilo Metodologico',
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera una breve nota metodologica (1-2 paragrafi).
Includi:
- Metodo di lavoro adottato (esame della documentazione in atti, visita del periziando, criteri valutativi)
- Riferimento alle linee guida e buone pratiche cliniche applicabili
- Indicazione che le operazioni peritali si sono svolte in contraddittorio con i CTP (se nominati)
Stile conciso e formale.
${NO_EVN_RULE}`,
  },
  {
    id: 'documentazione_atti',
    title: 'Dati della Documentazione in Atti',
    maxTokens: TOKENS_LARGE,
    dataSources: ['events-non-medical'],
    contextMaxChars: 500,
    needsOcr: true,
    condition: 'has-non-medical-docs',
    promptDirective: `Riproduci FEDELMENTE il contenuto rilevante dei documenti NON sanitari presenti nel fascicolo:
ricorsi, memorie difensive, atti di citazione, testimonianze, dichiarazioni, verbali di udienza, provvedimenti del Giudice.
${CITATION_FORMAT}
Riporta il contenuto essenziale virgolettato, con indicazione della fonte.
${NO_EVN_RULE}`,
  },
  {
    id: 'premesse',
    title: 'Premesse',
    maxTokens: TOKENS_LARGE,
    dataSources: ['events-non-medical'],
    contextMaxChars: 500,
    needsOcr: true,
    condition: 'has-legal-docs',
    promptDirective: `Riproduci FEDELMENTE il contenuto delle memorie difensive e dei ricorsi presenti nel fascicolo.
${CITATION_FORMAT}
Riporta le posizioni delle parti e le argomentazioni giuridiche presentate.
${NO_EVN_RULE}`,
  },
  {
    id: 'documentazione_sanitaria',
    title: 'Dati della Documentazione Sanitaria',
    maxTokens: TOKENS_CRITICAL,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1500,
    needsOcr: true,
    promptDirective: `Genera la riproduzione DETTAGLIATA e FEDELE della documentazione sanitaria in ordine cronologico.
Questa e la sezione PIU LUNGA e IMPORTANTE del report. OGNI evento fornito DEVE comparire.

FORMATO CITAZIONE OBBLIGATORIO per OGNI documento/episodio clinico:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele riprodotto dal documento originale ..."

Regole:
- Intestazione GRASSETTO con tipo, autore/struttura e data, seguita da contenuto tra VIRGOLETTE
- Diari clinici giornalieri: riportare solo i giorni con variazioni cliniche significative (interventi, complicanze, modifiche terapia). Periodi stabili raggruppati: "Dal DD.MM al DD.MM.YYYY: decorso regolare, parametri nella norma"
- Esami di laboratorio: riportare solo valori alterati e quelli rilevanti per il caso in tabella markdown. Aggiungere nota "restanti parametri nella norma" se applicabile
- Verbali operatori: riprodurre INTEGRALMENTE, sempre
- Referti radiologici e strumentali: riprodurre INTEGRALMENTE
- Lettere di dimissione: riprodurre INTEGRALMENTE diagnosi e terapia prescritta
- Certificati di visite pre e post-operatorie: riprodurre INTEGRALMENTE
- Scrivi in PROSA DISCORSIVA, MAI elenchi puntati per la narrazione clinica
- Se sono disponibili immagini diagnostiche, inseriscile INLINE subito dopo la citazione pertinente
- NON omettere NESSUN evento
${NO_EVN_RULE}`,
  },
  {
    id: 'spese_mediche',
    title: 'Spese Mediche Esibite',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-expenses'],
    contextMaxChars: 300,
    needsOcr: true,
    condition: 'has-expense-events',
    promptDirective: `Elenca le spese mediche documentate in tabella markdown con colonne: Data | Descrizione | Struttura | Importo.
Per ogni voce valuta congruita e necessita rispetto al quadro clinico documentato.
Includi un totale a fine tabella.
${NO_EVN_RULE}`,
  },
  {
    id: 'pareri_tecnici',
    title: 'Precedenti Pareri Tecnici',
    maxTokens: TOKENS_LARGE,
    dataSources: ['events-perizie'],
    contextMaxChars: 500,
    needsOcr: true,
    condition: 'has-perizie-docs',
    promptDirective: `Riproduci le conclusioni e l'analisi delle perizie precedenti (CTP, CTU, perizie precedenti) in forma virgolettata fedele.
Per ogni perizia usa il formato:
**Tipo perizia, autore, in data DD.MM.YYYY:** "... conclusioni e analisi ..."
Se sono disponibili immagini diagnostiche citate nei pareri, inseriscile INLINE dopo la citazione pertinente.
${NO_EVN_RULE}`,
  },
  {
    id: 'verbale_operazioni_peritali',
    title: 'Verbale delle Operazioni Peritali',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui il verbale delle operazioni peritali, includendo:*
*- Data, ora e luogo delle operazioni*
*- Presenze: CTU, CTP delle parti, legali, periziando*
*- Attivita svolte: esame documentazione, discussione, visita medico-legale*
*- Eventuali richieste dei CTP*
*- Termine assegnato per il deposito delle osservazioni alla bozza]*`,
    promptDirective: '',
  },
  {
    id: 'visita_periziando',
    title: 'Visita del Periziando',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui i risultati della visita medico-legale:*

*SOGGETTIVAMENTE — Il/La periziando/a riferisce:*
*- Sintomatologia attuale*
*- Limitazioni funzionali riferite*
*- Terapie in corso*

*OBIETTIVAMENTE — All'esame obiettivo si rileva:*
*- Esame obiettivo generale*
*- Esame obiettivo locale/specialistico*
*- Eventuali esami strumentali eseguiti in sede di visita]*`,
    promptDirective: '',
  },
  {
    id: 'epicrisi',
    title: 'Epicrisi',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['context-summaries', 'calculations'],
    contextMaxChars: 800,
    needsOcr: false,
    promptDirective: `Genera l'epicrisi come sintesi fattuale della vicenda clinica documentata.

L'epicrisi deve contenere:
1. **Sintesi della vicenda clinica**: ricostruzione sintetica ma completa dei fatti principali emersi dalla documentazione, in ordine cronologico (2-4 paragrafi)
2. **Dati per la valutazione del danno temporaneo**: se disponibili nei calcoli, riporta i periodi di Invalidita Temporanea Totale (ITT) e Parziale (ITP) con le date esatte
3. **Dati per la valutazione del danno permanente**: riporta gli esiti clinici documentati che il perito valutera secondo le tabelle di riferimento

NON esprimere giudizi sul nesso causale — il perito li formulera autonomamente.
NON esprimere percentuali di invalidita permanente — il perito le determinera secondo le tabelle SIMLA.
NON ripetere in dettaglio fatti gia esposti nella documentazione sanitaria — sintetizzare.
Scrivi in prosa discorsiva formale.
${NO_EVN_RULE}

*[Il perito completera questa sezione con le proprie valutazioni professionali su: nesso di causalita materiale e giuridica, quantificazione del danno biologico permanente (tabelle SIMLA), danno morale e esistenziale]*`,
  },
  {
    id: 'considerazioni_ml',
    title: 'Considerazioni Medico-Legali',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui le considerazioni medico-legali, includendo:*
*- Valutazione del nesso di causalita materiale (criterio controfattuale) e giuridico (causalita adeguata, criterio del "piu probabile che non")*
*- Analisi della condotta sanitaria alla luce delle linee guida e buone pratiche cliniche applicabili*
*- Valutazione del danno biologico permanente con riferimento alle tabelle SIMLA*
*- Eventuale danno morale e danno esistenziale*
*- Personalizzazione del danno se applicabile]*`,
    promptDirective: '',
  },
  {
    id: 'conclusioni_quesiti',
    title: 'Conclusioni — Risposte ai Quesiti',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['context-summaries', 'calculations', 'perizia-metadata'],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-quesiti',
    promptDirective: `Per CIASCUN quesito del Giudice (riportati nei dati perizia), genera un framework fattuale di risposta.

Per ogni quesito:
### Quesito N
**Testo del quesito:** [riporta il quesito fedelmente]

**Elementi documentali pertinenti:**
- Elenca i fatti dalla documentazione rilevanti per rispondere al quesito
- Includi date, documenti fonte e dati clinici pertinenti
- Se disponibili, includi i dati quantitativi (periodi ITT/ITP, esiti documentati)

*[Il perito inserira qui la propria risposta al quesito]*

NON rispondere ai quesiti — presenta SOLO gli elementi documentali organizzati. Il perito formulera le risposte.
${NO_EVN_RULE}`,
  },
  {
    id: 'bibliografia',
    title: 'Bibliografia',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire bibliografia pertinente. Fonti tipiche:*
*- Linee guida delle societa scientifiche di riferimento per la patologia in esame*
*- Tabelle SIMLA per la valutazione del danno biologico*
*- Letteratura medico-legale e giuridica rilevante*
*- Protocolli e standard di buona pratica clinica applicabili al caso]*`,
    promptDirective: '',
  },
  {
    id: 'osservazioni_bozza',
    title: 'Osservazioni alla Bozza',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Spazio riservato per la valutazione delle osservazioni dei CTP alla bozza di relazione peritale.*

*Dopo il deposito della bozza e la ricezione delle osservazioni dei Consulenti di Parte, inserire qui:*
*- Sintesi delle osservazioni ricevute da ciascun CTP*
*- Controdeduzioni puntuali a ciascuna osservazione*
*- Eventuali modifiche apportate alla relazione a seguito delle osservazioni]*`,
    promptDirective: '',
  },
];

// ── CTP sections (derived from CTU, without osservazioni_bozza) ─────

function buildCTPSections(): SectionSpec[] {
  return CTU_SECTIONS
    .filter((s) => s.id !== 'osservazioni_bozza')
    .map((s) => {
      if (s.id === 'epicrisi') {
        return {
          ...s,
          promptDirective: s.promptDirective.replace(
            'NON esprimere giudizi sul nesso causale',
            'Evidenzia con particolare attenzione i profili critici documentati nella condotta sanitaria. NON esprimere giudizi sul nesso causale',
          ),
        };
      }
      return s;
    });
}

const CTP_SECTIONS: SectionSpec[] = buildCTPSections();

// ── Stragiudiziale sections (8, shorter structure) ──────────────────

const STRAGIUDIZIALE_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione_stragiudiziale',
    title: 'Intestazione',
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera l'intestazione della valutazione stragiudiziale.
Includi:
- Dati del professionista incaricato (nome, qualifica, specializzazione)
- Dati del paziente/periziando (iniziali, data di nascita se disponibile)
- Data della visita medico-legale (se disponibile)
- Oggetto dell'incarico
Stile formale e conciso.
${NO_EVN_RULE}`,
  },
  {
    id: 'anamnesi',
    title: 'Dati Anamnestici',
    maxTokens: TOKENS_SMALL,
    dataSources: ['events-medical'],
    contextMaxChars: 400,
    needsOcr: false,
    promptDirective: `Genera una breve anamnesi del periziando basata sulla documentazione.
Includi:
- Condizioni patologiche pregresse rilevanti
- Anamnesi familiare se pertinente e documentata
- Anamnesi farmacologica se documentata
- Peso, altezza, condizioni generali se documentati
Stile sintetico (1-3 paragrafi). Riporta SOLO fatti documentati.
${NO_EVN_RULE}`,
  },
  {
    id: 'fatto_storia_clinica',
    title: 'Il Fatto e la Storia Clinica',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-medical', 'context-summaries'],
    contextMaxChars: 600,
    needsOcr: true,
    promptDirective: `Genera la narrazione del fatto e della storia clinica in ordine cronologico.
Riporta:
- L'evento indice (sinistro, intervento, evento avverso) con data e circostanze
- L'iter diagnostico-terapeutico successivo
- Gli esiti documentati e la situazione clinica attuale
Stile narrativo discorsivo. Piu sintetico rispetto a una CTU, ma fedele ai fatti documentati.
${NO_EVN_RULE}`,
  },
  {
    id: 'documentazione_sanitaria',
    title: 'La Documentazione Medica Prodotta',
    maxTokens: TOKENS_CRITICAL,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1000,
    needsOcr: true,
    promptDirective: `Genera la riproduzione della documentazione sanitaria in ordine cronologico.
FORMATO CITAZIONE per OGNI documento:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."

Regole:
- OGNI evento fornito DEVE comparire
- Diari clinici: solo giorni con variazioni significative
- Esami lab: solo valori alterati e rilevanti
- Verbali operatori: riprodurre INTEGRALMENTE
- Referti radiologici: riprodurre INTEGRALMENTE
- Scrivi in PROSA DISCORSIVA
- Se disponibili immagini diagnostiche, inserirle INLINE
${NO_EVN_RULE}`,
  },
  {
    id: 'spese_mediche',
    title: 'Spese Mediche',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-expenses'],
    contextMaxChars: 200,
    needsOcr: true,
    condition: 'has-expense-events',
    promptDirective: `Elenca le spese mediche documentate in tabella markdown: Data | Descrizione | Struttura | Importo.
Includi totale a fine tabella.
${NO_EVN_RULE}`,
  },
  {
    id: 'visita_clinica',
    title: 'Visita Clinica',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui i risultati della visita medico-legale:*

*SOGGETTIVAMENTE — Il/La periziando/a riferisce:*
*- Sintomatologia attuale*
*- Limitazioni funzionali*

*OBIETTIVAMENTE — All'esame obiettivo:*
*- Esame obiettivo generale e locale*
*- Eventuali esami strumentali]*`,
    promptDirective: '',
  },
  {
    id: 'epicrisi',
    title: 'Epicrisi',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['context-summaries', 'calculations'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Genera l'epicrisi come sintesi fattuale della vicenda clinica.
Includi:
1. Sintesi cronologica dei fatti principali (1-2 paragrafi)
2. Dati per il danno biologico: periodi ITT/ITP se calcolati, esiti documentati
NON esprimere percentuali di invalidita ne giudizi sul nesso causale — il perito li formulera.
Scrivi in prosa formale e concisa.
${NO_EVN_RULE}

*[Il perito completera questa sezione con: valutazione nesso causale, danno biologico permanente (tabelle SIMLA), danno morale]*`,
  },
  {
    id: 'conclusioni',
    title: 'Conclusioni',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['context-summaries', 'calculations'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Genera una breve sintesi conclusiva (1-2 paragrafi).
Riepiloga i fatti principali e i dati quantitativi emersi (periodi ITT/ITP, esiti documentati).
NON esprimere giudizi, opinioni o conclusioni su responsabilita o merito.
Stile fattuale e conciso. La sintesi deve contenere SOLO fatti gia trattati nel report.
${NO_EVN_RULE}`,
  },
];

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

    default:
      return false;
  }
}

// ── Public API ──────────────────────────────────────────────────────

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
}): SectionSpec[] {
  const { caseRole, periziaMetadata, events, documentTypes } = params;

  const conditionCtx: ConditionContext = {
    events,
    documentTypes,
    periziaMetadata,
  };

  // Select role-specific section template
  let baseSections: SectionSpec[];
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

  // Filter by conditions
  return baseSections.filter((spec) => {
    if (!spec.condition) return true;
    return evaluateCondition(spec.condition, conditionCtx);
  });
}

/**
 * Get all possible section IDs for a given role (for validation/parsing).
 */
export function getAllSectionIds(caseRole: CaseRole): string[] {
  switch (caseRole) {
    case 'ctu':
      return CTU_SECTIONS.map((s) => s.id);
    case 'ctp':
      return CTP_SECTIONS.map((s) => s.id);
    case 'stragiudiziale':
      return STRAGIUDIZIALE_SECTIONS.map((s) => s.id);
    default:
      return CTU_SECTIONS.map((s) => s.id);
  }
}

// ── Exports for testing ─────────────────────────────────────────────

export { CTU_SECTIONS, CTP_SECTIONS, STRAGIUDIZIALE_SECTIONS };
