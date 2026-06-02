import type { CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { SectionSpec, SectionCondition } from './section-generation-types';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import { renderAnamnesiMarkdown } from './anamnesi-template';
import {
  DOCUMENT_ANALYSIS_FORMULATIONS,
  DOCUMENTAZIONE_SANITARIA_EXAMPLE,
  EPICRISI_FORMULATIONS,
  EPICRISI_EXAMPLE,
} from './peritale-formulations';

// ── Token budget tiers (per-section, calibrated to natural output length) ──
//
// Token budget acts as both ceiling AND soft length signal to the LLM.
// A 32K budget across every section was too permissive: short formal sections
// (intestazione, conclusioni) ended up bloated. These tiers provide enough
// headroom to never truncate real content while nudging the model toward
// concision appropriate to each section's role in a deposit-ready perizia.
//
// Note on safety: completeness of facts is preserved by the prompt directives
// ("OGNI evento DEVE comparire", anti-hallucination rules, OCR fidelity), NOT
// by giving the model unlimited output budget. If a section truncates because
// of budget, section-generator.ts:269 throws and Inngest retries — a section
// that needs more room than HUGE has structural issues that retry won't fix.

/** Short formal sections: intestazione, profilo metodologico, conclusioni 1-2 paragrafi. ~1000 words. */
const TOKENS_TINY = 2_000;

/** Brief narrative sections: anamnesi, il_fatto, fatto_storia_clinica, quesiti, spese in tabella. ~2200 words. */
const TOKENS_SMALL = 4_000;

/** Standard analytical sections: epicrisi, quadro_clinico, prognosi, oggetto_parere. ~3700 words. */
const TOKENS_MEDIUM = 6_000;

/** Long sections requiring multi-document synthesis: pareri_tecnici, analisi_condotta. ~6500 words. */
const TOKENS_LARGE = 10_000;

/**
 * Documentazione sanitaria (the largest section). Reproduction of medical documents
 * with full fidelity. Real CTU sample: 3000-10000 words. 18000 words headroom is
 * enough for the most complex multi-ricovero case while still acting as length
 * signal vs the previous 24000-word ceiling.
 */
const TOKENS_HUGE = 20_000;

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

/**
 * Sprint 1 S1.1 + S1.2 (Lavini quality, 2026-05-17): regole anti-verbosità +
 * anti-ripetizione per le sezioni "documentazione_sanitaria" dove il LLM
 * tende a ridondare e ripetere informazioni. Sono regole rinforzate rispetto
 * al solo "stile sintetico" precedente.
 */
const ANTI_REPETITION_AND_LENGTH_RULES = `REGOLE ANTI-RIPETIZIONE (vincolanti — la fedeltà al documento NON è verbosità):
- **MAX 80 parole di prosa di commento** tra una citazione e la successiva. Le citazioni testuali del documento (tra virgolette) sono illimitate e vanno riprodotte fedelmente; è solo la TUA prosa di raccordo a dover essere breve.
- **Se hai gia citato un fatto clinico** (stessa data + stesso tipo, es. "intervento del 15.03.2024") in un blocco precedente di questa stessa sezione, **NON ripeterlo**. Riferisciti con UNA SOLA RIGA: "Per i dettagli dell'intervento del 15.03.2024 vedi blocco precedente."
- **Diari clinici pluri-giornalieri**: raggruppa in un blocco unico SOLO i giorni con QUADRO CLINICAMENTE IDENTICO: "Dal DD.MM al DD.MM.YYYY: decorso regolare, parametri vitali nella norma, terapia [X] proseguita." Ogni giorno che presenta una variazione (parametri, terapia, complicanza, evento) va riportato per esteso.
- **Esami di laboratorio identici nello stesso giorno**: 1 sola tabella per data, non duplicare.
- **Completezza > concisione**: riporta TUTTI i documenti/episodi del fascicolo, ciascuno riprodotto fedelmente. Per contenere la lunghezza raggruppa i giorni identici e non ripetere un fatto già citato — MAI tagliare o riassumere il contenuto di un documento per brevità. Se la sezione supera 60.000 caratteri il sistema taglia automaticamente al boundary di paragrafo: in tal caso il perito rigenererà in modalità split.`;

/**
 * Intro condivisa per la sezione documentazione sanitaria — riproduzione
 * VERBATIM (benchmark scuola veronese / Lavini 2026-06-01). Il valore primario
 * è la fedeltà al documento; la concisione vincola solo la prosa di raccordo.
 */
const DOC_SANITARIA_INTRO = `Riproduzione FEDELE, CRONOLOGICA e VERBATIM della documentazione sanitaria. OGNI evento fornito DEVE comparire come blocco distinto — completezza non negoziabile. La concisione vincola SOLO la prosa di raccordo tra le citazioni, MAI il contenuto-fonte: il testo dei documenti va riprodotto fedelmente, non riassunto.

FORMATO CITAZIONE OBBLIGATORIO per OGNI documento/episodio clinico:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele riprodotto dal documento originale ..."`;

/**
 * Regole di riproduzione per tipo di documento — VERBATIM. Allineate al modo in
 * cui il Dr. Lavini trascrive (verbali operatori integrali con équipe e misure,
 * referti interi, lettere di dimissione con le sotto-rubriche originali).
 */
const DOC_REPRODUCTION_RULES = `Regole di riproduzione FEDELE per tipo di documento (la sintesi del contenuto-fonte è VIETATA):
- **Diari clinici (cartella clinica)**: riporta OGNI giorno con variazioni cliniche rilevanti. Conserva le rubriche originali del diario (es. NEUROLOGICO:, RESPIRATORIO:, CARDIOCIRCOLATORIO:, ADDOME:, RENALE/METABOLICO:) e l'indicazione di reparto/medico ove presente. Raggruppa con date inizio-fine SOLO i giorni clinicamente identici (vedi regole anti-ripetizione).
- **Verbali operatori**: riporta INTEGRALMENTE — diagnosi pre-operatoria, tecnica chirurgica completa (vie d'accesso, gesti chirurgici, materiali e mezzi di sintesi CON misure/diametri), équipe operatoria, orari di sala, decorso intra-operatorio, diagnosi post-operatoria ed esito. NON sintetizzare le fasi (anche anestesia e preparazione vanno riportate se nel documento).
- **Referti radiologici/strumentali**: riporta INTEGRALMENTE tecnica d'esame + descrizione dei reperti + conclusione, come nel referto originale.
- **Lettere di dimissione**: riporta INTEGRALMENTE conservando le sotto-rubriche originali (Anamnesi/Ammissione, Decorso clinico, Diagnosi alla dimissione, Terapia alla dimissione, Indicazioni/Follow-up).
- **Esami di laboratorio**: SEMPRE in tabella markdown pipe, una tabella separata per ogni data/prelievo. Valori alterati rispetto al range in grassetto. Includi TUTTI i valori del documento, anche quelli nella norma.
- **Documenti in lingua straniera (es. tedesco)**: riporta il referto in originale e aggiungi la traduzione italiana; marca "(Referto riprodotto in originale)". Rendi esplicite sigle e posologie con nota fra parentesi quadre, es. "1-0-1 [Nota: 1 compressa mattino, 0 mezzogiorno, 1 sera]".
- **Immagini diagnostiche disponibili nella lista**: inseriscile INLINE subito dopo la citazione pertinente con la sintassi ![Fig. N — descrizione formale](ocr-image:percorso-esatto).
- **Stile**: prosa discorsiva neutra SOLO tra le citazioni (mai elenchi puntati per la narrazione clinica, tabelle escluse per i lab); la citazione testuale del documento può essere lunga quanto serve alla fedeltà.`;

/**
 * Regola di neutralità assoluta per la sezione documentazione (è riproduzione,
 * non analisi). Condivisa fra CTU, stragiudiziale e pareri.
 */
const DOC_SANITARIA_NEUTRALITY = `REGOLA DI NEUTRALITÀ ASSOLUTA — questa sezione è una RIPRODUZIONE DOCUMENTALE, NON un'analisi:
- VIETATO il pattern "FATTO DOCUMENTATO / STANDARD DI RIFERIMENTO / ELEMENTI A SUPPORTO / ELEMENTI CONTRARI / CONSEGUENZE" (è destinato ESCLUSIVAMENTE alla sezione anomalie/considerazioni medico-legali).
- VIETATO sotto-titoli interpretativi tipo "Profili critici documentali", "Quadro documentale complessivo", "Elementi favorevoli/sfavorevoli".
- VIETATO commenti su standard di cura, linee guida, ritardi, omissioni, conformità o non-conformità a protocolli — qui SOLO citazioni testuali fedeli e prosa cronologica neutra.
- VIETATE formulazioni soggettive: "verosimile", "ritardo", "lacuna", "mancanza", "discrepanza", "criticità", "appare", "si ritiene".
- Le anomalie e i giudizi vanno SOLO nelle sezioni dedicate. Qui SOLO fatti come riportati dai documenti, niente di più.`;

// ── CTU Giudiziale sections (15) ────────────────────────────────────

const CTU_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione',
    title: 'Intestazione',
    // SMALL (4000 tok) not TINY (2000): CTU complessi con CC.TT.P. multipli +
    // termini multi-fase + fondo spese produrrebbero 1500-2000 parole formali
    // = ~2700 tok output. TINY=2000 saturava con rischio truncatura silente.
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata', 'events-medical', 'events-non-medical'],
    contextMaxChars: 300,
    needsOcr: false,
    condition: 'has-perizia-metadata',
    promptDirective: `Genera l'intestazione formale della perizia CTU, replicando il FORMATO BENCHMARK Del Porto / Mao:

STRUTTURA OBBLIGATORIA (in quest'ordine, in Markdown):

1) USA H1 MARKDOWN per intestazione tribunale (verra' renderizzato in font monospace con character spacing, come da benchmark):
   \`\`\`
   # TRIBUNALE ORDINARIO DI [CITTA]
   # SEZIONE [CIVILE/PENALE/CENTRALE CIVILE | PROCEDIMENTI SPECIALI SOMMARI]
   \`\`\`

2) NUMERO DI RUOLO (riga normale, grassetto):
   "**Numero di Ruolo Generale n. NNNNN/YYYY**"

3) TIPO DI PROCEDIMENTO (riga normale):
   Es. "Accertamento tecnico preventivo (ex art. 696 bis c.p.c.)" / "Consulenza Tecnica d'Ufficio"

4) OGGETTO DELLA PERIZIA (riga in grassetto):
   "**relativo alla vicenda clinica del/della sig./sig.ra COGNOME NOME**"

5) SEPARATORE asterischi su riga propria, centrato:
   "* * * * *"

6) DESTINATARIO (allineato in modo da apparire a destra; il rendering DOCX lo gestisce):
   "Ill.mo Sig./Sig.ra"
   "**Dott./Dott.ssa NOME COGNOME**"
   "Giudice Delegato/Istruttore"
   "c/o il Tribunale di [CITTA]"

7) PARAGRAFO DI CONFERIMENTO (passato remoto, formale, in prosa giustificata):
   "Il giorno DD.MM.YYYY il Dott. [GIUDICE], Giudice Delegato presso il Tribunale Ordinario di [CITTA] – Sezione [X], conferiva al sottoscritto Dott. [CTU], medico legale presso [STRUTTURA], l'incarico di eseguire indagine medico-legale sulla vicenda clinica relativa a:"

8) BLOCCO DATI PERIZIANDO (nome in grassetto):
   "**NOME COGNOME**"
   "nato/a a [LUOGO] il DD.MM.YYYY, residente a [LUOGO] in [INDIRIZZO]."

9) CONSULENTI TECNICI DI PARTE (se documentati, riga per parte):
   "La parte ricorrente nominava quali propri CC.TT.P. [NOMI]."
   "La parte resistente [NOME ASL/AZIENDA] nominava quali propri CC.TT.P. [NOMI]."

10) DATE OPERAZIONI E TERMINI (se documentate):
   - Data inizio operazioni peritali
   - Termini per bozza, osservazioni CC.TT.P., deposito definitivo
   - Fondo spese se documentato

REGOLA ASSOLUTA — VIETATO INVENTARE QUALSIASI DATO:
Questa perizia sara' depositata in Tribunale e firmata dal CTU. Inventare dati anche solo per "completezza" e' un errore gravissimo. Per ogni campo:
1) Cerca nei METADATI PERIZIA del prompt utente.
2) Se assente, cerca negli ATTI/EVENTI forniti (memorie difensive, ricorsi, intestazioni di cartelle cliniche).
3) Se ancora assente, scrivi letteralmente \`[da compilare dal perito]\` o ometti la voce.

VIETATO TASSATIVAMENTE: R.G. fittizi, Giudici inventati, parti inventate, CC.TT.P. non nominati, CF/indirizzi/date di nascita non documentati, termini procedurali non risultanti dagli atti.

Stile formale da perizia depositabile in Tribunale, passato remoto.
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
    id: 'documentazione_atti',
    title: 'I Dati della Documentazione in Atti',
    maxTokens: TOKENS_LARGE,
    // 32K char (~8K token) sta sotto il budget TOKENS_LARGE (10K): il cap taglia
    // al boundary di paragrafo prima che scatti il troncamento token (throw).
    maxChars: 32_000,
    dataSources: ['events-non-medical'],
    contextMaxChars: 500,
    needsOcr: true,
    condition: 'has-non-medical-docs',
    promptDirective: `Riproduzione FEDELE e VERBATIM dei documenti NON sanitari presenti nel fascicolo, in ordine cronologico:
ricorsi, memorie difensive, atti di citazione, testimonianze, dichiarazioni, verbali di udienza, provvedimenti del Giudice, clausole di polizza.
${CITATION_FORMAT}
- Ogni atto introdotto da una riga con tipo + autore/avvocato + data di deposito: **Ricorso ex art. ... depositato dall'Avv. [nome] in data DD.MM.YYYY:** "..."
- Riproduci il contenuto VIRGOLETTATO mantenendo la NUMERAZIONE ORIGINALE dei punti dell'atto (1), 2), 3)...) e i virgolettati testuali (PEC, clausole, certificati) come nell'originale. NON riassumere il testo dell'atto.
- I documenti che scegli di non riprodurre integralmente vanno comunque elencati con la formula: "... che non viene riportato per economia espositiva."
REGOLA DI NEUTRALITÀ: riproduci senza commentare, valutare o evidenziare criticità, lacune, ritardi o discrepanze. Riporta solo ciò che gli atti dichiarano, lasciando ogni giudizio al perito.
${NO_EVN_RULE}`,
  },
  {
    id: 'premesse',
    title: 'Premesse',
    maxTokens: TOKENS_MEDIUM,
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
    title: 'I Dati della Documentazione Sanitaria in Atti',
    maxTokens: TOKENS_HUGE,
    maxChars: 60_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1500,
    needsOcr: true,
    promptDirective: `${DOC_SANITARIA_INTRO}

${DOC_REPRODUCTION_RULES}

${DOC_SANITARIA_NEUTRALITY}

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}

${DOCUMENT_ANALYSIS_FORMULATIONS}

${DOCUMENTAZIONE_SANITARIA_EXAMPLE}`,
  },
  {
    id: 'spese_mediche',
    title: 'Spese Mediche Esibite',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-expense-events',
    // DETERMINISTIC (B-pillar): the expense table is rendered mechanically from
    // every spesa_medica event at read time — NOT narrated by the LLM. This
    // guarantees Lavini's requirements by construction: ogni voce inclusa (anche
    // senza data → '—'), imposta di bollo come riga separata, nessuna voce persa.
    // La valutazione di congruità è un GIUDIZIO → resta al perito (placeholder).
    isPlaceholder: true,
    placeholderText: `Le spese mediche documentate sono riepilogate nella tabella seguente, calcolata automaticamente dalle voci di spesa del fascicolo.

${DETERMINISTIC_MARKERS.SPESE}

*[Il perito valuta la congruità e la necessità delle spese rispetto al quadro clinico documentato.]*`,
    promptDirective: '',
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
    id: 'operazioni_peritali',
    title: 'I Dati delle Operazioni Tecniche',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui:*

*VERBALE OPERAZIONI PERITALI*
*- Data, ora e luogo delle operazioni*
*- Presenze: CTU, CTP delle parti, legali, periziando*
*- Attivita svolte: esame documentazione, discussione, visita medico-legale*
*- Eventuali richieste dei CTP*

*VISITA DEL PERIZIANDO*
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
    // Solo nei procedimenti ATP ex art. 696-bis c.p.c. (funzione conciliativa):
    // il tentativo di conciliazione antecedente l'invio della bozza è un atto
    // dovuto del CTU, riportato come sezione propria nei benchmark Calascibetta/
    // Caccialanza. Placeholder: lo compila il perito dopo le operazioni.
    id: 'conciliazione_ante_bozza',
    title: 'I Dati Relativi alla Disponibilità ad Esperire un Tentativo di Conciliazione in Fase Antecedente l\'Invio della Bozza di CTU',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-conciliazione-procedure',
    isPlaceholder: true,
    placeholderText: `*[Inserire qui — solo per procedimenti ATP ex art. 696-bis c.p.c. — la cronologia del tentativo di conciliazione nella fase antecedente l'invio della bozza:*

*- Date e modalita dei contatti fra le parti (PEC, incontri)*
*- Posizioni espresse dai legali e dai CC.TT.P.*
*- Esito del tentativo (riuscito / non riuscito) in questa fase]*`,
    promptDirective: '',
  },
  {
    id: 'considerazioni_ml',
    title: 'Considerazioni Medico-Legali',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui le considerazioni medico-legali. Questa sezione contiene la sintesi conclusiva del CTU e le risposte ai quesiti del Giudice.*

*1. SINTESI DELLA VICENDA CLINICA*
*Ricostruzione cronologica essenziale dei fatti principali (i dati di dettaglio sono nelle sezioni precedenti).*

*2. ANALISI MEDICO-LEGALE*
*- Nesso di causalita materiale: applicare i criteri criteriologici (cronologico, topografico, di idoneita/efficienza lesiva, di continuita fenomenologica, di esclusione di altre cause); nesso giuridico secondo il criterio del "piu probabile che non"; per la malpractice omissiva, giudizio controfattuale ad alta probabilita logica*
*- In presenza di preesistenze: valutazione dello stato anteriore e del danno differenziale*
*- Analisi della condotta sanitaria alla luce delle linee guida e buone pratiche cliniche applicabili al momento dei fatti*
*- Valutazione del danno biologico temporaneo (ITT/ITP) con date e periodi*
*- Valutazione del danno biologico permanente con barème di riferimento citato esplicitamente (Tabella SIMLA / Tabella Unica Nazionale / Tabella di Milano)*
*- Eventuale danno morale ed esistenziale*
*- Personalizzazione del danno se applicabile*

*3. RISPOSTE AI QUESITI DEL GIUDICE*
*Per ciascun quesito formulato dal Giudice (vedi sezione "Quesiti"), ri-citare testualmente il quesito tra virgolette come intestazione e articolare di seguito la risposta motivata, richiamando i fatti documentali e l'analisi sopra esposta. I quesiti omogenei possono essere accorpati.]*`,
    promptDirective: '',
  },
  {
    id: 'bibliografia',
    title: 'Bibliografia',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['pubmed-references'],
    contextMaxChars: 0,
    needsOcr: false,
    placeholderText: `*[Inserire bibliografia pertinente. Fonti tipiche:*
*- Linee guida delle societa scientifiche di riferimento per la patologia in esame*
*- Tabelle SIMLA per la valutazione del danno biologico*
*- Letteratura medico-legale e giuridica rilevante*
*- Protocolli e standard di buona pratica clinica applicabili al caso]*`,
    promptDirective: `Genera la sezione Bibliografia del report medico-legale.

Ti vengono forniti riferimenti scientifici PubMed pertinenti alle diagnosi del caso.
Per CIASCUN articolo, formatta come citazione bibliografica in stile Vancouver:

Autori. Titolo. Rivista. Anno;DOI (se disponibile). PMID: numero.

Organizza le citazioni per argomento/diagnosi, con un breve sottotitolo per ciascun gruppo.

Dopo le citazioni PubMed, aggiungi la nota:

*[Il perito potra integrare questa sezione con ulteriori fonti:*
*- Linee guida delle societa scientifiche di riferimento*
*- Tabelle SIMLA per la valutazione del danno biologico*
*- Letteratura medico-legale e giuridica aggiuntiva]*

${NO_EVN_RULE}`,
  },
  {
    id: 'osservazioni_bozza',
    title: 'I Dati dell\'Invio delle Bozze di CTU alle Parti, loro Osservazioni e Relativa Risposta',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Spazio riservato per la valutazione delle osservazioni dei CTP alla bozza di relazione peritale.*

*Dopo il deposito della bozza e la ricezione delle osservazioni dei Consulenti di Parte, inserire qui:*
*- Sintesi delle osservazioni ricevute da ciascun CTP*
*- Controdeduzioni puntuali a ciascuna osservazione (formula: "Risposta del C.T.U.")*
*- Eventuali modifiche apportate alla relazione a seguito delle osservazioni]*`,
    promptDirective: '',
  },
  {
    // Secondo giro conciliativo (post-bozza) nei procedimenti ATP ex art.
    // 696-bis c.p.c.: cronologia datata + esito, chiusura con deposito.
    id: 'conciliazione_post_bozza',
    title: 'I Dati Relativi alla Disponibilità ad Esperire un Tentativo di Conciliazione in Fase Successiva all\'Invio della Bozza di CTU',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-conciliazione-procedure',
    isPlaceholder: true,
    placeholderText: `*[Inserire qui — solo per procedimenti ATP ex art. 696-bis c.p.c. — la cronologia del tentativo di conciliazione nella fase successiva all'invio della bozza:*

*- Date e modalita dei contatti fra le parti dopo l'invio della bozza*
*- Posizioni finali dei legali / esito del tentativo*
*- Formula di chiusura: "Non essendo stato possibile addivenire ad una soluzione bonaria della controversia ... si procede al deposito dell'elaborato tecnico."]*`,
    promptDirective: '',
  },
];

// ── CTP sections (derived from CTU, without osservazioni_bozza) ─────

function buildCTPSections(): SectionSpec[] {
  // CTP uses same objective sections as CTU, minus osservazioni_bozza.
  // No bias toward critical profiles — 100% objective like CTU.
  return CTU_SECTIONS.filter((s) => s.id !== 'osservazioni_bozza');
}

const CTP_SECTIONS: SectionSpec[] = buildCTPSections();

// ── Stragiudiziale sections (8, shorter structure) ──────────────────

const STRAGIUDIZIALE_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione_stragiudiziale',
    title: 'Intestazione',
    maxTokens: TOKENS_TINY,
    dataSources: ['perizia-metadata', 'events-medical', 'events-non-medical'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera l'intestazione della perizia medico-legale stragiudiziale, replicando il FORMATO BENCHMARK Antoniazzi:

STRUTTURA OBBLIGATORIA (in quest'ordine):

1) RIGA 1 — NOME E TITOLO DEL PERITO (in alto, in grassetto, font grande):
   Esempio: "**Lavini dott. Franco**"

2) RIGHE SUCCESSIVE — SPECIALIZZAZIONI (una per riga, in grassetto corsivo):
   Esempi: "*Specialista in Ortopedia e Traumatologia*"
           "*Specialista in Terapia Fisica e Riabilitazione*"
           "*Specialista in Medicina Legale*"

3) RIGA INTRODUTTIVA — "In data DD MMMM YYYY ho sottoposto ad accertamenti clinici [in presenza di X, se documentato]"

4) BLOCCO DATI PAZIENTE (paragrafo unico, allineato a sinistra):
   - **Nome COGNOME** (in grassetto)
   - "Nato/a a LUOGO il DD/MM/YYYY e residente a LUOGO in INDIRIZZO"
   - "C.F. XXXXXXXXXXXXXXXX"
   - "MAIL: ..." (se documentato)
   - "TEL: ..." (se documentato)
   - "Avvocato di parte: ..." (se documentato)

5) RIGA SCOPO — "Al fine di valutare le lesioni patite in occasione di [EVENTO INDICE] occorso in data [DATA] in ambito di responsabilita civile."
   Adatta l'ambito al tipo caso: responsabilita civile / responsabilita professionale medica / infortunio sul lavoro / infortunio domestico / etc.

REGOLA ASSOLUTA — VIETATO INVENTARE DATI:
- Cerca PRIMA nei METADATI PERIZIA, POI nelle intestazioni dei DOCUMENTI/EVENTI sanitari (cartelle cliniche, referti).
- Se un dato non e' presente da nessuna parte, scrivi letteralmente \`[da compilare dal perito]\` o ometti la riga.
- VIETATO TASSATIVAMENTE: nomi inventati, codici fiscali fittizi, indirizzi, telefoni, date di nascita.

REGOLA ASSOLUTA — NESSUN RIFERIMENTO AL TRIBUNALE (segnalata dal perito 2026-05-11):
- La perizia medico-legale stragiudiziale NON c'entra con il tribunale.
- VIETATO menzionare: Giudice, Tribunale, Sezione, R.G. (Ruolo Generale), Quesiti del Giudice, ordinanza di conferimento, procedimento, udienza, parti processuali (ricorrente/resistente), CTU/CTP.
- L'incarico e' di parte (assicurazione, avvocato, paziente, medico di base) — non giudiziale.

Stile formale e conciso. Massimo 8-10 righe totali.
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
    id: 'il_fatto_e_storia_clinica',
    title: 'Il Fatto e la Storia Clinica',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-medical', 'perizia-metadata'],
    contextMaxChars: 600,
    needsOcr: false,
    promptDirective: `Narrazione UNICA e COMPATTA dell'evento indice e dell'iter diagnostico-terapeutico successivo. 2-4 paragrafi totali (NON una sezione per fase). Allineato al benchmark Antoniazzi "IL FATTO E LA STORIA CLINICA" per perizia medico-legale RC.

ESEMPIO DI STILE (benchmark Antoniazzi):
"Mentre stava attraversando la strada sulla striscia pedonali di fronte alla Scuola Cangrande In Corso porta nuova 66, Verona, in data 12/09/2025 verso le ore 17.40 veniva investita da motociclo delle poste italiane. Cadeva a terra. Non ricorda svenimento. Ma ricorda il capannello di persone che si sono radunate attorno. Dopo essersi alzata una astante ha chiamato la mamma che e' intervenuta e sulle prime, un po' agitata, veniva portata a casa che dista pochi passi dal luogo dell'incidente. Successivamente, aumentando il dolore a livello del gomito destro, i genitori hanno contattato telefonicamente conoscente specialista ortopedico che consigliava di eseguire Rx dell'area dolente."

⚠ ATTENZIONE — GUARDRAIL ANTI-COPIA (regola assoluta):
L'esempio sopra serve SOLO a illustrare il REGISTRO LINGUISTICO (imperfetto/passato remoto, dettagli concreti, terza persona, prosa scorrevole). TUTTI i dati specifici (nomi di persona, date, luoghi, vie, numeri civici, scuole, mezzi coinvolti, parenti, ore precise) DEVONO derivare ESCLUSIVAMENTE dagli eventi clinici e dai metadati perizia forniti per IL CASO IN ELABORAZIONE. **VIETATO TASSATIVAMENTE** riportare nomi/date/luoghi dell'esempio (Antoniazzi, Scuola Cangrande, Corso Porta Nuova, 12/09/2025, motociclo Poste, "mamma", ecc.) nel report finale: sarebbe hallucination grave su perizia depositabile.

Includi in ordine cronologico:
- Data e circostanze dell'evento indice (luogo, ora, dinamica, modalita)
- Prime cure prestate (pronto soccorso, primo accesso medico) e diagnosi iniziale
- Visite e controlli successivi (data + specialista, raggruppati se ravvicinati)
- Interventi e terapie principali (data + tipo)
- Evoluzione clinica fino alla stabilizzazione

Stile narrativo in terza persona ("la paziente / il paziente"), ricostruzione fedele, dettagli concreti (luoghi, ore, persone presenti se documentate). Imperfetto/passato remoto.

LIMITI (anti-ridondanza):
- NON riprodurre integralmente i documenti — e' oggetto di "La Documentazione Medica Prodotta"
- NON anticipare la sintesi finale, le valutazioni e i dati ITT/ITP — sono oggetto dell'Epicrisi
- NON includere la parte SOGGETTIVA (cio' che il paziente riferisce oggi in visita) — quella e' nel placeholder "Visita Clinica" che compilera' il perito.
${NO_EVN_RULE}`,
  },
  {
    id: 'documentazione_sanitaria',
    title: 'La Documentazione Medica Prodotta',
    maxTokens: TOKENS_HUGE,
    maxChars: 60_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1000,
    needsOcr: true,
    promptDirective: `${DOC_SANITARIA_INTRO}

${DOC_REPRODUCTION_RULES}

${DOC_SANITARIA_NEUTRALITY}

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}`,
  },
  {
    id: 'spese_mediche',
    title: 'Spese Mediche',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-expense-events',
    // DETERMINISTIC (B-pillar): table rendered from spesa_medica events at read
    // time — every voce inclusa (anche senza data → '—'), bollo come riga
    // separata, nessuna voce persa. Niente dipendenza dalla compliance LLM.
    isPlaceholder: true,
    placeholderText: `Le spese mediche documentate sono riepilogate nella tabella seguente, calcolata automaticamente dalle voci di spesa del fascicolo.

${DETERMINISTIC_MARKERS.SPESE}`,
    promptDirective: '',
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
    dataSources: ['context-summaries', 'calculations', 'pubmed-references'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Epicrisi come SINTESI CONCLUSIVA della vicenda clinica. È la sezione finale del parere stragiudiziale (allineato al benchmark Antoniazzi).

Includi:
1. Sintesi cronologica essenziale dei fatti principali (1-2 paragrafi compatti)
2. Dati per il danno biologico: periodi ITT/ITP calcolati, esiti documentati
3. Eventuali spese mediche giudicate congrue (1 riga)

NON esprimere percentuali di invalidità né giudizi sul nesso causale — il perito li formulerà nello spazio dedicato in fondo.

LIMITI DELLA SEZIONE (anti-ridondanza):
- NON ri-narrare l'evento indice in dettaglio — è oggetto di "Il Fatto e la Storia Clinica"
- NON riprodurre i documenti — è oggetto della "Documentazione Medica Prodotta"
Qui SOLO sintesi essenziale + dati medico-legali calcolati.

Scrivi in prosa formale e densa.
${NO_EVN_RULE}
Quando disponibili, cita evidenze scientifiche pertinenti [Autore, Rivista, Anno].

${EPICRISI_FORMULATIONS}

${EPICRISI_EXAMPLE}

*[Il perito completerà l'epicrisi con: valutazione nesso causale, danno biologico permanente (tabelle SIMLA per resp. civile / ANIA-INAIL per polizza infortuni), danno morale, livello di sofferenza, congruità complessiva spese]*`,
  },
];

// ── Parere Pro Veritate sections (6) ───────────────────────────────

const PARERE_PRO_VERITATE_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione_parere',
    title: 'Intestazione',
    maxTokens: TOKENS_TINY,
    dataSources: ['perizia-metadata', 'events-medical'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera l'intestazione formale del parere pro veritate.

REGOLA ASSOLUTA — VIETATO INVENTARE QUALSIASI DATO:
Questo è un parere medico-legale che verrà firmato e potrà essere prodotto in giudizio. Inventare dati è un errore gravissimo. Per ogni campo applica:
1) Cerca nei METADATI PERIZIA del prompt utente.
2) Se assente, cerca nelle intestazioni dei DOCUMENTI/EVENTI sanitari forniti (il nome del paziente è quasi sempre nelle cartelle cliniche).
3) Se ancora assente, scrivi letteralmente \`[da compilare dal perito]\` o ometti il campo.

VIETATO TASSATIVAMENTE: nomi di professionisti inventati, qualifiche/iscrizioni albo non documentate, soggetti richiedenti fittizi, codici fiscali e indirizzi non presenti nei dati forniti.

Campi:
- Nome, qualifica e specializzazione del professionista incaricato (SOLO se nei metadati perizia)
- Data del parere (oggi se non specificata)
- Dicitura "Parere pro veritate"
- Dati identificativi del paziente (cerca nei metadati e nelle intestazioni dei documenti forniti — usa il nome reale se trovato)
- Soggetto richiedente (SOLO se nei metadati perizia)

Stile formale.
${NO_EVN_RULE}`,
  },
  {
    id: 'oggetto_parere',
    title: 'Oggetto del Parere',
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata', 'events-medical'],
    contextMaxChars: 300,
    needsOcr: false,
    promptDirective: `Descrivi l'oggetto del parere: cosa e stato richiesto al professionista.
Includi:
- Quesito o richiesta formulata dal committente
- Ambito della valutazione (responsabilita professionale medica)
- Breve inquadramento della vicenda clinica oggetto di analisi
Stile conciso e formale (1-2 paragrafi).
${NO_EVN_RULE}`,
  },
  // Reuse stragiudiziale documentazione_sanitaria spec
  {
    id: 'documentazione_sanitaria',
    title: 'La Documentazione Medica Prodotta',
    maxTokens: TOKENS_HUGE,
    maxChars: 60_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1000,
    needsOcr: true,
    promptDirective: `${DOC_SANITARIA_INTRO}

${DOC_REPRODUCTION_RULES}

${DOC_SANITARIA_NEUTRALITY}

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}`,
  },
  {
    id: 'analisi_condotta',
    title: 'Analisi della Condotta Sanitaria',
    maxTokens: TOKENS_LARGE,
    dataSources: ['events-medical', 'context-summaries', 'guidelines'],
    contextMaxChars: 800,
    needsOcr: true,
    promptDirective: `Analizza la condotta sanitaria alla luce degli standard di cura applicabili.
Includi:
- Ricostruzione cronologica delle scelte diagnostico-terapeutiche adottate
- Confronto con le linee guida e buone pratiche cliniche vigenti al momento dei fatti
- Identificazione di eventuali scostamenti dagli standard di cura
- Valutazione dell'iter diagnostico: tempestivita, appropriatezza degli accertamenti
- Valutazione dell'iter terapeutico: adeguatezza delle scelte, tempistica degli interventi
- Analisi del consenso informato se documentato
NON esprimere giudizi definitivi sulla responsabilita — il perito li formulera nella sezione successiva.
Scrivi in prosa discorsiva formale, con citazioni puntuali alla documentazione.
${NO_EVN_RULE}`,
  },
  {
    id: 'valutazione_responsabilita',
    title: 'Valutazione dei Profili di Responsabilità',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui la valutazione dei profili di responsabilita professionale:*

*- Sussistenza o insussistenza di condotte censurabili sotto il profilo medico-legale*
*- Nesso di causalita materiale tra condotta e danno (criterio controfattuale)*
*- Nesso di causalita giuridica (criterio del "piu probabile che non")*
*- Quantificazione del danno biologico permanente e temporaneo*
*- Eventuale concorso di cause (preesistenze, concause)*
*- Perdita di chance se applicabile]*`,
    promptDirective: '',
  },
  {
    id: 'conclusioni_parere',
    title: 'Conclusioni',
    maxTokens: TOKENS_TINY,
    dataSources: ['context-summaries', 'calculations'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Genera una breve sintesi conclusiva (1-2 paragrafi).
Riepiloga i fatti principali emersi dall'analisi della documentazione e della condotta sanitaria.
Riporta i dati quantitativi emersi (periodi ITT/ITP, esiti documentati) se disponibili.
NON esprimere giudizi definitivi sulla responsabilita — il perito li formulera autonomamente.
Stile fattuale e conciso.
${NO_EVN_RULE}

*[Il perito completera questa sezione con il proprio parere motivato sulla sussistenza di profili di responsabilita professionale]*`,
  },
];

// ── Parere Scopo Riserva sections (6) ──────────────────────────────

const PARERE_SCOPO_RISERVA_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione_parere',
    title: 'Intestazione',
    maxTokens: TOKENS_TINY,
    dataSources: ['perizia-metadata', 'events-medical'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera l'intestazione formale del parere scopo riserva.

REGOLA ASSOLUTA — VIETATO INVENTARE QUALSIASI DATO:
Questo parere serve alla compagnia per la riserva tecnica. Dati anagrafici inventati possono causare errori contabili e responsabilità professionale. Per ogni campo:
1) Cerca nei METADATI PERIZIA del prompt utente.
2) Se assente, cerca nelle intestazioni dei DOCUMENTI/EVENTI sanitari forniti.
3) Se ancora assente, scrivi letteralmente \`[da compilare dal perito]\` o ometti il campo.

VIETATO TASSATIVAMENTE: nomi di professionisti, periziandi, compagnie assicurative inventati. Codici fiscali, indirizzi, date di nascita fittizi.

Campi:
- Nome, qualifica e specializzazione del professionista incaricato (SOLO se nei metadati perizia)
- Data del parere (oggi se non specificata)
- Dicitura "Parere a scopo riserva"
- Dati identificativi del periziando (cerca nei metadati e nelle intestazioni dei documenti forniti)
- Soggetto richiedente (SOLO se nei metadati perizia)

Stile formale.
${NO_EVN_RULE}`,
  },
  // Reuse stragiudiziale documentazione_sanitaria spec
  {
    id: 'documentazione_sanitaria',
    title: 'La Documentazione Medica Prodotta',
    maxTokens: TOKENS_HUGE,
    maxChars: 60_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1000,
    needsOcr: true,
    promptDirective: `${DOC_SANITARIA_INTRO}

${DOC_REPRODUCTION_RULES}

${DOC_SANITARIA_NEUTRALITY}

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}`,
  },
  {
    id: 'quadro_clinico',
    title: 'Quadro Clinico Attuale',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-medical', 'context-summaries'],
    contextMaxChars: 600,
    needsOcr: true,
    promptDirective: `Descrivi il quadro clinico attuale del periziando basandoti sulla documentazione piu recente.
Includi:
- Diagnosi attuali documentate
- Esiti degli ultimi accertamenti diagnostici e strumentali
- Terapie in corso
- Limitazioni funzionali documentate
- Stato clinico complessivo al momento dell'ultima documentazione disponibile
Stile descrittivo e fattuale. Riporta SOLO dati documentati.
NON includere la parte SOGGETTIVA (sintomatologia che il periziando riferisce in visita): quella la redige il perito. Riporta solo il quadro OGGETTIVO documentato.
${NO_EVN_RULE}`,
  },
  {
    id: 'prognosi',
    title: 'Valutazione Prognostica',
    maxTokens: TOKENS_MEDIUM,
    // No 'calculations' here: the graduated ITT/ITP table is rendered once, in
    // conclusioni_parere (mirrors parere_pro_veritate). Listing 'calculations'
    // on both sections made formatCalculationsForPrompt emit the reproduce-table
    // directive twice → duplicated table in the same report.
    dataSources: ['events-medical', 'context-summaries', 'guidelines'],
    contextMaxChars: 600,
    needsOcr: false,
    promptDirective: `Genera una valutazione prognostica basata sulla documentazione clinica disponibile.
Includi:
- Decorso clinico atteso sulla base della patologia documentata e della letteratura
- Tempistiche prevedibili di guarigione o stabilizzazione
- Eventuali necessita terapeutiche future prevedibili (interventi, riabilitazione, terapie)
- Esiti permanenti prevedibili sulla base del quadro attuale
NON quantificare percentuali di invalidita permanente — il perito le determinera.
Stile prudente e basato su evidenze documentali.
${NO_EVN_RULE}`,
  },
  {
    id: 'stima_riserva',
    title: 'Stima della Riserva',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui la stima della riserva tecnica, includendo:*

*- Danno biologico permanente stimato (range percentuale)*
*- Danno biologico temporaneo: periodi ITT e ITP con relative percentuali*
*- Spese mediche future prevedibili*
*- Eventuali costi per assistenza o protesi*
*- Riserva complessiva consigliata (range min-max)*
*- Note e avvertenze sulla stima]*`,
    promptDirective: '',
  },
  {
    id: 'conclusioni_parere',
    title: 'Conclusioni',
    maxTokens: TOKENS_TINY,
    dataSources: ['context-summaries', 'calculations'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Genera una breve sintesi conclusiva del parere scopo riserva (1-2 paragrafi).
Riepiloga:
- Il quadro clinico attuale in sintesi
- La prognosi attesa
- I dati quantitativi disponibili (periodi ITT/ITP, esiti documentati)
NON indicare importi o percentuali di invalidita — il perito li determinera.
Stile sintetico e formale.
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

    case 'has-conciliazione-procedure':
      // Tentativo di conciliazione = atto dovuto solo nell'ATP ex art. 696-bis
      // c.p.c. (istruzione preventiva con funzione conciliativa). Riconosciuto
      // dal tipo di procedimento nei metadati perizia.
      return /\b696[\s-]?bis\b|concilia/i.test(ctx.periziaMetadata?.tipoProcedimento ?? '');

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
 * Considerazioni medico-legali in ambito PENALE (responsabilità medico-sanitaria
 * colposa). Diversa dalla civilistica: NON si valuta il danno (no ITT/ITP/SIMLA);
 * il fulcro è la causa dell'evento/morte, il nesso causale penale e i profili di
 * colpa, con scala probabilistica VERBALE (benchmark CTU penale "Vitali").
 * Placeholder: lo compila il perito.
 */
const CONSIDERAZIONI_PENALE_SECTION: SectionSpec = {
  id: 'considerazioni_penale',
  title: 'Considerazioni Medico-Legali',
  maxTokens: TOKENS_NONE,
  dataSources: [],
  contextMaxChars: 0,
  needsOcr: false,
  isPlaceholder: true,
  placeholderText: `*[Inserire qui le considerazioni medico-legali in ambito PENALE. Questa sezione contiene la valutazione conclusiva del Perito e le risposte ai quesiti.*

*1. INQUADRAMENTO E CAUSA DELL'EVENTO/DECESSO*
*Ricostruzione essenziale della vicenda e identificazione della causa dell'evento lesivo o del decesso (substrato anatomo-patologico, criterio cronologico, criterio di esclusione delle altre cause).*

*2. NESSO DI CAUSALITÀ PENALE*
*- Nesso tra la condotta (commissiva/omissiva) e l'evento secondo il giudizio controfattuale (la condotta alternativa lecita avrebbe evitato l'evento?)*
*- Scala probabilistica VERBALE: "oltre ogni ragionevole dubbio" / "elevatissima probabilità" / "alta probabilità" / "altamente improbabile" — NON percentuali di danno*
*- Eventuale ruolo concausale e fattori endogeni preesistenti*

*3. PROFILI DI COLPA*
*- Valutazione di imperizia / negligenza / imprudenza rispetto alle linee guida e alle buone pratiche vigenti al momento dei fatti (condotta esigibile)*

*NOTA: in ambito penale NON si quantifica il danno biologico (no ITT/ITP, no tabelle SIMLA).*

*4. RISPOSTE AI QUESITI*
*Per ciascun quesito, ri-citare testualmente il quesito tra virgolette come intestazione e articolare la risposta motivata. I quesiti omogenei possono essere accorpati.]*`,
  promptDirective: '',
};

/**
 * Trasforma il piano CTU/CTP civile in penale: sostituisce considerazioni_ml con
 * considerazioni_penale ed esclude le sezioni puramente civilistiche (spese mediche).
 * Pura.
 */
function applyPenaleSections(specs: SectionSpec[]): SectionSpec[] {
  return specs
    .filter((s) => s.id !== 'spese_mediche')
    .map((s) => (s.id === 'considerazioni_ml' ? CONSIDERAZIONI_PENALE_SECTION : s));
}

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
  const conditionFiltered = baseSections.filter((spec) => {
    if (!spec.condition) return true;
    return evaluateCondition(spec.condition, conditionCtx);
  });

  // Selettore "Sezioni del report": il perito può disattivare le sezioni OPZIONALI
  // (risparmio token + report su misura). Le sezioni MANDATORY non sono mai rimosse.
  // Lista assente/vuota = tutte le sezioni (retrocompatibile coi casi esistenti).
  const excluded = periziaMetadata?.excludedReportSections;
  const filtered = excluded && excluded.length > 0
    ? conditionFiltered.filter((spec) => MANDATORY_SECTION_IDS.has(spec.id) || !excluded.includes(spec.id))
    : conditionFiltered;

  // Ambito penale (CTU/CTP role-based): considerazioni civilistiche → penali e
  // niente spese mediche. Non si applica ai moduli parere/RC (civilistici).
  const penaleApplicable = !!periziaMetadata?.ambitoPenale &&
    (caseRole === 'ctu' || caseRole === 'ctp') &&
    moduleId !== 'parere_pro_veritate' &&
    moduleId !== 'parere_scopo_riserva' &&
    moduleId !== RC_CIVILE_MODULE_ID;
  const roleAdjusted = penaleApplicable ? applyPenaleSections(filtered) : filtered;

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
  let sections = penaleApplicable ? applyPenaleSections(base) : base;
  if (moduleId === RC_CIVILE_MODULE_ID) {
    sections = applyRcPeritoSections(sections, periziaMetadata);
  }

  return sections.find((s) => s.id === sectionId);
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

// ── Exports for testing ─────────────────────────────────────────────

export {
  CTU_SECTIONS,
  CTP_SECTIONS,
  STRAGIUDIZIALE_SECTIONS,
  PARERE_PRO_VERITATE_SECTIONS,
  PARERE_SCOPO_RISERVA_SECTIONS,
};
