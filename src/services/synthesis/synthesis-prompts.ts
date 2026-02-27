import type { CaseType } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import { formatDate } from '@/lib/format';

const CASE_TYPE_LABELS: Record<CaseType, string> = {
  ortopedica: 'Malasanità Ortopedica',
  oncologica: 'Ritardo Diagnostico Oncologico',
  ostetrica: 'Errore Ostetrico',
  anestesiologica: 'Errore Anestesiologico',
  infezione_nosocomiale: 'Infezione Nosocomiale',
  errore_diagnostico: 'Errore Diagnostico',
  generica: 'Responsabilità Professionale Generica',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'A - CARTELLA CLINICA',
  referto_controllo: 'B - REFERTI CONTROLLI MEDICI',
  esame_strumentale: 'C - REFERTI RADIOLOGICI ED ESAMI STRUMENTALI',
  esame_ematochimico: 'D - ESAMI EMATOCHIMICI',
  altro: 'ALTRO',
};

/**
 * Build the system prompt for synthesis generation.
 * Produces a complete medico-legal report with summary + chronology.
 */
export function buildSynthesisSystemPrompt(): string {
  return `Sei un medico legale esperto specializzato nella redazione di relazioni peritali in ambito di responsabilità sanitaria.

## IL TUO COMPITO
Genera un REPORT MEDICO-LEGALE completo e dettagliato basato sugli eventi clinici estratti dalla documentazione.

## STRUTTURA OBBLIGATORIA DEL REPORT

### PARTE 1 — RIASSUNTO DEL CASO (300-500 parole)
Sintesi narrativa completa del caso che include:
- Presentazione del paziente e motivo del ricovero/prima visita
- Decorso clinico essenziale con i passaggi critici
- Interventi effettuati e loro esiti
- Complicanze eventualmente insorte
- Stato attuale del paziente e prognosi
- Elementi critici per la valutazione medico-legale
- Nesso causale tra gestione clinica e danni

### PARTE 2 — CRONOLOGIA MEDICO-LEGALE (senza limiti di parole)
Elenco cronologico COMPLETO di TUTTI i fatti medici documentati.
Questa sezione è la parte più importante: deve riportare FEDELMENTE le evidenze cliniche come un copia/incolla organizzato della documentazione.

Per ogni voce cronologica riporta:
- **Data** (formato DD/MM/YYYY)
- **Categoria fonte** tra parentesi: (A), (B), (C) o (D)
- **Contenuto** copiato fedelmente dal documento originale

Le categorie delle fonti sono:
**(A) CARTELLA CLINICA** — riportare:
- Diagnosi di ingresso, peso, altezza, parametri vitali (PA, FC, SpO2, temperatura)
- Esami ematochimici con TUTTI i valori numerici e unità di misura
- Anamnesi patologica e terapie effettuate (farmaco, dosaggio, via, frequenza)
- Descrizione operatoria INTEGRALE: tipo intervento, operatori, tecnica, tempi operatori, reperti, complicanze, tipo anestesia
- Cartella anestesiologica: valutazione preoperatoria, ASA score, farmaci, parametri
- Diario medico/infermieristico: SOLO eventi avversi, complicanze, peggioramenti, interventi urgenti
- Lettera di dimissione: diagnosi dimissione, condizioni, terapia domiciliare, follow-up

**(B) REFERTI CONTROLLI MEDICI** — riportare INTEGRALMENTE:
Visite specialistiche, follow-up, visite ambulatoriali, certificati medici con: data, specialista, contenuto completo, conclusioni

**(C) REFERTI RADIOLOGICI ED ESAMI STRUMENTALI** — riportare INTEGRALMENTE:
RX, TAC/TC, RM, ecografie, ECG con: data, tipo esame, distretto, descrizione, conclusioni

**(D) ESAMI EMATOCHIMICI** — riportare TUTTI i valori:
Emocromo, biochimica, coagulazione, markers con: data, tutti i valori numerici con unità di misura

### PARTE 3 — ELEMENTI DI RILIEVO MEDICO-LEGALE (200-400 parole)
- Punti critici per la valutazione peritale
- Eventuali omissioni o ritardi
- Anomalie nella gestione clinica
- Documentazione mancante rilevante

## REGOLE ASSOLUTE
- NON omettere NESSUN evento dalla cronologia
- Riportare i dati FEDELMENTE come dal documento, non sintetizzare
- NON citare numeri di pagina
- NON inventare dati non presenti negli eventi
- Linguaggio medico-legale formale
- Scrivi in italiano
- Usa intestazioni markdown (## per parti, ### per sotto-sezioni)
- La cronologia deve essere COMPLETA — ogni evento fornito deve comparire`;
}

/**
 * Build the user prompt with all case data.
 */
export function buildSynthesisUserPrompt(params: {
  caseType: CaseType;
  patientInitials: string | null;
  caseRole: string;
  events: ConsolidatedEvent[];
  anomalies: DetectedAnomaly[];
  missingDocuments: MissingDocument[];
}): string {
  const { caseType, patientInitials, caseRole, events, anomalies, missingDocuments } = params;

  // Group events by source type for better context
  const eventsText = events.map((e) => {
    const date = formatDate(e.eventDate);
    const precision = e.datePrecision !== 'giorno' ? ` [data ${e.datePrecision}]` : '';
    const sourceLabel = SOURCE_TYPE_LABELS[e.sourceType] ?? e.sourceType;
    const diagnosis = e.diagnosis ? `\n   Diagnosi: ${e.diagnosis}` : '';
    const doctor = e.doctor ? `\n   Medico: ${e.doctor}` : '';
    const facility = e.facility ? `\n   Struttura: ${e.facility}` : '';
    return `${e.orderNumber}. ${date}${precision} | FONTE: ${sourceLabel} | TIPO: ${e.eventType.toUpperCase()}
   TITOLO: ${e.title}
   DESCRIZIONE: ${e.description}${diagnosis}${doctor}${facility}`;
  }).join('\n\n');

  const anomaliesText = anomalies.length > 0
    ? anomalies.map((a) => {
      const involvedDates = a.involvedEvents.map((e) => `${formatDate(e.date)} - ${e.title}`).join(', ');
      return `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description} (Eventi: ${involvedDates})`;
    }).join('\n')
    : 'Nessuna anomalia rilevata.';

  const missingDocsText = missingDocuments.length > 0
    ? missingDocuments.map((d) => `- ${d.documentName}: ${d.reason}`).join('\n')
    : 'Nessuna documentazione mancante rilevata.';

  return `Genera il report medico-legale completo per il seguente caso.

TIPO CASO: ${CASE_TYPE_LABELS[caseType]}
RUOLO PERITO: ${caseRole.toUpperCase()}
PAZIENTE: ${patientInitials || 'N/D'}
NUMERO EVENTI DOCUMENTATI: ${events.length}
PERIODO DOCUMENTATO: ${events.length > 0 ? `${formatDate(events[0].eventDate)} — ${formatDate(events[events.length - 1].eventDate)}` : 'N/D'}

## TUTTI GLI EVENTI CLINICI IN ORDINE CRONOLOGICO

${eventsText}

## ANOMALIE RILEVATE DAL SISTEMA

${anomaliesText}

## DOCUMENTAZIONE MANCANTE

${missingDocsText}

---

Genera il report completo con le 3 parti obbligatorie:
1. RIASSUNTO DEL CASO (sintesi narrativa)
2. CRONOLOGIA MEDICO-LEGALE (tutti gli eventi, categorizzati A/B/C/D, copiati fedelmente)
3. ELEMENTI DI RILIEVO MEDICO-LEGALE (criticità, anomalie, nesso causale)

IMPORTANTE: La cronologia deve riportare OGNI evento fornito sopra, fedelmente, senza omissioni. Non citare numeri di pagina.`;
}

// ── Split-mode prompts (for large cases >40K chars) ──

/**
 * System prompt for chronology-only generation (split mode).
 */
export function buildChronologySystemPrompt(): string {
  return `Sei un medico legale esperto incaricato di redigere la sezione "CRONOLOGIA MEDICO-LEGALE" di un report peritale.

COMPITO: Genera ESCLUSIVAMENTE la cronologia. NON generare riassunti, analisi, o elementi di rilievo.

FORMATO OBBLIGATORIO PER OGNI VOCE:
- Data in formato DD/MM/YYYY
- Categoria della fonte tra parentesi:
  (A) CARTELLA CLINICA — fogli di ingresso, esami obiettivi, anamnesi, descrizioni operatorie, schede anestesiologiche, diari clinici, lettere di dimissione
  (B) REFERTI CONTROLLI MEDICI — visite ambulatoriali, follow-up, certificati, consulenze
  (C) REFERTI RADIOLOGICI ED ESAMI STRUMENTALI — RX, TAC, RM, ECG, ecografie, endoscopie
  (D) ESAMI EMATOCHIMICI — referti di laboratorio, esami del sangue, esami urine

REGOLE:
- Ordine rigorosamente cronologico
- Il contenuto di ogni voce deve essere COPIATO FEDELMENTE dalla documentazione, non parafrasato
- Includi TUTTI gli eventi forniti, nessuno deve essere escluso
- Descrizioni DETTAGLIATE e COMPLETE: riporta valori, misure, dosaggi, nomi farmaci
- Se la data è incerta, indica la migliore approssimazione disponibile

STRUTTURA OUTPUT (rispetta ESATTAMENTE questa struttura, inclusi i marker HTML):

<!-- SECTION:CRONOLOGIA -->
## CRONOLOGIA MEDICO-LEGALE

DD/MM/YYYY — (X) Titolo evento
Descrizione completa e fedele copiata dalla documentazione...

DD/MM/YYYY — (X) Titolo evento
Descrizione completa e fedele copiata dalla documentazione...
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
 */
export function buildSummarySystemPrompt(): string {
  return `Sei un medico legale esperto incaricato di redigere due sezioni di un report peritale:
1. RIASSUNTO DEL CASO
2. ELEMENTI DI RILIEVO MEDICO-LEGALE

Ti verrà fornita la cronologia già compilata come riferimento. NON rigenerare la cronologia.

SEZIONE 1 — RIASSUNTO DEL CASO (300-500 parole):
Deve contenere:
- Presentazione del paziente e motivo del ricovero/consulenza
- Decorso clinico con i passaggi critici
- Interventi effettuati e loro esiti
- Complicanze eventualmente insorte
- Stato attuale e prognosi (se disponibile)
- Elementi critici per la valutazione medico-legale
- Nesso causale tra gestione clinica e danno (se rilevabile)

SEZIONE 2 — ELEMENTI DI RILIEVO MEDICO-LEGALE (200-400 parole):
Deve contenere:
- Punti critici per la valutazione peritale
- Eventuali omissioni o ritardi nella gestione clinica
- Anomalie nella gestione diagnostico-terapeutica
- Documentazione mancante o carente
- Discrepanze tra quanto documentato e quanto atteso secondo le linee guida
- Aspetti rilevanti per la quantificazione del danno

STRUTTURA OUTPUT (rispetta ESATTAMENTE questa struttura, inclusi i marker HTML):

<!-- SECTION:RIASSUNTO -->
## RIASSUNTO DEL CASO
[testo 300-500 parole]
<!-- END:RIASSUNTO -->

<!-- SECTION:ELEMENTI -->
## ELEMENTI DI RILIEVO MEDICO-LEGALE
[testo 200-400 parole]
<!-- END:ELEMENTI -->`;
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
}): string {
  const { chronology, caseTypeLabel, expertRole, patientInitials, anomalies, missingDocs } = params;

  let prompt = `TIPO CASO: ${caseTypeLabel}\n`;
  prompt += `RUOLO PERITO: ${expertRole}\n`;
  if (patientInitials) prompt += `PAZIENTE: ${patientInitials}\n`;

  prompt += `\n## CRONOLOGIA DI RIFERIMENTO (già compilata):\n${chronology}\n`;

  if (anomalies && anomalies.trim().length > 0) {
    prompt += `\n## ANOMALIE RILEVATE DAL SISTEMA:\n${anomalies}\n`;
  }

  if (missingDocs && missingDocs.trim().length > 0) {
    prompt += `\n## DOCUMENTAZIONE MANCANTE:\n${missingDocs}\n`;
  }

  prompt += '\nBasandoti sulla cronologia e sulle anomalie sopra indicate, genera le due sezioni richieste (RIASSUNTO DEL CASO e ELEMENTI DI RILIEVO MEDICO-LEGALE) nel formato specificato. Ricorda di includere i marker <!-- SECTION:RIASSUNTO -->, <!-- END:RIASSUNTO -->, <!-- SECTION:ELEMENTI --> e <!-- END:ELEMENTI -->.';

  return prompt;
}

export { CASE_TYPE_LABELS, SOURCE_TYPE_LABELS };
