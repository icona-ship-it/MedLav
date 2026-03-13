import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import { formatDate } from '@/lib/format';
import { formatRoleDirectiveForPrompt } from './role-prompts';
import { buildCaseTypeDirective } from './case-type-templates';
import { formatCausalNexusForPrompt, getCaseTypeKnowledge, getCombinedCaseTypeKnowledge, getGoldenPerizia } from '@/lib/domain-knowledge';
import { getSourceReliabilityScore, getReliabilityLabel } from '../consolidation/source-reliability';

const CASE_TYPE_LABELS: Record<CaseType, string> = {
  ortopedica: 'Malasanità Ortopedica',
  oncologica: 'Ritardo Diagnostico Oncologico',
  ostetrica: 'Errore Ostetrico',
  anestesiologica: 'Errore Anestesiologico',
  infezione_nosocomiale: 'Infezione Nosocomiale',
  errore_diagnostico: 'Errore Diagnostico',
  rc_auto: 'RC Auto — Lesioni da Sinistro Stradale',
  previdenziale: 'Invalidità Previdenziale',
  infortuni: 'Infortunio sul Lavoro / Malattia Professionale',
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
- Scrivi report COMPLETI e APPROFONDITI. Non sintetizzare eccessivamente le sezioni di analisi. Un report medico-legale professionale richiede argomentazioni sviluppate, motivazioni dettagliate e riferimenti puntuali alla documentazione. Privilegia la completezza alla brevità
- NON omettere NESSUN evento dalla documentazione sanitaria
- Riportare i dati FEDELMENTE come dal documento, non sintetizzare
- NON inventare dati non presenti negli eventi
- NON inventare MAI date. Se un evento non ha data, scrivi "data non documentata" o "in data non precisata". NON usare date fittizie come 01/01/1900 o simili
- Quando una data è segnata come "sconosciuta" o vuota, indicalo esplicitamente nel testo: "in data non risultante dalla documentazione in atti"
- Quando un evento ha data "Data non documentata", usa la formula "in data non risultante dalla documentazione in atti" o "in data imprecisata". NON scrivere MAI la stringa letterale "Data non documentata" nel report
- Linguaggio medico-legale formale
- Scrivi in italiano
- Usa intestazioni markdown (## per parti, ### per sotto-sezioni)
- La sezione DATI DELLA DOCUMENTAZIONE SANITARIA deve essere COMPLETA — ogni evento fornito deve comparire
- Scrivi SEMPRE in prosa discorsiva, MAI elenchi puntati per la narrazione clinica
- Lo stile deve essere quello di una perizia depositabile in tribunale: formale, giuridico, con periodi complessi e subordinate
- Quando citi linee guida cliniche, indica SEMPRE fonte e anno nel formato [Fonte, Anno]
- Quando due fonti discordano, privilegia la fonte con affidabilità maggiore (punteggio più alto)
- Quando citi un evento specifico dalla cronologia, includi il riferimento [Ev.N] dove N è il numero dell'evento (orderNumber). Questo è FONDAMENTALE per la tracciabilità in ambito giudiziario

## DIVIETO ASSOLUTO DI INVENZIONE (ANTI-HALLUCINATION)
- Basa il report ESCLUSIVAMENTE sugli eventi forniti nella sezione "TUTTI GLI EVENTI CLINICI IN ORDINE CRONOLOGICO". NON aggiungere fatti, diagnosi, nomi di medici, strutture o date che non compaiono negli eventi.
- NON inventare referenze bibliografiche o citazioni di studi scientifici. Cita SOLO linee guida effettivamente fornite nella sezione RAG o framework valutativi indicati nelle istruzioni di sistema.
- NON inventare nomi di pazienti, medici o strutture. Usa SOLO quelli presenti negli eventi. Se mancano, usa "[struttura non indicata]", "[medico non indicato]".
- NON aggiungere dettagli clinici dalla tua conoscenza medica. Se la documentazione non riporta un dato (es. dosaggio farmaco, parametro vitale), NON inventarlo.
- Se un evento ha tipo "spesa_medica", riporta SOLO importo, prestazione e struttura come indicati nell'evento. NON inventare tariffari o confronti non documentati.
- È preferibile un report più breve ma accurato rispetto a un report lungo con informazioni inventate.

## OGGETTIVITÀ E IMPARZIALITÀ (REGOLA FONDAMENTALE)
- OGNI affermazione del report deve essere OGGETTIVAMENTE VERIFICABILE dalla documentazione in atti
- NON esprimere deduzioni, supposizioni, pensieri personali o conclusioni non direttamente supportate dai documenti
- Quando si esprime un giudizio medico-legale, indicare SEMPRE l'evidenza documentale su cui si basa con riferimento [Ev.N]
- Distinguere CHIARAMENTE tra: (a) FATTI documentati e (b) VALUTAZIONI medico-legali. Le valutazioni devono essere SEMPRE motivate con riferimento a fatti documentati specifici
- NON usare espressioni soggettive come "si ritiene probabile", "appare evidente", "è verosimile che" senza immediatamente indicare l'evidenza documentale che supporta l'affermazione
- Usare formulazioni oggettive ancorate ai documenti: "dalla documentazione in atti risulta che...", "come documentato in [Ev.N]...", "l'esame della documentazione evidenzia..."
- Ogni conclusione deve essere la conseguenza logica DIRETTA di fatti documentati, MAI di inferenze o deduzioni personali non verificabili
- Il report è materiale legale: ogni parola deve poter essere difesa in sede giudiziaria con riferimento a evidenze documentali concrete

## EVENTI NON CLINICI NEL REPORT
- Se tra gli eventi ci sono voci di tipo "spesa_medica", dedicare una sezione "## SPESE MEDICHE DOCUMENTATE" che elenca ogni voce con: data, importo, prestazione, struttura, e una valutazione di congruità/necessità rispetto al quadro clinico documentato. Se il tipo caso NON è "analisi_spese_mediche" o "perizia_assicurativa", la sezione può essere sintetica.
- Se ci sono eventi di tipo "documento_amministrativo" o "certificato", menzionarli nella sezione più appropriata del report (cronologia per la data, documentazione esaminata per il contenuto). I certificati medici e INAIL vanno integrati nella narrazione clinica.`;

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
}): string {
  const { caseType, caseRole, caseTypes, periziaMetadata } = params;
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
Per ogni documento/episodio scrivi un PARAGRAFO NARRATIVO che riproduca fedelmente: diari medici, diari infermieristici, valori di laboratorio, verbali operatori, descrizioni degli interventi, lettere di dimissione, referti di esami strumentali, referti specialistici, prescrizioni terapeutiche.
Stile: prosa narrativa giorno per giorno, come nella sezione "DATI DOCUMENTAZIONE SANITARIA" di una perizia CTU depositata in tribunale.
Esempio: "In data 30.09.2021 il sig. Rossi si recava presso il Pronto Soccorso del P.O. ove veniva ricoverato. All'ingresso si rilevavano i seguenti parametri: PA 130/80, FC 88 bpm, SpO2 98%. L'esame radiografico evidenziava frattura composta del III medio di femore dx. In data 01.10.2021 il paziente veniva sottoposto ad intervento di riduzione e osteosintesi con placca e viti (verbale operatorio: durata 95 min, chirurgo Dr. Bianchi). Il decorso post-operatorio risultava regolare. Alla dimissione in data 05.10.2021 veniva prescritta terapia con enoxaparina 4000 UI/die e FKT. (A)"
Indica la categoria della fonte (A/B/C/D) tra parentesi alla fine di ogni paragrafo.
FONDAMENTALE: questa sezione deve essere la più lunga e dettagliata del report. Ogni evento fornito DEVE comparire. NON sintetizzare — riprodurre fedelmente.

### RIASSUNTO DEL CASO
Sintesi completa della vicenda clinica in 4-6 paragrafi. Esponi i fatti principali con sufficiente dettaglio: motivo del contenzioso, eventi chiave, conseguenze cliniche, situazione attuale del paziente. Non ripetere i dettagli già esposti nelle sezioni documentali precedenti — qui serve un quadro d'insieme completo per introdurre il parere medico-legale.

${hasPeriziaData && periziaMetadata?.speseMediche ? `### SPESE MEDICHE ESIBITE
Elenco delle spese mediche documentate con valutazione di congruità e necessità rispetto al quadro clinico.

` : ''}### PRECEDENTI PARERI TECNICI
Se tra gli eventi ci sono documenti di tipo perizia CTP, perizia CTU o perizia precedente, riprodurre le conclusioni e l'analisi delle perizie precedenti in forma riassuntiva fedele.
Se non sono presenti perizie precedenti, omettere questa sezione.

### [SEZIONI SPECIALIZZATE PER TIPO CASO]
Sezioni specifiche previste dalla tipologia del caso (es: Analisi intervento, Complicanze, Timeline diagnostica).

${hasPeriziaData && periziaMetadata?.esameObiettivo ? `### ESAME OBIETTIVO
Riporta i dati dell'esame obiettivo forniti.

` : ''}## PARERE MEDICO-LEGALE

### Considerazioni medico-legali
Analisi OGGETTIVA dei profili di responsabilità basata esclusivamente sulla documentazione in atti. Scrivi in forma di paragrafi argomentativi, NON elenchi puntati.
Ogni profilo di responsabilità va sviluppato come argomentazione discorsiva con citazioni puntuali dalla documentazione [Ev.N].
Per OGNI criticità individuata, sviluppa nel paragrafo: il FATTO OGGETTIVO emerso dalla documentazione con riferimento specifico [Ev.N],
il confronto con le linee guida e buone pratiche cliniche applicabili [Fonte, Anno],
le eventuali controdeduzioni documentali (se applicabili al ruolo),
e la valutazione medico-legale motivata con indicazione dell'evidenza su cui si fonda.
Per CTU: struttura ogni profilo come TESI (ricorrente) / ANTITESI (resistente) / GIUDIZIO CTU.
IMPORTANTE: NON formulare giudizi o conclusioni che non siano direttamente supportati da evidenze documentali. Ogni affermazione deve essere verificabile.

### Nesso causale
Analisi del nesso di causalità con i criteri giuridici applicabili (più probabile che non, ragionevole certezza medico-legale).
Per ogni nesso, indicare: (1) il FATTO documentato [Ev.N], (2) la CONSEGUENZA clinica documentata [Ev.N], (3) il CRITERIO giuridico applicato, (4) l'EVIDENZA documentale che supporta il collegamento.
Formulazione: "Dalla documentazione risulta che [fatto, Ev.N], il che, secondo il criterio del [criterio giuridico], è collegabile a [conseguenza, Ev.N]".
NON affermare nessi causali non supportati dalla documentazione in atti.

### Valutazione del danno biologico
Quantificazione esplicita in forma discorsiva, basata ESCLUSIVAMENTE sulla documentazione in atti. Indica nel paragrafo: il danno biologico permanente
con percentuale e criteri tabellari utilizzati, i periodi di ITT e ITP con date esatte documentate e percentuali,
il danno morale/esistenziale solo se documentato con motivazione ancorata ai fatti, e le spese mediche future
solo se documentabili da evidenze cliniche in atti.
Per ogni voce di danno, indicare quale fatto documentato [Ev.N] ne costituisce la base.
Utilizza i riferimenti tabellari forniti (DM 2024, Tabelle Milano) per motivare la quantificazione.
NON quantificare danni non supportati dalla documentazione.

${hasPeriziaData && periziaMetadata?.quesiti?.length ? `### RISPOSTA AI QUESITI
Risposta punto per punto a CIASCUN quesito del Giudice, NUMERATA corrispondentemente. Ogni risposta deve essere:
- Argomentata con riferimenti specifici alla documentazione esaminata
- Completa e autonomamente comprensibile
- Conclusiva (esprimere un giudizio motivato, non lasciare la risposta aperta)
- Per CTU: ogni risposta con TESI (ricorrente) / ANTITESI (resistente) / GIUDIZIO

` : ''}### CONCLUSIONI
Scrivi le conclusioni come paragrafo unico discorsivo con formula di rito, NON come elenco puntato.
Stile: "A parere di questo CTU, sulla base della documentazione in atti esaminata, si ritiene che..."
Includi nel paragrafo: formula di rito appropriata al ruolo (CTU: "A parere di questo CTU, dalla documentazione in atti risulta...",
CTP: "Dalla documentazione in atti risulta che...", Stragiudiziale: "Dall'analisi della documentazione emerge..."),
riepilogo quantitativo del danno biologico (% permanente, periodi ITT/ITP) basato su criteri tabellari,
valutazione del nesso causale fondata sulle evidenze documentali, ed eventuali riserve o necessità di documentazione integrativa.
IMPORTANTE: le conclusioni devono essere la conseguenza DIRETTA dei fatti documentati analizzati nel report. NON introdurre elementi nuovi non già trattati.`;

  return `Sei un medico legale esperto specializzato nella redazione di relazioni peritali in ambito di responsabilità sanitaria.

## IL TUO COMPITO
Genera un REPORT MEDICO-LEGALE completo e dettagliato, con struttura da perizia depositabile in tribunale, basato sugli eventi clinici estratti dalla documentazione. Il report deve includere sia la riproduzione fedele della documentazione esaminata (in atti e sanitaria) sia l'analisi medico-legale vera e propria.

${roleDirective}

${caseTypeDirective}

${periziaStructure}

## CRITERI PER LA VALUTAZIONE DEL NESSO CAUSALE

${causalNexus}

## FORMATO DOCUMENTAZIONE SANITARIA

Per ogni episodio nella sezione DATI DELLA DOCUMENTAZIONE SANITARIA scrivi un PARAGRAFO NARRATIVO che integri:
- La data (formato DD.MM.YYYY) nel testo
- La categoria della fonte tra parentesi (A), (B), (C) o (D) alla fine del paragrafo
- Il contenuto fedelmente dal documento originale, in prosa discorsiva dettagliata

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
}): string {
  const { caseType, patientInitials, caseRole, events, anomalies, missingDocuments, calculations, caseTypes, periziaMetadata, imageAnalysis } = params;

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

## DOCUMENTAZIONE MANCANTE

${missingDocsText}
${calculationsText}
${formatImageAnalysisForPrompt(imageAnalysis)}---

Genera il report completo con TUTTE le sezioni specificate nelle istruzioni di sistema.
IMPORTANTE: La sezione DATI DELLA DOCUMENTAZIONE SANITARIA deve riportare OGNI evento fornito sopra, fedelmente e in dettaglio, senza omissioni. Scrivi in prosa narrativa discorsiva, NON elenchi puntati. Questa sezione deve essere la più lunga del report.
Adatta tono e prospettiva al RUOLO indicato (${roleLabel}).`;
}

// ── Split-mode prompts (for large cases >40K chars) ──

/**
 * System prompt for chronology-only generation (split mode).
 */
export function buildChronologySystemPrompt(): string {
  return `Sei un medico legale esperto incaricato di redigere la sezione "DATI DELLA DOCUMENTAZIONE SANITARIA" di un report peritale.

COMPITO: Genera ESCLUSIVAMENTE la riproduzione dettagliata e fedele della documentazione sanitaria in ordine cronologico. NON generare riassunti, analisi, o elementi di rilievo.

STILE: Prosa giuridica formale come nella sezione "DATI DOCUMENTAZIONE SANITARIA" di una perizia CTU depositata in tribunale. Per ogni documento/episodio scrivi un PARAGRAFO NARRATIVO dettagliato che riproduca fedelmente: diari medici, diari infermieristici, valori di laboratorio, verbali operatori, descrizioni degli interventi, lettere di dimissione, referti di esami strumentali, referti specialistici, prescrizioni terapeutiche. NON usare elenchi puntati.
Esempio: "In data 30.09.2021 il sig. Rossi si recava presso il Pronto Soccorso del P.O. ove veniva ricoverato. All'ingresso si rilevavano i seguenti parametri: PA 130/80, FC 88 bpm, SpO2 98%. L'esame radiografico evidenziava frattura composta del III medio di femore dx. In data 01.10.2021 il paziente veniva sottoposto ad intervento di riduzione e osteosintesi con placca e viti (verbale operatorio: durata 95 min, chirurgo Dr. Bianchi). Il decorso post-operatorio risultava regolare. (A)"

FORMATO: Indica la categoria della fonte (A), (B), (C) o (D) tra parentesi alla fine di ogni paragrafo.

${CHRONOLOGY_SOURCES_GUIDE}

REGOLE:
- Ordine rigorosamente cronologico
- Il contenuto deve essere FEDELE alla documentazione — riprodurre, non sintetizzare
- Includi TUTTI gli eventi forniti, nessuno deve essere escluso
- Descrizioni DETTAGLIATE e COMPLETE: riporta valori, misure, dosaggi, nomi farmaci, parametri vitali, referti completi
- Se la data è incerta, indica la migliore approssimazione disponibile
- Scrivi in PROSA NARRATIVA, MAI elenchi puntati
- DIVIETO DI INVENZIONE: NON aggiungere fatti, diagnosi, date, nomi o dettagli clinici non presenti negli eventi forniti
- OGGETTIVITÀ: riportare ESCLUSIVAMENTE i fatti documentati, senza commenti, interpretazioni o deduzioni personali. La cronologia deve essere una riproduzione FEDELE e OGGETTIVA della documentazione
- Gli eventi di tipo "spesa_medica", "documento_amministrativo" e "certificato" vanno inclusi nella posizione temporale corretta

STRUTTURA OUTPUT (rispetta ESATTAMENTE questa struttura, inclusi i marker HTML):

<!-- SECTION:CRONOLOGIA -->
## DATI DELLA DOCUMENTAZIONE SANITARIA

In data DD.MM.YYYY il paziente... [paragrafo narrativo dettagliato e completo]. (X)

In data DD.MM.YYYY presso... [paragrafo narrativo dettagliato e completo]. (X)
<!-- END:CRONOLOGIA -->`;
}

/**
 * User prompt for chronology-only generation (split mode).
 */
export function buildChronologyUserPrompt(
  eventsFormatted: string,
  caseTypeLabel: string,
  expertRole: string,
  patientInitials?: string,
): string {
  let prompt = `TIPO CASO: ${caseTypeLabel}\n`;
  prompt += `RUOLO PERITO: ${expertRole}\n`;
  if (patientInitials) prompt += `PAZIENTE: ${patientInitials}\n`;
  prompt += '\nEVENTI ESTRATTI DA INCLUDERE NELLA DOCUMENTAZIONE SANITARIA:\n\n';
  prompt += eventsFormatted;
  prompt += '\n\nGenera la sezione DATI DELLA DOCUMENTAZIONE SANITARIA completa, includendo TUTTI gli eventi elencati sopra in forma dettagliata e fedele, nel formato specificato nelle istruzioni di sistema. Ricorda di includere i marker <!-- SECTION:CRONOLOGIA --> e <!-- END:CRONOLOGIA -->.';
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

  return `Sei un medico legale esperto incaricato di redigere le sezioni NON cronologiche di un report peritale.
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
## ELEMENTI DI RILIEVO MEDICO-LEGALE
[testo]
${periziaMetadata?.quesiti?.length ? `
## RISPOSTA AI QUESITI
Risposta punto per punto a CIASCUN quesito del Giudice, NUMERATA corrispondentemente.
Ogni risposta deve:
- Essere argomentata con riferimenti SPECIFICI alla cronologia fornita
- Citare fatti documentati dalla cronologia con date precise
- Essere conclusiva (esprimere un giudizio motivato)
- Per CTU: struttura TESI (ricorrente) / ANTITESI (resistente) / GIUDIZIO
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
  prompt += `\nAdatta tono e prospettiva al ruolo: ${expertRole}.`;

  // Explicit quesiti mapping instructions for split mode
  if (periziaMetadata?.quesiti && periziaMetadata.quesiti.length > 0) {
    prompt += '\n\nIMPORTANTE — RISPOSTA AI QUESITI:';
    prompt += '\nI quesiti del Giudice sono elencati sopra nei DATI PERIZIA FORMALE.';
    prompt += '\nPer CIASCUN quesito, identifica nella cronologia gli eventi rilevanti e rispondi con:';
    prompt += '\n1. I FATTI documentati nella cronologia (con date precise)';
    prompt += '\n2. Il GIUDIZIO medico-legale motivato';
    prompt += '\n3. La CONCLUSIONE specifica per quel quesito';
    prompt += '\nLa sezione RISPOSTA AI QUESITI deve essere DENTRO il blocco <!-- SECTION:ELEMENTI --> ... <!-- END:ELEMENTI -->.';
  }

  return prompt;
}

// ── Formatting helpers ──

function formatEventsForPrompt(events: ConsolidatedEvent[]): string {
  return events.map((e) => {
    const date = formatDate(e.eventDate);
    const precision = e.datePrecision !== 'giorno' ? ` [data ${e.datePrecision}]` : '';
    const sourceLabel = SOURCE_TYPE_LABELS[e.sourceType] ?? e.sourceType;
    const reliabilityScore = getSourceReliabilityScore(e.sourceType);
    const reliabilityLabel = getReliabilityLabel(reliabilityScore);
    const diagnosis = e.diagnosis ? `\n   Diagnosi: ${e.diagnosis}` : '';
    const doctor = e.doctor ? `\n   Medico: ${e.doctor}` : '';
    const facility = e.facility ? `\n   Struttura: ${e.facility}` : '';
    return `${e.orderNumber}. ${date}${precision} | FONTE: ${sourceLabel} [${reliabilityLabel} ${reliabilityScore}/100] | TIPO: ${e.eventType.toUpperCase()}
   TITOLO: ${e.title}
   DESCRIZIONE: ${e.description}${diagnosis}${doctor}${facility}`;
  }).join('\n\n');
}

function formatAnomaliesForPrompt(anomalies: DetectedAnomaly[]): string {
  if (anomalies.length === 0) return 'Nessuna anomalia rilevata.';
  return anomalies.map((a) => {
    const involvedDates = a.involvedEvents.map((e) => `${formatDate(e.date)} - ${e.title}`).join(', ');
    return `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description} (Eventi: ${involvedDates})\n  ANALISI DOCUMENTALE: indica la conseguenza clinica DOCUMENTATA e la quantificazione del danno basata su criteri tabellari e evidenze in atti.`;
  }).join('\n');
}

function formatMissingDocsForPrompt(missingDocuments: MissingDocument[]): string {
  if (missingDocuments.length === 0) return 'Nessuna documentazione mancante rilevata.';
  return missingDocuments.map((d) => `- ${d.documentName}: ${d.reason}`).join('\n');
}

function formatCalculationsForPrompt(calculations?: MedicoLegalCalculation[]): string {
  if (!calculations || calculations.length === 0) return '';
  const lines = calculations.map((c) => {
    const dateRange = c.startDate && c.endDate ? ` (${formatDate(c.startDate)} — ${formatDate(c.endDate)})` : '';
    const tableRef = c.tableReference ? `\n  Rif. tabellare: ${c.tableReference}` : '';
    return `- ${c.label}: ${c.value}${dateRange}\n  ${c.notes}${tableRef}`;
  });
  return `\n## PERIODI MEDICO-LEGALI CALCOLATI (proposti, il perito deve verificare)

${lines.join('\n')}

### ISTRUZIONI PER INTEGRAZIONE NEL REPORT
Nella sezione "Valutazione del danno biologico" e nelle "Conclusioni", INTEGRA questi dati in forma NARRATIVA DISCORSIVA:
- Riporta i periodi di ITT e ITP con date precise e durata in giorni nel testo delle conclusioni
- Indica i criteri tabellari utilizzati (es. Tabella Unica Nazionale DPR 12/2025, Tabelle Milano 2024)
- Nella conclusione, sintetizza: "I periodi di invalidità temporanea totale ammontano a X giorni (dal DD.MM.YYYY al DD.MM.YYYY), mentre l'invalidità temporanea parziale è quantificata in Y giorni..."
- NON limitarti a elencare i calcoli — integra i dati come parte dell'argomentazione medico-legale
- Se i calcoli includono riferimenti tabellari, citali esplicitamente nella valutazione del danno`;
}

function formatPeriziaMetadataForPrompt(periziaMetadata?: PeriziaMetadata): string {
  if (!periziaMetadata) return '';

  const lines: string[] = [];

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

function formatImageAnalysisForPrompt(
  imageAnalysis?: Array<{ pageNumber: number; imageType: string; description: string; confidence: number }>,
): string {
  if (!imageAnalysis || imageAnalysis.length === 0) return '';
  const lines = imageAnalysis.map((img) =>
    `- Pagina ${img.pageNumber} (${img.imageType}): ${img.description}`,
  );
  return `\n## ANALISI IMMAGINI DIAGNOSTICHE\n\nLe seguenti immagini sono state identificate e descritte automaticamente. Integra queste osservazioni nel report quando pertinenti.\n\n${lines.join('\n')}\n\n`;
}

export { CASE_TYPE_LABELS, SOURCE_TYPE_LABELS };
