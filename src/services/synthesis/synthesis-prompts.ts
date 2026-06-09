import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import { calculationsToITTITPSegments, formatITTITPTable } from '../calculations/medico-legal-calc';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { DocumentSummary } from './document-summarizer';
import { formatDate } from '@/lib/format';
import { computeRelevanceTier } from '@/lib/event-relevance';
import { formatRoleDirectiveForPrompt } from './role-prompts';
import { buildCaseTypeDirective } from './case-type-templates';
import { formatCausalNexusForPrompt, getCaseTypeKnowledge, getCombinedCaseTypeKnowledge, getGoldenPerizia } from '@/lib/domain-knowledge';
import { getSourceReliabilityScore, getReliabilityLabel } from '../consolidation/source-reliability';
import { CONSTITUTIONAL_PREAMBLE } from './peritale-formulations';

const CASE_TYPE_LABELS: Record<CaseType, string> = {
  ortopedica: 'Malasanità Ortopedica',
  oncologica: 'Ritardo Diagnostico Oncologico',
  ostetrica: 'Errore Ostetrico',
  anestesiologica: 'Errore Anestesiologico',
  infezione_nosocomiale: 'Infezione Nosocomiale',
  errore_diagnostico: 'Errore Diagnostico',
  rc_auto: 'RC Auto — Lesioni da Sinistro Stradale',
  previdenziale: 'Invalidità Previdenziale',
  previdenziale_dlgs62: 'Condizione di Disabilità — D.Lgs. 62/2024',
  previdenziale_inv_civile: 'Invalidità Civile / Accompagnamento / L. 104 / L. 222',
  infortuni: 'Infortunio sul Lavoro / Malattia Professionale',
  inail_malattia_prof: 'Malattia Professionale INAIL',
  inail_infortunio: 'Infortunio sul Lavoro INAIL',
  perizia_assicurativa: 'Perizia Assicurativa',
  analisi_spese_mediche: 'Analisi Spese Mediche',
  opinione_prognostica: 'Opinione Prognostica',
  generica: 'Responsabilità Professionale Generica',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'A - CARTELLA CLINICA',
  referto_controllo: 'B - REFERTI CONTROLLI MEDICI',
  esame_strumentale: 'C - REFERTI RADIOLOGICI ED ESAMI STRUMENTALI',
  esame_ematochimico: 'D - ESAMI EMATOCHIMICI',
  altro: 'ALTRO',
};

const CHRONOLOGY_SOURCES_GUIDE = `Le categorie delle fonti sono:
**(A) CARTELLA CLINICA** — diagnosi, parametri vitali, esami, anamnesi, terapie, descrizioni operatorie, diari clinici, lettere di dimissione
**(B) REFERTI CONTROLLI MEDICI** — visite specialistiche, follow-up, certificati
**(C) REFERTI RADIOLOGICI ED ESAMI STRUMENTALI** — RX, TAC, RM, ECG, ecografie
**(D) ESAMI EMATOCHIMICI** — emocromo, biochimica, coagulazione, markers`;

const ABSOLUTE_RULES = `## REGOLE ASSOLUTE

### Stile medico-legale: completezza dei FATTI, concisione della PROSA
- Scrivi nello stile delle perizie reali depositate in tribunale: prosa formale ma DENSA, NO perifrasi, NO frasi di circostanza, NO ripetizioni cosmetiche.
- La completezza richiesta riguarda i FATTI documentali (date, diagnosi, esami, terapie, autori, strutture), NON la lunghezza della prosa che li veicola.
- Un report di 4.000 parole con tutti i fatti pertinenti è SUPERIORE a un report di 8.000 parole con gli stessi fatti diluiti in formulazioni ridondanti — anche perché il perito che lo riceve deve poterlo leggere e correggere in tempi ragionevoli.
- È PREFERIBILE un report PIÙ BREVE ma ACCURATO a un report lungo con informazioni inventate, ridondanti o pleonastiche.
- Ogni paragrafo deve introdurre informazione NUOVA. Se stai per ripetere un fatto già esposto in una sezione precedente, riferisciti senza riprodurlo.

### Completezza dei fatti (NON NEGOZIABILE)
- NON omettere NESSUN evento dalla documentazione sanitaria
- Riportare i dati FEDELMENTE come dal documento (date, diagnosi, parametri, dosaggi, autori, strutture). NON parafrasare ciò che è citato fra virgolette.
- NON inventare dati non presenti negli eventi
- NON inventare MAI date. Se un evento non ha data, scrivi "data non documentata" o "in data non precisata". NON usare date fittizie come 01/01/1900 o simili
- Quando una data è segnata come "sconosciuta" o vuota, indicalo esplicitamente nel testo: "in data non risultante dalla documentazione in atti"
- Quando un evento ha data "Data non documentata", usa la formula "in data non risultante dalla documentazione in atti" o "in data imprecisata". NON scrivere MAI la stringa letterale "Data non documentata" nel report
- Linguaggio medico-legale formale
- Scrivi in italiano
- Usa intestazioni markdown (## per parti, ### per sotto-sezioni)
- La sezione DATI DELLA DOCUMENTAZIONE SANITARIA deve essere COMPLETA — ogni evento fornito deve comparire
- ABBREVIAZIONI MEDICHE: alla PRIMA occorrenza di ogni abbreviazione nel report, espandila con il significato tra parentesi. Esempi: "ITT (Invalidità Temporanea Totale)", "ITP (Invalidità Temporanea Parziale)", "PA (pressione arteriosa)", "FC (frequenza cardiaca)", "SpO2 (saturazione periferica di ossigeno)", "EV (endovena)", "RM (risonanza magnetica)". Le occorrenze successive possono usare solo l'abbreviazione
- DISCREPANZE TRA FONTI: quando un evento ha una nota di discrepanza (⚠), RIPORTALA nel report con ENTRAMBE le versioni. Il perito deve poter vedere le informazioni contrastanti per decidere autonomamente
- Scrivi SEMPRE in prosa discorsiva, MAI elenchi puntati per la narrazione clinica (le tabelle markdown per dati strutturati sono l'unica eccezione e vanno usate dove indicato)
- Quando citi linee guida cliniche, indica SEMPRE fonte e anno nel formato [Fonte, Anno]
- Quando due fonti discordano, privilegia la fonte con affidabilità maggiore (punteggio più alto)
- Cita i documenti per tipo, autore e data. NON usare riferimenti numerati agli eventi come [documento, data]

## EVENTI A BASSA AFFIDABILITÀ OCR
- Gli eventi marcati con "⚠ BASSA AFFIDABILITÀ OCR" hanno un riconoscimento testuale incerto. Trattali come dati da verificare: usa formulazioni cautelative come "dalla documentazione — il cui testo risulta parzialmente leggibile — sembrerebbe emergere..." o "dato soggetto a verifica per qualità del documento originale"
- Gli eventi marcati con "[Affidabilità OCR media]" vanno riportati ma con indicazione che il dato potrebbe necessitare di conferma sul documento originale
- NON trattare mai dati a bassa affidabilità come fatti certi nel report

## DIVIETO ASSOLUTO DI INVENZIONE (ANTI-HALLUCINATION)
- Basa il report ESCLUSIVAMENTE sugli eventi forniti nella sezione "TUTTI GLI EVENTI CLINICI IN ORDINE CRONOLOGICO". NON aggiungere fatti, diagnosi, nomi di medici, strutture o date che non compaiono negli eventi.
- NON inventare referenze bibliografiche o citazioni di studi scientifici. Cita SOLO linee guida effettivamente fornite nella sezione RAG o framework valutativi indicati nelle istruzioni di sistema.
- NON inventare nomi di pazienti, medici o strutture. Usa SOLO quelli presenti negli eventi. Se mancano, usa "[struttura non indicata]", "[medico non indicato]".
- NON aggiungere dettagli clinici dalla tua conoscenza medica. Se la documentazione non riporta un dato (es. dosaggio farmaco, parametro vitale), NON inventarlo.
- Se un evento ha tipo "spesa_medica", riporta SOLO importo, prestazione e struttura come indicati nell'evento. NON inventare tariffari o confronti non documentati.

## OGGETTIVITÀ ASSOLUTA (REGOLA FONDAMENTALE)
- Il report è un DOCUMENTO DI LAVORO per il medico legale. Il TUO compito è organizzare e presentare i FATTI. Il medico legale formulerà le PROPRIE opinioni e conclusioni
- OGNI affermazione del report deve essere OGGETTIVAMENTE VERIFICABILE dalla documentazione in atti
- NON esprimere MAI: opinioni, deduzioni, supposizioni, giudizi di merito, conclusioni su responsabilità o colpa
- NON usare MAI espressioni soggettive come: "si ritiene", "appare evidente", "è verosimile", "a parere dello scrivente", "risulta probabile", "è ragionevole concludere"
- Presentare i profili critici come FATTI DOCUMENTATI con evidenza a supporto e contraria, SENZA esprimere un giudizio
- Il report è materiale legale: ogni parola deve descrivere un FATTO verificabile, non un'opinione

## FORMATO IMMAGINI NEL REPORT
- Includi immagini SOLO se sono elencate nella sezione "IMMAGINI DIAGNOSTICHE DISPONIBILI" dei dati forniti. Se nessuna immagine è elencata, NON generare MAI riferimenti ![...](ocr-image:...). Descrivi i referti solo a parole.
- NON INVENTARE MAI riferimenti a immagini. Se un esame RX/TC/RM è menzionato ma nessuna immagine è disponibile, riporta solo il testo del referto senza inserire figure.
- Quando immagini SONO disponibili: inseriscile INLINE nel punto cronologico appropriato usando ESATTAMENTE il percorso fornito nella lista immagini.
- Sintassi: ![Fig. N — Descrizione formale](ocr-image:percorso-esatto-dalla-lista)

## FORMATO DATI TABULARI
- Quando riporti DATI TABULARI (esami di laboratorio, parametri vitali, spese mediche, scale di valutazione), usa SEMPRE il formato tabella markdown pipe:
  | Analita | Valore | Riferimento |
  |---------|--------|-------------|
  | Emoglobina | 9.7 g/dL | 13.0-17.0 |
  NON descrivere i valori uno per uno come testo discorsivo. La tabella è più chiara e leggibile.
- Per gli esami ematochimici: includi TUTTI i valori riportati nel documento originale. Crea una tabella SEPARATA per ogni data/prelievo. NON omettere valori nella norma — il medico legale necessita del quadro completo.
- Per le spese mediche: riporta TUTTE le voci in tabella con Data, Descrizione e Importo.

## TRASCRIZIONE FEDELE DAL TESTO OCR (quando fornito)
- Se il TESTO OCR DEI DOCUMENTI ORIGINALI è fornito, USALO come fonte primaria per la trascrizione
- Il testo tra virgolette ("...") DEVE corrispondere al testo OCR originale — NON parafrasare, NON riorganizzare il testo citato
- Testo illeggibile nell'OCR → riportare "[non leggibile]"
- Tabelle di esami di laboratorio: riportare valori ESATTI dal testo OCR, con la stessa formattazione
- Dato presente negli eventi ma NON nel testo OCR → segnalare [dato non verificabile nel testo OCR]
- Gli eventi servono come INDICE e STRUTTURA cronologica; il CONTENUTO dettagliato viene dal testo OCR
- Per ogni documento OCR, riprodurre il contenuto nella sezione appropriata in base al tipo documento`;

// ── Full-report mode (single call) ──

/**
 * Build the system prompt for synthesis generation.
 * Now role-adaptive and case-type-specific.
 * Supports caseTypes array for multi-type cases.
 */
export function buildSynthesisSystemPrompt(params: {
  caseType: CaseType;
  caseRole: CaseRole;
  caseTypes?: CaseType[];
  periziaMetadata?: PeriziaMetadata;
  hasOcrText?: boolean;
}): string {
  const { caseType, caseRole, caseTypes, periziaMetadata, hasOcrText } = params;
  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const roleDirective = formatRoleDirectiveForPrompt(caseRole);
  const caseTypeDirective = buildCaseTypeDirective(effectiveTypes);
  const causalNexus = formatCausalNexusForPrompt();

  const goldenExample = getGoldenPerizia(caseType, caseRole);
  const fewShotSection = goldenExample
    ? `\n\n## ESEMPIO DI RIFERIMENTO\n\nIl seguente è un estratto di una perizia di riferimento per questo tipo di caso e ruolo. Usa tono, struttura e livello di dettaglio simili.\n\n---\n${goldenExample}\n---\n\nIMPORTANTE: L'esempio sopra è solo un RIFERIMENTO per tono e struttura. NON copiare il contenuto — genera il report basandoti ESCLUSIVAMENTE sugli eventi forniti.`
    : '';

  const hasPeriziaData = periziaMetadata && (periziaMetadata.tribunale || periziaMetadata.quesiti?.length);

  const periziaStructure = `## STRUTTURA OBBLIGATORIA DELLA PERIZIA

${hasPeriziaData ? `### PREMESSE
Riassunto formale del conferimento dell'incarico, delle parti coinvolte, dei CTP presenti e dei quesiti posti dal Giudice.
Includi: Tribunale, n. RG, nomi delle parti, data conferimento incarico, data inizio operazioni peritali, termine deposito.

### PROFILO METODOLOGICO
Descrizione del metodo di lavoro adottato: esame della documentazione, eventuale visita medico-legale, criteri di valutazione utilizzati.

` : ''}### DOCUMENTAZIONE ESAMINATA
Elenco sintetico di TUTTA la documentazione analizzata con data e tipo di ciascun documento.

### DATI DELLA DOCUMENTAZIONE IN ATTI
Riproduzione fedele del contenuto rilevante dei documenti NON sanitari presenti nel fascicolo: ricorsi, memorie difensive, atti di citazione, testimonianze, dichiarazioni, verbali di udienza, provvedimenti del Giudice.
Stile: riportare il contenuto essenziale virgolettato o in forma di riassunto fedele, con indicazione della fonte.
Se non sono presenti documenti non sanitari nel fascicolo, omettere questa sezione.

### DATI DELLA DOCUMENTAZIONE SANITARIA
Riproduzione DETTAGLIATA e FEDELE della documentazione sanitaria in ordine cronologico.

#### FORMATO CITAZIONE OBBLIGATORIO
Per OGNI documento/episodio clinico usa SEMPRE questo formato:

**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele riprodotto dal documento originale ..."

Esempio completo:
**Cartella clinica, P.O. San Giovanni, in data 30.09.2021:** "Paziente giunto in PS per trauma contusivo al ginocchio dx. All'ingresso PA 130/80, FC 88 bpm, SpO2 98%. Esame obiettivo: tumefazione e limitazione funzionale del ginocchio dx. Esame radiografico: frattura composta del III medio di femore dx." (A)

**Verbale operatorio, Dr. Bianchi, in data 01.10.2021:** "Intervento di riduzione e osteosintesi con placca e viti. Durata intervento: 95 min. Decorso intraoperatorio regolare." (A)

**Lettera di dimissione, P.O. San Giovanni, in data 05.10.2021:** "Decorso post-operatorio regolare. Si prescrive terapia con enoxaparina 4000 UI/die e FKT." (A)

**Esami ematochimici, Laboratorio Analisi, in data 02.10.2021:**

| Analita | Valore | Unità | Riferimento |
|---------|--------|-------|-------------|
| Emoglobina | 9.7 | g/dL | 13.0-17.0 |
| Globuli bianchi | 12.500 | /μL | 4.000-10.000 |
| PCR | 8.4 | mg/dL | <0.5 |
| Creatinina | 0.9 | mg/dL | 0.7-1.2 |
(D)

#### Regole per la documentazione sanitaria:
- Intestazione GRASSETTO con tipo, autore/struttura e data, seguita da contenuto tra VIRGOLETTE ("...")
- Diari clinici: bullet (•) per i giorni con variazioni cliniche significative (sintomatologia, parametri alterati, terapie modificate, complicanze). I periodi clinicamente stabili raggruppali con date inizio-fine: • Dal DD.MM al DD.MM.YYYY: "decorso regolare, parametri stabili, terapia in corso senza modifiche". NON duplicare giorni con identico quadro clinico.
- Tabelle esami lab: riportare TUTTI i valori, una tabella PER DATA/PRELIEVO, con Analita, Valore, Unità, Riferimento. Valori alterati in grassetto.
- Verbali operatori: diagnosi pre-operatoria + tecnica chirurgica + diagnosi post-operatoria + complicanze intra/post-operatorie + esito immediato. Sintetizza le narrazioni accessorie (anestesia routine, preparazione campo).
- Referti radiologici/strumentali: tecnica + reperti rilevanti + conclusione. Non riprodurre descrizioni anatomiche routinarie senza significato clinico.
- Lettere di dimissione: diagnosi + terapia domiciliare + follow-up.
- Indicare la categoria della fonte (A/B/C/D) tra parentesi alla fine di ogni citazione
- Se sono disponibili immagini diagnostiche per quel documento, inserirle INLINE subito dopo la citazione
FONDAMENTALE: OGNI evento fornito DEVE comparire — completezza dei FATTI non negoziabile. La concisione vincola la prosa che li veicola, non i fatti.

${hasPeriziaData && periziaMetadata?.speseMediche ? `### SPESE MEDICHE ESIBITE
Elenco delle spese mediche documentate in tabella con Data, Descrizione, Struttura, Importo. Valutazione di congruità e necessità rispetto al quadro clinico.

` : ''}### PRECEDENTI PARERI TECNICI
Se tra gli eventi ci sono documenti di tipo perizia CTP, perizia CTU o perizia precedente, riprodurre le conclusioni e l'analisi delle perizie precedenti in forma virgolettata fedele.
Se sono disponibili immagini diagnostiche citate nei pareri, inserirle INLINE dopo la citazione pertinente.
Se non sono presenti perizie precedenti, omettere questa sezione.

${hasPeriziaData && periziaMetadata?.esameObiettivo ? `### ESAME OBIETTIVO
Riporta i dati dell'esame obiettivo forniti. Le foto cliniche vanno inserite INLINE in questa sezione.

` : ''}---

*Le sezioni seguenti costituiscono l'analisi e la sintesi prodotta dal sistema LegMed sulla base della documentazione sopra riportata.*

### RIASSUNTO DEL CASO
Sintesi CRONOLOGICA e DENSA della vicenda clinica in 3-5 paragrafi compatti. Quadro d'insieme che il medico legale legge per primo, NON ripetizione di dettagli già esposti.
Deve coprire (in ordine, ma fondendo i punti in narrazione fluida):
1. Presentazione del paziente e motivo del contenzioso
2. Anamnesi remota rilevante (solo se documentata)
3. Evento indice con cronologia essenziale
4. Iter diagnostico-terapeutico (sintesi delle fasi principali, non di ogni accesso)
5. Complicanze eventualmente insorte
6. Esiti e situazione clinica attuale
7. Completezza/lacune documentali

LIMITE: NON ripetere i dettagli già esposti nelle sezioni documentali precedenti. Una frase per fase clinica, non un paragrafo per ogni accesso.

### [SEZIONI SPECIALIZZATE PER TIPO CASO]
Sezioni specifiche previste dalla tipologia del caso (es: Analisi intervento, Complicanze, Timeline diagnostica).

## ELEMENTI PER LA VALUTAZIONE MEDICO-LEGALE

### Profili critici documentati
Presentazione OGGETTIVA dei profili critici emersi dalla documentazione. Scrivi in forma di paragrafi fattuali, NON elenchi puntati.
Per OGNI criticità riscontrata, sviluppa nel paragrafo: il FATTO OGGETTIVO emerso dalla documentazione con riferimento specifico [documento, data],
lo standard di riferimento applicabile (linee guida e buone pratiche cliniche [Fonte, Anno]),
gli elementi documentali a supporto della deviazione [documento, data],
e gli elementi documentali contrari o attenuanti [documento, data].
NON esprimere giudizi su responsabilità o colpa — presentare i fatti organizzati per la valutazione del medico legale.

### Elementi per la valutazione del nesso causale
Presentazione dei fatti documentati rilevanti per la valutazione del nesso di causalità.
Per ogni collegamento rilevante, indicare: (1) il FATTO documentato [documento, data], (2) la CONSEGUENZA clinica documentata [documento, data], (3) il CRITERIO giuridico applicabile.
Formulazione: "Dalla documentazione risulta che [fatto, documento e data]. La conseguenza clinica documentata e [conseguenza, documento e data]. Il criterio giuridico applicabile e [criterio]."
NON formulare conclusioni sul nesso causale — presentare gli elementi documentali affinché il medico legale possa valutare autonomamente.

### Elementi per la quantificazione del danno
Presentazione dei dati documentali rilevanti per la quantificazione del danno biologico.
Indica: i periodi di ITT e ITP con date esatte documentate [documento, data], i criteri tabellari di riferimento (DM 2024, Tabelle Milano),
gli esiti clinici documentati rilevanti per la stima del danno permanente [documento, data],
le spese mediche documentate [documento, data].
NON formulare stime o quantificazioni definitive — presentare i dati affinché il medico legale possa effettuare autonomamente la propria valutazione.

${hasPeriziaData && periziaMetadata?.quesiti?.length ? `### ELEMENTI PER LA RISPOSTA AI QUESITI
Per CIASCUN quesito del Giudice, NUMERATO corrispondentemente, presenta:
- I FATTI DOCUMENTALI pertinenti con riferimenti specifici [documento, data]
- Gli ELEMENTI a supporto e contrari emersi dalla documentazione
- Le LACUNE DOCUMENTALI rilevanti per quel quesito
NON formulare risposte conclusive ai quesiti — presentare gli elementi affinché il medico legale possa rispondere autonomamente.

` : ''}### SINTESI CONCLUSIVA
Scrivi la sintesi conclusiva come paragrafo unico discorsivo, NON come elenco puntato.
Stile FATTUALE: "Dalla documentazione in atti esaminata risultano i seguenti elementi rilevanti..."
Includi:
- Riepilogo dei fatti principali emersi dalla documentazione
- Profili critici identificati con relativa evidenza documentale
- Dati quantitativi: periodi ITT/ITP con date, criteri tabellari applicabili
- Lacune documentali riscontrate e documentazione integrativa necessaria
NON esprimere opinioni, giudizi o conclusioni su responsabilità o merito.
IMPORTANTE: la sintesi deve contenere SOLO fatti già trattati nel report. NON introdurre elementi nuovi.`;

  const ocrDirective = hasOcrText ? `

## TESTO OCR DISPONIBILE
Ti verrà fornito il TESTO OCR COMPLETO dei documenti originali. Usa questo testo come FONTE PRIMARIA per trascrivere fedelmente il contenuto dei documenti.
- Il testo tra virgolette ("...") DEVE provenire dal testo OCR originale
- Gli eventi estratti servono come INDICE cronologico e struttura; il CONTENUTO dettagliato va trascritto dal testo OCR
- Non parafrasare — riproduci fedelmente il linguaggio dei documenti originali
- Per tabelle di esami, riporta i valori ESATTI come appaiono nel testo OCR` : '';

  return `${CONSTITUTIONAL_PREAMBLE}

---

Sei un sistema di organizzazione documentale medico-legale. Il tuo compito è strutturare e presentare FATTI dalla documentazione clinica, NON esprimere opinioni.

## IL TUO COMPITO
Genera un REPORT MEDICO-LEGALE completo e dettagliato, con struttura da perizia depositabile in tribunale, basato sugli eventi clinici estratti dalla documentazione${hasOcrText ? ' e sul testo OCR originale dei documenti' : ''}. Il report deve includere sia la riproduzione fedele della documentazione esaminata (in atti e sanitaria) sia la presentazione organizzata degli elementi rilevanti per la valutazione medico-legale.
IMPORTANTE: Tu presenti i FATTI. Il medico legale formulerà autonomamente le proprie valutazioni e conclusioni professionali.${ocrDirective}

${roleDirective}

${caseTypeDirective}

${periziaStructure}

## CRITERI PER LA VALUTAZIONE DEL NESSO CAUSALE

${causalNexus}

## FORMATO DOCUMENTAZIONE SANITARIA

Per ogni episodio nella sezione DATI DELLA DOCUMENTAZIONE SANITARIA usa il FORMATO CITAZIONE OBBLIGATORIO:

**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..."

- Intestazione in GRASSETTO con tipo documento, autore/struttura, data
- Contenuto del documento tra VIRGOLETTE ("..."), riprodotto fedelmente
- La categoria della fonte tra parentesi (A), (B), (C) o (D) alla fine della citazione

${CHRONOLOGY_SOURCES_GUIDE}

${ABSOLUTE_RULES}${fewShotSection}`;
}

/**
 * Build the user prompt with all case data.
 */
export function buildSynthesisUserPrompt(params: {
  caseType: CaseType;
  patientInitials: string | null;
  caseRole: CaseRole;
  events: ConsolidatedEvent[];
  anomalies: DetectedAnomaly[];
  missingDocuments: MissingDocument[];
  calculations?: MedicoLegalCalculation[];
  caseTypes?: CaseType[];
  periziaMetadata?: PeriziaMetadata;
  imageAnalysis?: Array<{ pageNumber: number; imageType: string; description: string; confidence: number }>;
  documentsOcrText?: DocumentOcrContext[];
  documentSummaries?: DocumentSummary[];
}): string {
  const { caseType, patientInitials, caseRole, events, anomalies, missingDocuments, calculations, caseTypes, periziaMetadata, imageAnalysis, documentsOcrText, documentSummaries } = params;

  const eventsText = formatEventsForPrompt(events);
  const anomaliesText = formatAnomaliesForPrompt(anomalies);
  const missingDocsText = formatMissingDocsForPrompt(missingDocuments);
  const calculationsText = formatCalculationsForPrompt(calculations);

  const roleLabel = caseRole === 'ctu' ? 'CTU - Consulente Tecnico d\'Ufficio'
    : caseRole === 'ctp' ? 'CTP - Consulente Tecnico di Parte'
    : 'Perito Stragiudiziale';

  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const caseTypeLabelsText = effectiveTypes.map(t => CASE_TYPE_LABELS[t]).join(' + ');

  // Build perizia metadata section
  const periziaSection = formatPeriziaMetadataForPrompt(periziaMetadata);

  // Use document summaries when available (map-reduce mode for large cases),
  // otherwise use OCR text directly
  const documentContextSection = documentSummaries && documentSummaries.length > 0
    ? formatDocumentSummariesForPrompt(documentSummaries)
    : formatDocumentsOcrForPrompt(documentsOcrText);
  const hasOcr = documentsOcrText && documentsOcrText.length > 0;
  const hasSummaries = documentSummaries && documentSummaries.length > 0;

  return `Genera il report medico-legale completo per il seguente caso.

TIPO CASO: ${caseTypeLabelsText}
RUOLO PERITO: ${roleLabel}
PAZIENTE: ${patientInitials || 'N/D'}
NUMERO EVENTI DOCUMENTATI: ${events.length}
PERIODO DOCUMENTATO: ${events.length > 0 ? `${formatDate(events[0].eventDate)} — ${formatDate(events[events.length - 1].eventDate)}` : 'N/D'}
${periziaSection}
## TUTTI GLI EVENTI CLINICI IN ORDINE CRONOLOGICO

${eventsText}

## ANOMALIE RILEVATE DAL SISTEMA

${anomaliesText}

REGOLA SULLE ANOMALIE: per ogni anomalia con "NOTA DEL PERITO", integra il contenuto della nota nella narrazione del report come fatto contestuale (es. "Come precisato dal perito, ..."). La nota del perito è VINCOLANTE e prevale sull'analisi documentale automatica.

## DOCUMENTAZIONE MANCANTE

${missingDocsText}
${calculationsText}
${formatImageAnalysisForPrompt(imageAnalysis)}${documentContextSection}---

Genera il report completo con TUTTE le sezioni specificate nelle istruzioni di sistema.
IMPORTANTE: La sezione DATI DELLA DOCUMENTAZIONE SANITARIA deve riportare OGNI evento fornito sopra, FEDELMENTE — completezza dei FATTI non negoziabile. La PROSA tra le citazioni deve essere densa, senza ripetizioni cosmetiche né perifrasi. Scrivi in prosa narrativa discorsiva, NON elenchi puntati per la narrazione clinica.${hasOcr && !hasSummaries ? '\nIMPORTANTE: Il testo OCR fornito è la FONTE PRIMARIA. Trascrivi FEDELMENTE il contenuto dei documenti originali usando il testo OCR. Il testo tra virgolette deve corrispondere esattamente al testo OCR.' : ''}${hasSummaries ? '\nIMPORTANTE: I riassunti AI dei documenti forniscono una visione completa del caso. Integra le informazioni dai riassunti con gli eventi strutturati senza omettere fatti rilevanti.' : ''}
IMPORTANTE: Il report deve essere OGGETTIVO e FATTUALE — presenta fatti documentati, NON opinioni. Il medico legale (${roleLabel}) formulerà autonomamente le proprie valutazioni professionali.
IMPORTANTE: Se sono disponibili immagini diagnostiche, inseriscile SOLO INLINE nella documentazione sanitaria nel punto cronologico appropriato. NON creare una sezione ALLEGATI ICONOGRAFICI separata.`;
}

// ── Split-mode prompts (for large cases >40K chars) ──

/**
 * System prompt for chronology-only generation (split mode).
 */
export function buildChronologySystemPrompt(params?: { hasOcrText?: boolean }): string {
  const hasOcr = params?.hasOcrText ?? false;
  const ocrDirective = hasOcr ? `

TESTO OCR DISPONIBILE: Ti verrà fornito il testo OCR completo dei documenti originali. Usa questo come FONTE PRIMARIA per la trascrizione.
- Il testo tra virgolette ("...") DEVE provenire dal testo OCR
- Gli eventi estratti servono come INDICE cronologico; il CONTENUTO dettagliato va trascritto dall'OCR
- Per documenti non sanitari (memorie, ricorsi, certificati), includi sezioni aggiuntive PRIMA della documentazione sanitaria:
  - "## DATI DELLA DOCUMENTAZIONE IN ATTI" per documenti non sanitari
  - "## PREMESSE" per memorie difensive e ricorsi (se presenti)
- Per spese mediche, aggiungi "## SPESE MEDICHE ESIBITE" con tabella DATA | VOCE | IMPORTO
- Per perizie precedenti, aggiungi "## PRECEDENTI PARERI TECNICI" con trascrizione fedele
- Testo illeggibile → "[non leggibile]"` : '';

  return `${CONSTITUTIONAL_PREAMBLE}

---

Sei un medico legale esperto incaricato di redigere ${hasOcr ? 'le sezioni documentali' : 'la sezione "DATI DELLA DOCUMENTAZIONE SANITARIA"'} di un report peritale.

COMPITO: Genera ESCLUSIVAMENTE la riproduzione dettagliata e fedele della documentazione${hasOcr ? ' (in atti, sanitaria, spese mediche, pareri tecnici)' : ' sanitaria'} in ordine cronologico. NON generare riassunti, analisi, o elementi di rilievo.${ocrDirective}

STILE: Usa il FORMATO CITAZIONE OBBLIGATORIO per ogni documento/episodio:

**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele riprodotto dal documento originale ..."

Esempio completo:
**Cartella clinica, P.O. San Giovanni, in data 30.09.2021:** "Paziente giunto in PS per trauma contusivo al ginocchio dx. All'ingresso PA 130/80, FC 88 bpm, SpO2 98%. Esame obiettivo: tumefazione e limitazione funzionale del ginocchio dx. Esame radiografico: frattura composta del III medio di femore dx." (A)

**Verbale operatorio, Dr. Bianchi, in data 01.10.2021:** "Intervento di riduzione e osteosintesi con placca e viti. Durata intervento: 95 min. Decorso intraoperatorio regolare." (A)

**Esami ematochimici, Laboratorio Analisi, in data 02.10.2021:**

| Analita | Valore | Unità | Riferimento |
|---------|--------|-------|-------------|
| Emoglobina | 9.7 | g/dL | 13.0-17.0 |
| Globuli bianchi | 12.500 | /μL | 4.000-10.000 |
| PCR | 8.4 | mg/dL | <0.5 |
(D)

**Lettera di dimissione, P.O. San Giovanni, in data 05.10.2021:** "Decorso post-operatorio regolare. Si prescrive terapia con enoxaparina 4000 UI/die e FKT." (A)

Per i diari clinici usa il formato bullet con raggruppamento dei periodi stabili:
• DD.MM.YYYY: "... contenuto del giorno con variazioni cliniche ..."
• Dal DD.MM al DD.MM.YYYY: "decorso regolare, parametri stabili, terapia in corso" (per periodi clinicamente stabili — NON duplicare giorni identici)

FORMATO: Indica la categoria della fonte (A), (B), (C) o (D) tra parentesi alla fine di ogni citazione.

${CHRONOLOGY_SOURCES_GUIDE}

REGOLE:
- Ordine rigorosamente cronologico
- Il contenuto deve essere FEDELE alla documentazione — virgolette dirette dove indicato
- Includi TUTTI gli eventi forniti, nessuno deve essere escluso (completezza dei fatti non negoziabile)
- Intestazione GRASSETTO con tipo documento, autore/struttura e data, seguita da contenuto tra VIRGOLETTE
- Tabelle esami lab: riportare TUTTI i valori, una tabella PER DATA/PRELIEVO
- Verbali operatori: diagnosi pre/post + tecnica chirurgica + complicanze + esito (sintetizza narrazioni accessorie come anestesia routine, preparazione campo)
- Referti radiologici/strumentali: tecnica + reperti + conclusione
- Se la data è incerta, indica la migliore approssimazione disponibile
- DIVIETO DI INVENZIONE: NON aggiungere fatti, diagnosi, date, nomi o dettagli clinici non presenti negli eventi forniti
- OGGETTIVITÀ: riportare ESCLUSIVAMENTE i fatti documentati, senza commenti, interpretazioni o deduzioni personali
- Gli eventi di tipo "spesa_medica", "documento_amministrativo" e "certificato" vanno inclusi nella posizione temporale corretta

STRUTTURA OUTPUT (rispetta ESATTAMENTE questa struttura, inclusi i marker HTML):

<!-- SECTION:CRONOLOGIA -->
${hasOcr ? `## DATI DELLA DOCUMENTAZIONE IN ATTI
(Solo se presenti documenti non sanitari: ricorsi, memorie, certificati, atti)

## PREMESSE
(Solo se presenti memorie difensive o ricorsi)

` : ''}## DATI DELLA DOCUMENTAZIONE SANITARIA

**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..." (X)

**Tipo documento, autore/struttura, in data DD.MM.YYYY:** "... contenuto fedele ..." (X)
${hasOcr ? `
## SPESE MEDICHE ESIBITE
(Solo se presenti documenti di spese mediche — tabella DATA | VOCE | IMPORTO)

## PRECEDENTI PARERI TECNICI
(Solo se presenti perizie precedenti CTP/CTU)
` : ''}<!-- END:CRONOLOGIA -->`;
}

/**
 * User prompt for chronology-only generation (split mode).
 * Accepts either positional args (legacy) or object params (new).
 */
export function buildChronologyUserPrompt(
  paramsOrEvents: string | {
    eventsFormatted: string;
    caseTypeLabel: string;
    expertRole: string;
    patientInitials?: string;
    documentsOcrText?: DocumentOcrContext[];
    documentSummaries?: DocumentSummary[];
  },
  caseTypeLabel?: string,
  expertRole?: string,
  patientInitials?: string,
): string {
  // Support both legacy positional args and new object params
  const params = typeof paramsOrEvents === 'string'
    ? { eventsFormatted: paramsOrEvents, caseTypeLabel: caseTypeLabel!, expertRole: expertRole!, patientInitials, documentsOcrText: undefined, documentSummaries: undefined }
    : paramsOrEvents;

  let prompt = `TIPO CASO: ${params.caseTypeLabel}\n`;
  prompt += `RUOLO PERITO: ${params.expertRole}\n`;
  if (params.patientInitials) prompt += `PAZIENTE: ${params.patientInitials}\n`;
  prompt += '\nEVENTI ESTRATTI (indice cronologico):\n\n';
  prompt += params.eventsFormatted;

  // Use document summaries when available (map-reduce mode for large cases),
  // otherwise use OCR text directly
  const hasSummaries = params.documentSummaries && params.documentSummaries.length > 0;
  if (hasSummaries) {
    const summariesSection = formatDocumentSummariesForPrompt(params.documentSummaries);
    if (summariesSection) {
      prompt += '\n\n' + summariesSection;
    }
  } else {
    const ocrSection = formatDocumentsOcrForPrompt(params.documentsOcrText);
    if (ocrSection) {
      prompt += '\n\n' + ocrSection;
    }
  }

  prompt += '\n\nGenera le sezioni documentali complete, includendo TUTTI gli eventi elencati sopra in forma dettagliata e fedele, nel formato specificato nelle istruzioni di sistema.';
  if (hasSummaries) {
    prompt += '\nIMPORTANTE: Usa i RIASSUNTI AI come fonte aggiuntiva per i dettagli clinici. Integra le informazioni dei riassunti con gli eventi strutturati per una cronologia completa.';
  } else if (params.documentsOcrText && params.documentsOcrText.length > 0) {
    prompt += '\nIMPORTANTE: Usa il TESTO OCR come fonte primaria per la trascrizione. Il testo tra virgolette DEVE corrispondere al testo OCR originale. Gli eventi servono come indice cronologico.';
  }
  prompt += ' Ricorda di includere i marker <!-- SECTION:CRONOLOGIA --> e <!-- END:CRONOLOGIA -->.';
  return prompt;
}

/**
 * System prompt for summary + analysis generation (split mode).
 * Now role-adaptive and case-type-aware.
 */
export function buildSummarySystemPrompt(params: {
  caseType: CaseType;
  caseRole: CaseRole;
  caseTypes?: CaseType[];
  periziaMetadata?: PeriziaMetadata;
}): string {
  const { caseType, caseRole, caseTypes, periziaMetadata } = params;
  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const roleDirective = formatRoleDirectiveForPrompt(caseRole);
  const causalNexus = formatCausalNexusForPrompt();

  // Get non-chronology sections for split mode (multi-type aware)
  const knowledge = effectiveTypes.length > 1
    ? getCombinedCaseTypeKnowledge(effectiveTypes)
    : getCaseTypeKnowledge(caseType);
  const nonChronoSections = knowledge.reportSections
    .filter((s) => s.id !== 'cronologia')
    .map((s) => {
      const wordInfo = s.wordRange.max > 0 ? ` (${s.wordRange.min}-${s.wordRange.max} parole)` : '';
      return `- ${s.title.toUpperCase()}${wordInfo}: ${s.description}`;
    })
    .join('\n');

  const goldenExample = getGoldenPerizia(caseType, caseRole);
  const fewShotSection = goldenExample
    ? `\n\n## ESEMPIO DI RIFERIMENTO\n\nIl seguente è un estratto di una perizia di riferimento per questo tipo di caso e ruolo. Usa tono, struttura e livello di dettaglio simili (esclusa la cronologia, che è già stata generata).\n\n---\n${goldenExample}\n---\n\nIMPORTANTE: L'esempio sopra è solo un RIFERIMENTO per tono e struttura. NON copiare il contenuto — genera le sezioni basandoti ESCLUSIVAMENTE sulla cronologia e sugli eventi forniti.`
    : '';

  return `${CONSTITUTIONAL_PREAMBLE}

---

Sei un medico legale esperto incaricato di redigere le sezioni NON cronologiche di un report peritale.
Ti verrà fornita la cronologia già compilata come riferimento. NON rigenerare la cronologia.

${roleDirective}

## SEZIONI DA GENERARE

${nonChronoSections}

## CRITERI PER LA VALUTAZIONE DEL NESSO CAUSALE

${causalNexus}

## DIVIETO ASSOLUTO DI INVENZIONE (ANTI-HALLUCINATION)
- Basa le sezioni ESCLUSIVAMENTE sulla cronologia e sugli eventi forniti. NON aggiungere fatti, diagnosi, nomi di medici, strutture o date non presenti.
- NON inventare referenze bibliografiche o citazioni di studi scientifici. Cita SOLO linee guida fornite nella sezione RAG o framework valutativi indicati nelle istruzioni.
- Se un dato manca dalla documentazione, segnalalo come lacuna — NON inventarlo.

## OGGETTIVITÀ E IMPARZIALITÀ
- OGNI affermazione deve essere OGGETTIVAMENTE VERIFICABILE dalla documentazione. NON esprimere deduzioni o conclusioni non supportate da fatti documentati.
- Ancorare ogni valutazione a evidenza documentale specifica. Usare formulazioni oggettive: "dalla documentazione risulta che...", "come documentato nella cronologia..."
- Il report è materiale legale: ogni parola deve poter essere difesa con riferimento a evidenze documentali concrete.

## EVENTI NON CLINICI
- Se nella cronologia ci sono eventi di tipo "spesa_medica", genera una sezione "## SPESE MEDICHE DOCUMENTATE" con data, importo, prestazione, struttura e valutazione di congruità.
- Se ci sono eventi "documento_amministrativo" o "certificato", integrali nelle sezioni pertinenti.

STRUTTURA OUTPUT (rispetta ESATTAMENTE questa struttura, inclusi i marker HTML):

<!-- SECTION:RIASSUNTO -->
## RIASSUNTO DEL CASO
[testo]
<!-- END:RIASSUNTO -->

<!-- SECTION:ELEMENTI -->
## ELEMENTI PER LA VALUTAZIONE MEDICO-LEGALE
[testo]
${periziaMetadata?.quesiti?.length ? `
## ELEMENTI PER LA RISPOSTA AI QUESITI
Per CIASCUN quesito del Giudice, NUMERATO corrispondentemente, presenta:
- I FATTI DOCUMENTALI pertinenti con riferimenti SPECIFICI alla cronologia fornita
- Gli ELEMENTI a supporto e contrari emersi dalla documentazione
- Le LACUNE DOCUMENTALI rilevanti per quel quesito
NON formulare risposte conclusive — presentare gli elementi affinché il medico legale possa rispondere autonomamente.
` : ''}<!-- END:ELEMENTI -->${fewShotSection}`;
}

/**
 * User prompt for summary + analysis generation (split mode).
 */
export function buildSummaryUserPrompt(params: {
  chronology: string;
  caseTypeLabel: string;
  expertRole: string;
  patientInitials?: string;
  anomalies?: string;
  missingDocs?: string;
  calculations?: string;
  periziaMetadata?: PeriziaMetadata;
}): string {
  const { chronology, caseTypeLabel, expertRole, patientInitials, anomalies, missingDocs, calculations, periziaMetadata } = params;

  let prompt = `TIPO CASO: ${caseTypeLabel}\n`;
  prompt += `RUOLO PERITO: ${expertRole}\n`;
  if (patientInitials) prompt += `PAZIENTE: ${patientInitials}\n`;

  const periziaSection = formatPeriziaMetadataForPrompt(periziaMetadata);
  if (periziaSection) prompt += periziaSection;

  prompt += `\n## CRONOLOGIA DI RIFERIMENTO (già compilata):\n${chronology}\n`;

  if (anomalies && anomalies.trim().length > 0) {
    prompt += `\n## ANOMALIE RILEVATE DAL SISTEMA:\n${anomalies}\n`;
  }

  if (missingDocs && missingDocs.trim().length > 0) {
    prompt += `\n## DOCUMENTAZIONE MANCANTE:\n${missingDocs}\n`;
  }

  if (calculations && calculations.trim().length > 0) {
    prompt += `\n${calculations}\n`;
  }

  prompt += '\nBasandoti sulla cronologia e sulle anomalie sopra indicate, genera TUTTE le sezioni richieste nel formato specificato. Ricorda di includere i marker <!-- SECTION:xxx --> e <!-- END:xxx -->.';
  prompt += `\nIMPORTANTE: Il report deve essere OGGETTIVO e FATTUALE — presenta fatti documentati, NON opinioni. Il medico legale (${expertRole}) formulerà autonomamente le proprie valutazioni.`;

  // Explicit quesiti mapping instructions for split mode
  if (periziaMetadata?.quesiti && periziaMetadata.quesiti.length > 0) {
    prompt += '\n\nIMPORTANTE — ELEMENTI PER LA RISPOSTA AI QUESITI:';
    prompt += '\nI quesiti del Giudice sono elencati sopra nei DATI PERIZIA FORMALE.';
    prompt += '\nPer CIASCUN quesito, identifica nella cronologia gli eventi pertinenti e presenta:';
    prompt += '\n1. I FATTI documentali pertinenti (con date precise e riferimenti)';
    prompt += '\n2. Gli ELEMENTI a supporto e contrari dalla documentazione';
    prompt += '\n3. Le LACUNE documentali rilevanti per quel quesito';
    prompt += '\nNON formulare risposte conclusive — il medico legale risponderà autonomamente.';
    prompt += '\nLa sezione ELEMENTI PER LA RISPOSTA AI QUESITI deve essere DENTRO il blocco <!-- SECTION:ELEMENTI --> ... <!-- END:ELEMENTI -->.';
  }

  return prompt;
}

// ── Formatting helpers ──

export function formatEventsForPrompt(events: ConsolidatedEvent[]): string {
  return events.map((e) => {
    const date = formatDate(e.eventDate);
    // RELEVANCE FILTER (deterministico): gli eventi T3 di routine (esami di
    // laboratorio, prescrizioni, admin) sono resi in forma COMPATTA — presenti ma
    // non verbosi, per non annegare il prompt. T1/T2 (diagnosi, interventi,
    // referti, visite, imaging) mantengono il dettaglio completo. Nessun evento è
    // nascosto. Il tier è ricalcolato deterministicamente dai campi dell'evento.
    const tier = e.relevanceTier ?? computeRelevanceTier({
      eventType: e.eventType,
      diagnosis: e.diagnosis,
      sourceType: e.sourceType,
      discrepancyNote: e.discrepancyNote,
    });
    if (tier === 'T3') {
      return `${e.orderNumber}. ${date} | ${e.eventType.toUpperCase()} | ${e.title}`;
    }
    const precision = e.datePrecision !== 'giorno' ? ` [data ${e.datePrecision}]` : '';
    const sourceLabel = SOURCE_TYPE_LABELS[e.sourceType] ?? e.sourceType;
    const reliabilityScore = getSourceReliabilityScore(e.sourceType);
    const reliabilityLabel = getReliabilityLabel(reliabilityScore);
    const diagnosis = e.diagnosis ? `\n   Diagnosi: ${e.diagnosis}` : '';
    const doctor = e.doctor ? `\n   Medico: ${e.doctor}` : '';
    const facility = e.facility ? `\n   Struttura: ${e.facility}` : '';
    const confidenceQualifier = formatConfidenceQualifier(e.confidence);
    const discrepancy = e.discrepancyNote && e.discrepancyNote.includes('⚠')
      ? `\n   ${e.discrepancyNote}`
      : '';
    const verbatim = e.sourceText && e.sourceText.trim().length > 0
      ? `\n   CITAZIONE TESTUALE (riproduci virgolettata, NON parafrasare): "${e.sourceText.trim()}"`
      : '';
    return `${e.orderNumber}. ${date}${precision} | FONTE: ${sourceLabel} [${reliabilityLabel} ${reliabilityScore}/100] | TIPO: ${e.eventType.toUpperCase()}${confidenceQualifier}
   TITOLO: ${e.title}
   DESCRIZIONE: ${e.description}${diagnosis}${doctor}${facility}${verbatim}${discrepancy}`;
  }).join('\n\n');
}

/**
 * Format a confidence qualifier for events with low OCR confidence.
 * Signals to the LLM that low-confidence events should be treated cautiously.
 */
function formatConfidenceQualifier(confidence: number): string {
  if (confidence < 50) {
    return ' | ⚠ BASSA AFFIDABILITÀ OCR — verificare fonte';
  }
  if (confidence < 70) {
    return ' | [Affidabilità OCR media]';
  }
  return '';
}

export function formatAnomaliesForPrompt(anomalies: DetectedAnomaly[]): string {
  if (anomalies.length === 0) return 'Nessuna anomalia rilevata.';
  return anomalies.map((a) => {
    const involvedDates = a.involvedEvents.map((e) => `${formatDate(e.date)} - ${e.title}`).join(', ');
    // Include perito's confirmation note when present — promised by UI label "sarà inclusa nel report".
    // The note carries clinical/legal context the perito wants integrated (e.g. "il trattamento risulta
    // documentato in relazione successiva", "la complicanza era preesistente"). The LLM must respect it.
    const peritoLine = a.resolutionNote && a.resolutionNote.trim().length > 0
      ? `\n  NOTA DEL PERITO (vincolante — integra nel testo del report): "${a.resolutionNote.trim()}"`
      : '';
    return `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description} (Eventi: ${involvedDates})${peritoLine}\n  ANALISI DOCUMENTALE: indica la conseguenza clinica DOCUMENTATA e la quantificazione del danno basata su criteri tabellari e evidenze in atti.`;
  }).join('\n');
}

export function formatMissingDocsForPrompt(missingDocuments: MissingDocument[]): string {
  if (missingDocuments.length === 0) return 'Nessuna documentazione mancante rilevata.';
  return missingDocuments.map((d) => `- ${d.documentName}: ${d.reason}`).join('\n');
}

export function formatCalculationsForPrompt(calculations?: MedicoLegalCalculation[]): string {
  if (!calculations || calculations.length === 0) return '';
  const lines = calculations.map((c) => {
    const dateRange = c.startDate && c.endDate ? ` (${formatDate(c.startDate)} — ${formatDate(c.endDate)})` : '';
    const tableRef = c.tableReference ? `\n  Rif. tabellare: ${c.tableReference}` : '';
    return `- ${c.label}: ${c.value}${dateRange}\n  ${c.notes}${tableRef}`;
  });
  // A2 (Lavini): render a ready-made graduated ITT/ITP table so the report
  // contains a proper table (the perito asked for a table, not only prose).
  const ittItpSegments = calculationsToITTITPSegments(calculations);
  const ittItpTable = formatITTITPTable(ittItpSegments);
  const ittItpBlock = ittItpTable
    ? `\n\n### TABELLA INVALIDITÀ TEMPORANEA (ITT/ITP graduata)
Riproduci questa tabella TESTUALMENTE (in formato Markdown) nella sezione che tratta il danno biologico temporaneo (Considerazioni Medico-Legali / Epicrisi). Sono valori PROPOSTI: il perito li verifica e corregge.

${ittItpTable}`
    : '';

  return `\n## PERIODI MEDICO-LEGALI CALCOLATI (proposti, il perito deve verificare)

${lines.join('\n')}${ittItpBlock}

### ISTRUZIONI PER INTEGRAZIONE NEL REPORT
Nella sezione "Valutazione del danno biologico" e nelle "Conclusioni", INTEGRA questi dati:
- INCLUDI la tabella ITT/ITP graduata qui sopra (se presente) in formato Markdown, e accompagnala con una sintesi narrativa
- Riporta i periodi di ITT e ITP con date precise e durata in giorni nel testo delle conclusioni
- Indica i criteri tabellari utilizzati (es. Tabella Unica Nazionale DPR 12/2025, Tabelle Milano 2024)
- Nella conclusione, sintetizza: "I periodi di invalidità temporanea totale ammontano a X giorni (dal DD.MM.YYYY al DD.MM.YYYY), mentre l'invalidità temporanea parziale è quantificata in Y giorni..."
- NON limitarti a elencare i calcoli — integra i dati come parte dell'argomentazione medico-legale
- Se i calcoli includono riferimenti tabellari, citali esplicitamente nella valutazione del danno`;
}

export function formatPeriziaMetadataForPrompt(periziaMetadata?: PeriziaMetadata): string {
  if (!periziaMetadata) return '';

  const lines: string[] = [];

  // Dati identificativi del periziando inseriti dal perito — AUTORITATIVI per
  // l'intestazione. Senza questi il generatore dell'header estraeva il nome solo
  // dai documenti, ignorando quello digitato nel form (dato che "spariva").
  if (periziaMetadata.patientFullName) lines.push(`PAZIENTE (nome e cognome): ${periziaMetadata.patientFullName}`);
  if (periziaMetadata.patientDateOfBirth) lines.push(`PAZIENTE — data di nascita: ${periziaMetadata.patientDateOfBirth}`);
  if (periziaMetadata.patientAddress) lines.push(`PAZIENTE — residenza: ${periziaMetadata.patientAddress}`);
  if (periziaMetadata.patientFiscalCode) lines.push(`PAZIENTE — codice fiscale: ${periziaMetadata.patientFiscalCode}`);
  if (periziaMetadata.patientPhone) lines.push(`PAZIENTE — telefono: ${periziaMetadata.patientPhone}`);

  if (periziaMetadata.tribunale) lines.push(`TRIBUNALE: ${periziaMetadata.tribunale}`);
  if (periziaMetadata.sezione) lines.push(`SEZIONE: ${periziaMetadata.sezione}`);
  if (periziaMetadata.rgNumber) lines.push(`N. RG: ${periziaMetadata.rgNumber}`);
  if (periziaMetadata.judgeName) lines.push(`GIUDICE: ${periziaMetadata.judgeName}`);
  if (periziaMetadata.ctuName) lines.push(`CTU: ${periziaMetadata.ctuName}`);
  if (periziaMetadata.ctuTitle) lines.push(`QUALIFICA CTU: ${periziaMetadata.ctuTitle}`);
  if (periziaMetadata.ctpRicorrente) lines.push(`CTP RICORRENTE: ${periziaMetadata.ctpRicorrente}`);
  if (periziaMetadata.ctpResistente) lines.push(`CTP RESISTENTE: ${periziaMetadata.ctpResistente}`);
  if (periziaMetadata.parteRicorrente) lines.push(`PARTE RICORRENTE: ${periziaMetadata.parteRicorrente}`);
  if (periziaMetadata.parteResistente) lines.push(`PARTE RESISTENTE: ${periziaMetadata.parteResistente}`);
  if (periziaMetadata.dataIncarico) lines.push(`DATA INCARICO: ${periziaMetadata.dataIncarico}`);
  if (periziaMetadata.dataOperazioni) lines.push(`DATA OPERAZIONI: ${periziaMetadata.dataOperazioni}`);
  if (periziaMetadata.dataDeposito) lines.push(`TERMINE DEPOSITO: ${periziaMetadata.dataDeposito}`);
  if (periziaMetadata.fondoSpese) lines.push(`FONDO SPESE: ${periziaMetadata.fondoSpese}`);

  if (periziaMetadata.quesiti && periziaMetadata.quesiti.length > 0) {
    lines.push('');
    lines.push('QUESITI DEL GIUDICE:');
    periziaMetadata.quesiti.forEach((q, i) => {
      lines.push(`${i + 1}. ${q}`);
    });
  }

  if (periziaMetadata.esameObiettivo) {
    lines.push('');
    lines.push('ESAME OBIETTIVO:');
    lines.push(periziaMetadata.esameObiettivo);
  }

  if (periziaMetadata.speseMediche) {
    lines.push('');
    lines.push('SPESE MEDICHE:');
    lines.push(periziaMetadata.speseMediche);
  }

  if (lines.length === 0) return '';

  return `\n## DATI PERIZIA FORMALE\n\n${lines.join('\n')}\n`;
}

export function formatImageAnalysisForPrompt(
  imageAnalysis?: Array<{ pageNumber: number; imageType: string; description: string; confidence: number; storagePath?: string }>,
): string {
  if (!imageAnalysis || imageAnalysis.length === 0) return '';
  const filtered = filterMedicalImages(imageAnalysis);
  if (filtered.length === 0) return '';
  const lines = filtered.map((img, index) => {
    const figNum = index + 1;
    const pathRef = img.storagePath
      ? `\n  Sintassi per includere: ![Fig. ${figNum} — ${img.imageType}](ocr-image:${img.storagePath})`
      : '';
    return `- Fig. ${figNum}: Pagina ${img.pageNumber} (${img.imageType}): ${img.description}${pathRef}`;
  });
  return `\n## IMMAGINI DIAGNOSTICHE DISPONIBILI

Le seguenti immagini sono state estratte dalla documentazione e analizzate automaticamente.
Sintassi per includere: ![Fig. N — Didascalia](ocr-image:percorso)

REGOLE PER LE IMMAGINI:
- Includi le immagini ESCLUSIVAMENTE INLINE nella documentazione sanitaria, subito dopo la citazione del documento/referto pertinente. Le foto cliniche vanno in ESAME OBIETTIVO.
- NON creare una sezione "ALLEGATI ICONOGRAFICI" separata.
- Didascalia formale: "Fig. N — Tipo esame, distretto anatomico, data"
- Tra immagini consecutive, inserire un breve commento descrittivo che le colleghi al contesto clinico.

${lines.join('\n')}

`;
}

// ── Image filtering ──

const ADMIN_IMAGE_KEYWORDS = [
  'logo', 'intestazione', 'timbro', 'firma', 'header', 'footer',
  'watermark', 'stemma', 'sigillo', 'letterhead', 'bollo',
];

/**
 * Filter out non-medical images (logos, stamps, headers) keeping only
 * diagnostic/clinical images (RX, TAC, RM, ecografia, endoscopia, foto cliniche).
 */
export function filterMedicalImages<T extends { imageType: string; description: string }>(
  images: T[],
): T[] {
  return images.filter((img) => {
    const typeLower = img.imageType.toLowerCase();
    // Exclude explicitly non-medical types
    if (typeLower === 'altro') return false;
    // Exclude images whose description contains admin keywords
    const descLower = img.description.toLowerCase();
    if (ADMIN_IMAGE_KEYWORDS.some((kw) => descLower.includes(kw))) return false;
    return true;
  });
}

// ── OCR text formatting for faithful transcription ──

type DocumentCategory = 'sanitario' | 'non_sanitario' | 'spese' | 'perizie' | 'memorie';

function categorizeDocumentType(docType: string): DocumentCategory {
  switch (docType) {
    case 'memoria_difensiva': return 'memorie';
    case 'spese_mediche': return 'spese';
    case 'perizia_precedente':
    case 'perizia_ctp':
    case 'perizia_ctu': return 'perizie';
    case 'certificato': return 'non_sanitario';
    default: return 'sanitario';
  }
}

function formatSingleDocOcr(doc: DocumentOcrContext): string {
  let text = `#### ${doc.fileName} (${doc.documentType})\n`;
  for (const page of doc.pages) {
    text += `--- Pagina ${page.pageNumber} ---\n${page.ocrText}\n\n`;
  }
  return text + '\n';
}

/**
 * Maximum OCR chars to include in synthesis prompt.
 * ~200K tokens budget for OCR, leaving ~60K for system prompt + events + output.
 * Ratio ~0.55 token/char for Italian medical text → 200K / 0.55 ≈ 360K chars.
 */
const MAX_OCR_CHARS = 360_000;

/**
 * Truncate OCR documents proportionally to fit within a character budget.
 * Each document gets a budget proportional to its original size.
 * Pages are truncated from the end; if a single page exceeds budget, its text is cut.
 */
export function truncateOcrProportionally(
  docs: DocumentOcrContext[],
  maxChars: number,
): DocumentOcrContext[] {
  const totalChars = docs.reduce((sum, d) => sum + d.totalChars, 0);
  if (totalChars <= maxChars) return docs;

  const ratio = maxChars / totalChars;

  return docs.map((doc) => {
    const docBudget = Math.floor(doc.totalChars * ratio);
    let remaining = docBudget;
    const truncatedPages: Array<{ pageNumber: number; ocrText: string }> = [];

    for (const page of doc.pages) {
      if (remaining <= 0) break;

      if (page.ocrText.length <= remaining) {
        truncatedPages.push(page);
        remaining -= page.ocrText.length;
      } else {
        // Truncate this page's text to fit remaining budget
        const truncatedText = page.ocrText.slice(0, remaining)
          + `\n\n[... troncato, ${page.ocrText.length} chars originali ...]`;
        truncatedPages.push({ pageNumber: page.pageNumber, ocrText: truncatedText });
        remaining = 0;
      }
    }

    const omittedPages = doc.pages.length - truncatedPages.length;
    if (omittedPages > 0) {
      const lastPage = doc.pages[doc.pages.length - 1];
      truncatedPages.push({
        pageNumber: lastPage.pageNumber,
        ocrText: `[... ${omittedPages} pagine omesse per limiti di contesto, ${doc.totalChars - docBudget} chars non inclusi ...]`,
      });
    }

    const newTotalChars = truncatedPages.reduce((sum, p) => sum + p.ocrText.length, 0);
    return {
      ...doc,
      pages: truncatedPages,
      totalChars: newTotalChars,
    };
  });
}

/**
 * Format OCR text from all documents, organized by category for the LLM.
 * Returns empty string if no OCR text is available.
 * Applies proportional truncation if total OCR exceeds MAX_OCR_CHARS.
 */
export function formatDocumentsOcrForPrompt(docs?: DocumentOcrContext[]): string {
  if (!docs || docs.length === 0) return '';

  const totalChars = docs.reduce((sum, d) => sum + d.totalChars, 0);
  const effectiveDocs = totalChars > MAX_OCR_CHARS
    ? truncateOcrProportionally(docs, MAX_OCR_CHARS)
    : docs;
  const wasTruncated = totalChars > MAX_OCR_CHARS;

  const categorized = {
    memorie: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'memorie'),
    non_sanitario: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'non_sanitario'),
    sanitario: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'sanitario'),
    spese: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'spese'),
    perizie: effectiveDocs.filter((d) => categorizeDocumentType(d.documentType) === 'perizie'),
  };

  const effectiveChars = effectiveDocs.reduce((sum, d) => sum + d.totalChars, 0);
  let result = `\n## TESTO OCR DEI DOCUMENTI ORIGINALI (${docs.length} documenti, ${totalChars} caratteri)\n\n`;
  if (wasTruncated) {
    result += `**NOTA: Il testo OCR è stato troncato proporzionalmente da ${totalChars} a ~${effectiveChars} caratteri per rispettare i limiti di contesto. Ogni documento mantiene la proporzione originale.**\n\n`;
  }
  result += 'Di seguito il testo OCR dei documenti originali. Usa questo testo per TRASCRIVERE FEDELMENTE il contenuto nel report, nelle sezioni appropriate.\n\n';

  if (categorized.memorie.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "PREMESSE" (memorie, ricorsi)\n\n';
    for (const doc of categorized.memorie) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.non_sanitario.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "DATI DELLA DOCUMENTAZIONE IN ATTI" (non sanitari)\n\n';
    for (const doc of categorized.non_sanitario) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.sanitario.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "DATI DELLA DOCUMENTAZIONE SANITARIA"\n\n';
    for (const doc of categorized.sanitario) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.spese.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "SPESE MEDICHE ESIBITE"\n\n';
    for (const doc of categorized.spese) {
      result += formatSingleDocOcr(doc);
    }
  }

  if (categorized.perizie.length > 0) {
    result += '### DOCUMENTI PER SEZIONE "PRECEDENTI PARERI TECNICI"\n\n';
    for (const doc of categorized.perizie) {
      result += formatSingleDocOcr(doc);
    }
  }

  return result;
}

/**
 * Format per-document AI summaries for the synthesis prompt.
 * Used in map-reduce mode for large cases (>50 documents).
 * Replaces OCR text with more comprehensive coverage.
 */
export function formatDocumentSummariesForPrompt(summaries?: DocumentSummary[]): string {
  if (!summaries || summaries.length === 0) return '';

  const totalOriginalChars = summaries.reduce((sum, s) => sum + s.totalCharsOriginal, 0);

  let result = `\n## RIASSUNTI AI DEI DOCUMENTI ORIGINALI (${summaries.length} documenti, ${totalOriginalChars} caratteri originali)\n\n`;
  result += '**NOTA: I seguenti riassunti sono stati generati da AI a partire dal testo OCR completo di ciascun documento. Coprono il 100% dei documenti del caso. Usa questi riassunti come base per il report, integrandoli con gli eventi strutturati sopra.**\n\n';

  for (const summary of summaries) {
    result += `### ${summary.fileName} (${summary.documentType})\n`;
    result += `*${summary.totalCharsOriginal} caratteri OCR originali*\n\n`;
    result += `${summary.summary}\n\n`;
  }

  return result;
}

export {
  CASE_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
  MAX_OCR_CHARS,
  ABSOLUTE_RULES,
  CHRONOLOGY_SOURCES_GUIDE,
};
