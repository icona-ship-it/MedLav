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
- NON omettere NESSUN evento dalla cronologia
- Riportare i dati FEDELMENTE come dal documento, non sintetizzare
- NON inventare dati non presenti negli eventi
- NON inventare MAI date. Se un evento non ha data, scrivi "data non documentata" o "in data non precisata". NON usare date fittizie come 01/01/1900 o simili
- Quando una data è segnata come "sconosciuta" o vuota, indicalo esplicitamente nel testo: "in data non risultante dalla documentazione in atti"
- Linguaggio medico-legale formale
- Scrivi in italiano
- Usa intestazioni markdown (## per parti, ### per sotto-sezioni)
- La cronologia deve essere COMPLETA — ogni evento fornito deve comparire
- Scrivi SEMPRE in prosa discorsiva, MAI elenchi puntati per la narrazione clinica
- Lo stile deve essere quello di una perizia depositabile in tribunale: formale, giuridico, con periodi complessi e subordinate
- Quando citi linee guida cliniche, indica SEMPRE fonte e anno nel formato [Fonte, Anno]
- Quando due fonti discordano, privilegia la fonte con affidabilità maggiore (punteggio più alto)
- Quando citi un evento specifico dalla cronologia, includi il riferimento [Ev.N] dove N è il numero dell'evento (orderNumber). Questo è FONDAMENTALE per la tracciabilità in ambito giudiziario`;

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
Elenco dettagliato di TUTTA la documentazione analizzata con data e tipo di ciascun documento.

### RIASSUNTO DEL CASO
Narrazione sintetica ma COMPLETA della vicenda clinica in forma di paragrafi discorsivi.
Scrivi come se stessi redigendo la sezione FATTO di una perizia medico-legale. Integra le posizioni
delle parti (ricorrente e resistente) se disponibili dai dati della perizia.

### CRONOLOGIA MEDICO-LEGALE
Narrazione cronologica fluida della vicenda clinica. Per ogni episodio scrivi un PARAGRAFO
discorsivo che integri data, struttura, diagnosi, esami, terapie e decorso. NON usare elenchi puntati.
Stile: prosa giuridica formale come in una perizia depositata in tribunale.
Esempio di stile: "In data 30.09.2021 il sig. Rossi si recava presso il Pronto Soccorso del P.O.
ove veniva ricoverato. A seguito delle indagini eseguite, si accertava una frattura e, in data
01.10.2021, il paziente veniva sottoposto ad intervento di riduzione e osteosintesi con placca e viti."
Indica la categoria della fonte (A/B/C/D) tra parentesi alla fine di ogni paragrafo.

### [SEZIONI SPECIALIZZATE PER TIPO CASO]
Sezioni specifiche previste dalla tipologia del caso (es: Analisi intervento, Complicanze, Timeline diagnostica).

${hasPeriziaData && periziaMetadata?.esameObiettivo ? `### ESAME OBIETTIVO
Riporta i dati dell'esame obiettivo forniti.

` : ''}### CONSIDERAZIONI MEDICO-LEGALI / ELEMENTI DI RILIEVO
Analisi critica dei profili di responsabilità. Scrivi in forma di paragrafi argomentativi, NON elenchi puntati.
Ogni profilo di responsabilità va sviluppato come argomentazione discorsiva con citazioni dalla documentazione.
Per OGNI criticità individuata, sviluppa nel paragrafo: il rilievo oggettivo emerso dalla documentazione,
l'analisi del profilo di responsabilità professionale, le eventuali controdeduzioni (se applicabili al ruolo),
e il giudizio medico-legale motivato con riferimenti alla letteratura e alle linee guida.
Per CTU: struttura ogni profilo come TESI (ricorrente) / ANTITESI (resistente) / GIUDIZIO CTU.

### NESSO CAUSALE
Analisi del nesso di causalità con i criteri giuridici (più probabile che non, ragionevole certezza medico-legale).
Collegare esplicitamente ogni anomalia alla conseguenza clinica con formula "il [anomalia] ha verosimilmente determinato [danno]".

### VALUTAZIONE DEL DANNO BIOLOGICO
Quantificazione esplicita in forma discorsiva. Indica nel paragrafo: il danno biologico permanente
con percentuale e criteri tabellari utilizzati, i periodi di ITT e ITP con date esatte e percentuali,
il danno morale/esistenziale se applicabile con motivazione, e le spese mediche future prevedibili
se documentabili.
Per ogni voce di danno, indicare quale anomalia ne è la causa.
Utilizza i riferimenti tabellari forniti (DM 2024, Tabelle Milano) per motivare la quantificazione.

${hasPeriziaData && periziaMetadata?.quesiti?.length ? `### RISPOSTA AI QUESITI
Risposta punto per punto a CIASCUN quesito del Giudice, NUMERATA corrispondentemente. Ogni risposta deve essere:
- Argomentata con riferimenti specifici alla documentazione esaminata
- Completa e autonomamente comprensibile
- Conclusiva (esprimere un giudizio motivato, non lasciare la risposta aperta)
- Per CTU: ogni risposta con TESI (ricorrente) / ANTITESI (resistente) / GIUDIZIO

` : ''}${hasPeriziaData && periziaMetadata?.speseMediche ? `### SPESE MEDICHE
Analisi delle spese mediche documentate.

` : ''}### CONCLUSIONI
Scrivi le conclusioni come paragrafo unico discorsivo con formula di rito, NON come elenco puntato.
Stile: "A parere di questo CTU, alla luce di quanto sopra esposto e dedotto, si ritiene che..."
Includi nel paragrafo: formula di rito appropriata al ruolo (CTU: "A parere di questo CTU...",
CTP: "Risulta evidente che...", Stragiudiziale: "Il caso presenta fondatezza per..."),
riepilogo quantitativo del danno biologico (% permanente, periodi ITT/ITP),
giudizio complessivo sul nesso causale, ed eventuali riserve o necessità di approfondimento.`;

  return `Sei un medico legale esperto specializzato nella redazione di relazioni peritali in ambito di responsabilità sanitaria.

## IL TUO COMPITO
Genera un REPORT MEDICO-LEGALE completo e dettagliato, con struttura da perizia depositabile in tribunale, basato sugli eventi clinici estratti dalla documentazione.

NOTA: La documentazione sanitaria integrale viene riprodotta SEPARATAMENTE nel report finale (sezione DATI DOCUMENTAZIONE SANITARIA). Tu concentrati esclusivamente sull'ANALISI MEDICO-LEGALE: riassunto, cronologia ragionata, considerazioni critiche, nesso causale, valutazione danno e conclusioni. NON riprodurre il testo dei documenti — analizzalo.

${roleDirective}

${caseTypeDirective}

${periziaStructure}

## CRITERI PER LA VALUTAZIONE DEL NESSO CAUSALE

${causalNexus}

## FORMATO CRONOLOGIA

Per ogni episodio cronologico scrivi un PARAGRAFO NARRATIVO che integri:
- La data (formato DD.MM.YYYY) nel testo
- La categoria della fonte tra parentesi (A), (B), (C) o (D) alla fine del paragrafo
- Il contenuto fedelmente dal documento originale, in prosa discorsiva

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
IMPORTANTE: La cronologia deve riportare OGNI evento fornito sopra, fedelmente, senza omissioni. Scrivi in prosa narrativa discorsiva, NON elenchi puntati.
Adatta tono e prospettiva al RUOLO indicato (${roleLabel}).`;
}

// ── Split-mode prompts (for large cases >40K chars) ──

/**
 * System prompt for chronology-only generation (split mode).
 */
export function buildChronologySystemPrompt(): string {
  return `Sei un medico legale esperto incaricato di redigere la sezione "CRONOLOGIA MEDICO-LEGALE" di un report peritale.

COMPITO: Genera ESCLUSIVAMENTE la cronologia in forma NARRATIVA. NON generare riassunti, analisi, o elementi di rilievo.

STILE: Prosa giuridica formale come in una perizia depositata in tribunale. Per ogni episodio scrivi un PARAGRAFO
discorsivo che integri data, struttura, diagnosi, esami, terapie e decorso. NON usare elenchi puntati.
Esempio: "In data 30.09.2021 il sig. Rossi si recava presso il Pronto Soccorso del P.O. ove veniva ricoverato.
A seguito delle indagini eseguite, si accertava una frattura e, in data 01.10.2021, il paziente veniva sottoposto
ad intervento di riduzione e osteosintesi con placca e viti. (A)"

FORMATO: Indica la categoria della fonte (A), (B), (C) o (D) tra parentesi alla fine di ogni paragrafo.

${CHRONOLOGY_SOURCES_GUIDE}

REGOLE:
- Ordine rigorosamente cronologico
- Il contenuto deve essere FEDELE alla documentazione
- Includi TUTTI gli eventi forniti, nessuno deve essere escluso
- Descrizioni DETTAGLIATE e COMPLETE: riporta valori, misure, dosaggi, nomi farmaci
- Se la data è incerta, indica la migliore approssimazione disponibile
- Scrivi in PROSA NARRATIVA, MAI elenchi puntati

STRUTTURA OUTPUT (rispetta ESATTAMENTE questa struttura, inclusi i marker HTML):

<!-- SECTION:CRONOLOGIA -->
## CRONOLOGIA MEDICO-LEGALE

In data DD.MM.YYYY il paziente... [paragrafo narrativo completo]. (X)

In data DD.MM.YYYY presso... [paragrafo narrativo completo]. (X)
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
  prompt += '\nEVENTI ESTRATTI DA INCLUDERE NELLA CRONOLOGIA:\n\n';
  prompt += eventsFormatted;
  prompt += '\n\nGenera la CRONOLOGIA MEDICO-LEGALE completa, includendo TUTTI gli eventi elencati sopra, nel formato specificato nelle istruzioni di sistema. Ricorda di includere i marker <!-- SECTION:CRONOLOGIA --> e <!-- END:CRONOLOGIA -->.';
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
}): string {
  const { caseType, caseRole, caseTypes } = params;
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

STRUTTURA OUTPUT (rispetta ESATTAMENTE questa struttura, inclusi i marker HTML):

<!-- SECTION:RIASSUNTO -->
## RIASSUNTO DEL CASO
[testo]
<!-- END:RIASSUNTO -->

<!-- SECTION:ELEMENTI -->
## ELEMENTI DI RILIEVO MEDICO-LEGALE
[testo]
<!-- END:ELEMENTI -->${fewShotSection}`;
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
    return `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description} (Eventi: ${involvedDates})\n  COLLEGA AL DANNO: specifica la conseguenza clinica e la quantificazione del danno correlato a questa anomalia.`;
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
  return `\n## PERIODI MEDICO-LEGALI CALCOLATI (proposti, il perito deve verificare)\n\n${lines.join('\n')}\n\nNOTA: Integra questi periodi nella valutazione del danno biologico. Sono stime automatiche da confermare.`;
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
