import type { CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { SectionSpec, SectionCondition } from './section-generation-types';
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
const ANTI_REPETITION_AND_LENGTH_RULES = `REGOLE ANTI-RIPETIZIONE E LUNGHEZZA (vincolanti — Lavini 2026-05-17):
- **MAX 80 parole di prosa di commento** tra una citazione e la successiva. Le citazioni testuali del documento (tra virgolette) possono essere illimitate, MA la prosa NO.
- **Se hai gia citato un fatto clinico** (stessa data + stesso tipo, es. "intervento del 15.03.2024") in un blocco precedente di questa stessa sezione, **NON ripeterlo**. Riferisciti con UNA SOLA RIGA: "Per i dettagli dell'intervento del 15.03.2024 vedi blocco precedente."
- **Diari clinici pluri-giornalieri**: raggruppa SEMPRE i giorni con QUADRO INVARIATO in un blocco unico: "Dal DD.MM al DD.MM.YYYY: decorso regolare, parametri vitali nella norma, terapia [X] proseguita." MAI ripetere giorno per giorno se il quadro non cambia.
- **Esami di laboratorio identici nello stesso giorno**: 1 sola tabella per data, non duplicare.
- **Limite sezione**: se la sezione supera 30.000 caratteri, il sistema la taglia automaticamente al boundary di paragrafo piu vicino. Quindi sii CONCISO: il perito preferisce 20 blocchi essenziali a 50 ridondanti.`;

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
    title: 'Dati della Documentazione in Atti',
    maxTokens: TOKENS_MEDIUM,
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
    title: 'Dati della Documentazione Sanitaria',
    maxTokens: TOKENS_HUGE,
    maxChars: 30_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1500,
    needsOcr: true,
    promptDirective: `Riproduzione FEDELE e CRONOLOGICA della documentazione sanitaria. OGNI evento fornito DEVE comparire come blocco distinto — questo è il principio di completezza non negoziabile. Il principio di concisione vincola la PROSA tra le citazioni, non i fatti.

FORMATO CITAZIONE OBBLIGATORIO per OGNI documento/episodio clinico:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele riprodotto dal documento originale ..."

Regole di riproduzione fedele ma sintetica (mai a scapito dei fatti clinici):
- Intestazione in GRASSETTO con tipo + autore/struttura + data, seguita dal contenuto fra VIRGOLETTE.
- **Diari clinici (cartella clinica)**: riporta i giorni con variazioni cliniche rilevanti (sintomatologia, parametri alterati, terapie modificate, complicanze, eventi acuti, decisioni terapeutiche). I periodi clinicamente stabili raggruppali con date inizio-fine: "Dal DD.MM al DD.MM.YYYY: decorso regolare, parametri vitali stabili, terapia [X] proseguita senza modifiche". Non duplicare giorni con identico quadro clinico.
- **Verbali operatori**: riporta diagnosi pre-operatoria + tecnica chirurgica eseguita + diagnosi post-operatoria + eventuali complicanze intra/post-operatorie + esito immediato. Sintetizza le sezioni narrative accessorie (anestesia routine senza eventi, preparazione del campo).
- **Referti radiologici/strumentali**: tecnica utilizzata + reperti rilevanti + conclusione/diagnosi del referto. Non riprodurre descrizioni anatomiche routinarie senza significato clinico.
- **Lettere di dimissione**: diagnosi alla dimissione + terapia domiciliare prescritta + indicazioni follow-up. Sintetizza il riassunto del decorso (già esposto nei diari clinici della stessa cartella).
- **Esami di laboratorio**: SEMPRE in tabella markdown pipe, una tabella separata per ogni data/prelievo. Valori alterati rispetto al range di riferimento in grassetto. Includi tutti i valori del documento, anche quelli nella norma (il perito necessita del quadro completo).
- **Immagini diagnostiche disponibili nella lista**: inserisci INLINE subito dopo la citazione pertinente con la sintassi ![Fig. N — descrizione formale](ocr-image:percorso-esatto).
- **Stile narrativo**: prosa discorsiva tra le citazioni (mai elenchi puntati per la narrazione clinica). Le tabelle markdown per i dati strutturati sono l'unica eccezione.

REGOLA DI NEUTRALITÀ ASSOLUTA — questa sezione è una RIPRODUZIONE DOCUMENTALE, NON un'analisi:
- VIETATO il pattern "FATTO DOCUMENTATO / STANDARD DI RIFERIMENTO / ELEMENTI A SUPPORTO / ELEMENTI CONTRARI / CONSEGUENZE" (è destinato ESCLUSIVAMENTE alla sezione anomalie/considerazioni medico-legali).
- VIETATO sotto-titoli interpretativi tipo "Profili critici documentali", "Quadro documentale complessivo", "Elementi favorevoli/sfavorevoli".
- VIETATO commenti su standard di cura, linee guida, ritardi, omissioni, conformità o non-conformità a protocolli — qui SOLO citazioni testuali fedeli e prosa cronologica neutra.
- VIETATE formulazioni soggettive: "verosimile", "ritardo", "lacuna", "mancanza", "discrepanza", "criticità", "ELEMENTO" (in senso valutativo), "appare", "si ritiene".
- Le anomalie e i giudizi vanno SOLO nelle sezioni dedicate. Qui SOLO fatti come riportati dai documenti, niente di più.

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}

${DOCUMENT_ANALYSIS_FORMULATIONS}

${DOCUMENTAZIONE_SANITARIA_EXAMPLE}`,
  },
  {
    id: 'spese_mediche',
    title: 'Spese Mediche Esibite',
    maxTokens: TOKENS_TINY,
    dataSources: ['events-expenses'],
    contextMaxChars: 300,
    needsOcr: true,
    condition: 'has-expense-events',
    promptDirective: `Elenca le spese mediche documentate in tabella markdown con colonne: Data | Descrizione | Struttura | Importo.
Per ogni voce valuta congruita e necessita rispetto al quadro clinico documentato.
Includi un totale a fine tabella.

NOTA DATA NON DOCUMENTATA (post-fix Lavini 2026-05-11):
- Alcune voci (imposta di bollo, riepiloghi, contanti senza ricevuta) possono arrivare con "Data non documentata" o data "01.01.1900".
- Per queste voci, riporta in tabella la dicitura "—" (trattino lungo) nella colonna Data invece della stringa letterale.
- NON escludere mai una voce per assenza di data: l'importo e' il dato vincolante.
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
    id: 'operazioni_peritali',
    title: 'I Dati dell\'Incontro con le Parti',
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
*- Valutazione del nesso di causalita materiale (criterio controfattuale) e giuridico ("piu probabile che non")*
*- Analisi della condotta sanitaria alla luce delle linee guida e buone pratiche cliniche applicabili al momento dei fatti*
*- Valutazione del danno biologico temporaneo (ITT/ITP) con date e periodi*
*- Valutazione del danno biologico permanente con riferimento alle tabelle SIMLA*
*- Eventuale danno morale ed esistenziale*
*- Personalizzazione del danno se applicabile*

*3. RISPOSTE AI QUESITI DEL GIUDICE*
*Per ciascun quesito formulato dal Giudice (vedi sezione "Quesiti"), articolare risposta motivata richiamando i fatti documentali e l'analisi sopra esposta.]*`,
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
    maxChars: 30_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1000,
    needsOcr: true,
    promptDirective: `Riproduzione FEDELE e CRONOLOGICA della documentazione sanitaria. OGNI evento fornito DEVE comparire — completezza dei fatti non negoziabile. Concisione della prosa tra le citazioni.

FORMATO CITAZIONE per OGNI documento:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."

Regole:
- **Diari clinici**: solo giorni con variazioni cliniche rilevanti; periodi stabili raggruppati con date inizio-fine.
- **Verbali operatori**: diagnosi pre/post + tecnica + complicanze + esito. Sintetizza le narrazioni accessorie (anestesia routine, preparazione campo).
- **Referti radiologici/strumentali**: tecnica + reperti rilevanti + conclusione.
- **Lettere di dimissione**: diagnosi + terapia domiciliare + follow-up.
- **Esami lab**: TUTTI i valori in tabella markdown (una tabella per data/prelievo). Valori alterati in grassetto.
- **Immagini diagnostiche disponibili**: inseriscile INLINE subito dopo la citazione pertinente.
- **Stile**: prosa discorsiva tra le citazioni, MAI elenchi puntati per la narrazione clinica.

REGOLA DI NEUTRALITÀ ASSOLUTA — questa sezione è una RIPRODUZIONE DOCUMENTALE, NON un'analisi:
- VIETATO il pattern "FATTO DOCUMENTATO / STANDARD DI RIFERIMENTO / ELEMENTI A SUPPORTO / ELEMENTI CONTRARI / CONSEGUENZE" (è destinato ESCLUSIVAMENTE alla sezione anomalie/considerazioni medico-legali).
- VIETATO sotto-titoli interpretativi tipo "Profili critici documentali", "Quadro documentale complessivo", "Elementi favorevoli/sfavorevoli".
- VIETATO commenti su standard di cura, linee guida, ritardi, omissioni, conformità o non-conformità a protocolli — qui SOLO citazioni testuali fedeli e prosa cronologica neutra.
- VIETATE formulazioni soggettive: "verosimile", "ritardo", "lacuna", "mancanza", "discrepanza", "criticità", "appare", "si ritiene".
- Le anomalie e i giudizi vanno SOLO nelle sezioni dedicate. Qui SOLO fatti come riportati dai documenti, niente di più.

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}`,
  },
  {
    id: 'spese_mediche',
    title: 'Spese Mediche',
    maxTokens: TOKENS_TINY,
    dataSources: ['events-expenses'],
    contextMaxChars: 200,
    needsOcr: true,
    condition: 'has-expense-events',
    promptDirective: `Elenca le spese mediche documentate in tabella markdown: Data | Descrizione | Struttura | Importo.
Includi totale a fine tabella.

NOTA DATA NON DOCUMENTATA (post-fix Lavini 2026-05-11):
- Alcune voci (imposta di bollo, riepiloghi, contanti senza ricevuta) possono arrivare con "Data non documentata" o data "01.01.1900".
- Per queste voci, riporta in tabella la dicitura "—" (trattino lungo) nella colonna Data invece della stringa letterale.
- NON escludere mai una voce per assenza di data: l'importo e' il dato vincolante.
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
    maxChars: 30_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1000,
    needsOcr: true,
    promptDirective: `Riproduzione FEDELE e CRONOLOGICA della documentazione sanitaria. OGNI evento fornito DEVE comparire — completezza dei fatti non negoziabile. Concisione della prosa tra le citazioni.

FORMATO CITAZIONE per OGNI documento:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."

Regole:
- **Diari clinici**: solo giorni con variazioni cliniche rilevanti; periodi stabili raggruppati con date inizio-fine.
- **Verbali operatori**: diagnosi pre/post + tecnica + complicanze + esito. Sintetizza le narrazioni accessorie (anestesia routine, preparazione campo).
- **Referti radiologici/strumentali**: tecnica + reperti rilevanti + conclusione.
- **Lettere di dimissione**: diagnosi + terapia domiciliare + follow-up.
- **Esami lab**: TUTTI i valori in tabella markdown (una tabella per data/prelievo). Valori alterati in grassetto.
- **Immagini diagnostiche disponibili**: inseriscile INLINE subito dopo la citazione pertinente.
- **Stile**: prosa discorsiva tra le citazioni, MAI elenchi puntati per la narrazione clinica.

REGOLA DI NEUTRALITÀ ASSOLUTA — questa sezione è una RIPRODUZIONE DOCUMENTALE, NON un'analisi:
- VIETATO il pattern "FATTO DOCUMENTATO / STANDARD DI RIFERIMENTO / ELEMENTI A SUPPORTO / ELEMENTI CONTRARI / CONSEGUENZE" (è destinato ESCLUSIVAMENTE alla sezione anomalie/considerazioni medico-legali).
- VIETATO sotto-titoli interpretativi tipo "Profili critici documentali", "Quadro documentale complessivo", "Elementi favorevoli/sfavorevoli".
- VIETATO commenti su standard di cura, linee guida, ritardi, omissioni, conformità o non-conformità a protocolli — qui SOLO citazioni testuali fedeli e prosa cronologica neutra.
- VIETATE formulazioni soggettive: "verosimile", "ritardo", "lacuna", "mancanza", "discrepanza", "criticità", "appare", "si ritiene".
- Le anomalie e i giudizi vanno SOLO nelle sezioni dedicate. Qui SOLO fatti come riportati dai documenti, niente di più.

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
    maxChars: 30_000,
    dataSources: ['events-medical', 'image-analysis'],
    contextMaxChars: 1000,
    needsOcr: true,
    promptDirective: `Riproduzione FEDELE e CRONOLOGICA della documentazione sanitaria. OGNI evento fornito DEVE comparire — completezza dei fatti non negoziabile. Concisione della prosa tra le citazioni.

FORMATO CITAZIONE per OGNI documento:
**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."

Regole:
- **Diari clinici**: solo giorni con variazioni cliniche rilevanti; periodi stabili raggruppati con date inizio-fine.
- **Verbali operatori**: diagnosi pre/post + tecnica + complicanze + esito. Sintetizza le narrazioni accessorie (anestesia routine, preparazione campo).
- **Referti radiologici/strumentali**: tecnica + reperti rilevanti + conclusione.
- **Lettere di dimissione**: diagnosi + terapia domiciliare + follow-up.
- **Esami lab**: TUTTI i valori in tabella markdown (una tabella per data/prelievo). Valori alterati in grassetto.
- **Immagini diagnostiche disponibili**: inseriscile INLINE subito dopo la citazione pertinente.
- **Stile**: prosa discorsiva tra le citazioni, MAI elenchi puntati per la narrazione clinica.

REGOLA DI NEUTRALITÀ ASSOLUTA — questa sezione è una RIPRODUZIONE DOCUMENTALE, NON un'analisi:
- VIETATO il pattern "FATTO DOCUMENTATO / STANDARD DI RIFERIMENTO / ELEMENTI A SUPPORTO / ELEMENTI CONTRARI / CONSEGUENZE" (è destinato ESCLUSIVAMENTE alla sezione anomalie/considerazioni medico-legali).
- VIETATO sotto-titoli interpretativi tipo "Profili critici documentali", "Quadro documentale complessivo", "Elementi favorevoli/sfavorevoli".
- VIETATO commenti su standard di cura, linee guida, ritardi, omissioni, conformità o non-conformità a protocolli — qui SOLO citazioni testuali fedeli e prosa cronologica neutra.
- VIETATE formulazioni soggettive: "verosimile", "ritardo", "lacuna", "mancanza", "discrepanza", "criticità", "appare", "si ritiene".
- Le anomalie e i giudizi vanno SOLO nelle sezioni dedicate. Qui SOLO fatti come riportati dai documenti, niente di più.

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
${NO_EVN_RULE}`,
  },
  {
    id: 'prognosi',
    title: 'Valutazione Prognostica',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-medical', 'context-summaries', 'calculations', 'guidelines'],
    contextMaxChars: 600,
    needsOcr: false,
    promptDirective: `Genera una valutazione prognostica basata sulla documentazione clinica disponibile.
Includi:
- Decorso clinico atteso sulla base della patologia documentata e della letteratura
- Tempistiche prevedibili di guarigione o stabilizzazione
- Eventuali necessita terapeutiche future prevedibili (interventi, riabilitazione, terapie)
- Periodi di invalidita temporanea residua stimabili (ITT/ITP) se i calcoli sono disponibili
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
  return baseSections.filter((spec) => {
    if (!spec.condition) return true;
    return evaluateCondition(spec.condition, conditionCtx);
  });
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

export {
  CTU_SECTIONS,
  CTP_SECTIONS,
  STRAGIUDIZIALE_SECTIONS,
  PARERE_PRO_VERITATE_SECTIONS,
  PARERE_SCOPO_RISERVA_SECTIONS,
};
