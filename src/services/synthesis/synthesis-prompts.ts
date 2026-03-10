import type { CaseType, CaseRole } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import { formatDate } from '@/lib/format';
import { formatRoleDirectiveForPrompt } from './role-prompts';
import { buildCaseTypeDirective } from './case-type-templates';
import { formatCausalNexusForPrompt, getCaseTypeKnowledge, getCombinedCaseTypeKnowledge, getGoldenPerizia } from '@/lib/domain-knowledge';

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
- NON citare numeri di pagina
- NON inventare dati non presenti negli eventi
- Linguaggio medico-legale formale
- Scrivi in italiano
- Usa intestazioni markdown (## per parti, ### per sotto-sezioni)
- La cronologia deve essere COMPLETA — ogni evento fornito deve comparire`;

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
}): string {
  const { caseType, caseRole, caseTypes } = params;
  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const roleDirective = formatRoleDirectiveForPrompt(caseRole);
  const caseTypeDirective = buildCaseTypeDirective(effectiveTypes);
  const causalNexus = formatCausalNexusForPrompt();

  const goldenExample = getGoldenPerizia(caseType, caseRole);
  const fewShotSection = goldenExample
    ? `\n\n## ESEMPIO DI RIFERIMENTO\n\nIl seguente è un estratto di una perizia di riferimento per questo tipo di caso e ruolo. Usa tono, struttura e livello di dettaglio simili.\n\n---\n${goldenExample}\n---\n\nIMPORTANTE: L'esempio sopra è solo un RIFERIMENTO per tono e struttura. NON copiare il contenuto — genera il report basandoti ESCLUSIVAMENTE sugli eventi forniti.`
    : '';

  return `Sei un medico legale esperto specializzato nella redazione di relazioni peritali in ambito di responsabilità sanitaria.

## IL TUO COMPITO
Genera un REPORT MEDICO-LEGALE completo e dettagliato basato sugli eventi clinici estratti dalla documentazione.

${roleDirective}

${caseTypeDirective}

## CRITERI PER LA VALUTAZIONE DEL NESSO CAUSALE

${causalNexus}

## FORMATO CRONOLOGIA

Per ogni voce cronologica riporta:
- **Data** (formato DD/MM/YYYY)
- **Categoria fonte** tra parentesi: (A), (B), (C) o (D)
- **Contenuto** copiato fedelmente dal documento originale

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
}): string {
  const { caseType, patientInitials, caseRole, events, anomalies, missingDocuments, calculations, caseTypes } = params;

  const eventsText = formatEventsForPrompt(events);
  const anomaliesText = formatAnomaliesForPrompt(anomalies);
  const missingDocsText = formatMissingDocsForPrompt(missingDocuments);
  const calculationsText = formatCalculationsForPrompt(calculations);

  const roleLabel = caseRole === 'ctu' ? 'CTU - Consulente Tecnico d\'Ufficio'
    : caseRole === 'ctp' ? 'CTP - Consulente Tecnico di Parte'
    : 'Perito Stragiudiziale';

  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const caseTypeLabelsText = effectiveTypes.map(t => CASE_TYPE_LABELS[t]).join(' + ');

  return `Genera il report medico-legale completo per il seguente caso.

TIPO CASO: ${caseTypeLabelsText}
RUOLO PERITO: ${roleLabel}
PAZIENTE: ${patientInitials || 'N/D'}
NUMERO EVENTI DOCUMENTATI: ${events.length}
PERIODO DOCUMENTATO: ${events.length > 0 ? `${formatDate(events[0].eventDate)} — ${formatDate(events[events.length - 1].eventDate)}` : 'N/D'}

## TUTTI GLI EVENTI CLINICI IN ORDINE CRONOLOGICO

${eventsText}

## ANOMALIE RILEVATE DAL SISTEMA

${anomaliesText}

## DOCUMENTAZIONE MANCANTE

${missingDocsText}
${calculationsText}
---

Genera il report completo con TUTTE le sezioni specificate nelle istruzioni di sistema.
IMPORTANTE: La cronologia deve riportare OGNI evento fornito sopra, fedelmente, senza omissioni. Non citare numeri di pagina.
Adatta tono e prospettiva al RUOLO indicato (${roleLabel}).`;
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
- Categoria della fonte tra parentesi: (A), (B), (C) o (D)

${CHRONOLOGY_SOURCES_GUIDE}

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
}): string {
  const { chronology, caseTypeLabel, expertRole, patientInitials, anomalies, missingDocs, calculations } = params;

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
    const diagnosis = e.diagnosis ? `\n   Diagnosi: ${e.diagnosis}` : '';
    const doctor = e.doctor ? `\n   Medico: ${e.doctor}` : '';
    const facility = e.facility ? `\n   Struttura: ${e.facility}` : '';
    return `${e.orderNumber}. ${date}${precision} | FONTE: ${sourceLabel} | TIPO: ${e.eventType.toUpperCase()}
   TITOLO: ${e.title}
   DESCRIZIONE: ${e.description}${diagnosis}${doctor}${facility}`;
  }).join('\n\n');
}

function formatAnomaliesForPrompt(anomalies: DetectedAnomaly[]): string {
  if (anomalies.length === 0) return 'Nessuna anomalia rilevata.';
  return anomalies.map((a) => {
    const involvedDates = a.involvedEvents.map((e) => `${formatDate(e.date)} - ${e.title}`).join(', ');
    return `- [${a.severity.toUpperCase()}] ${a.anomalyType}: ${a.description} (Eventi: ${involvedDates})`;
  }).join('\n');
}

function formatMissingDocsForPrompt(missingDocuments: MissingDocument[]): string {
  if (missingDocuments.length === 0) return 'Nessuna documentazione mancante rilevata.';
  return missingDocuments.map((d) => `- ${d.documentName}: ${d.reason}`).join('\n');
}

function formatCalculationsForPrompt(calculations?: MedicoLegalCalculation[]): string {
  if (!calculations || calculations.length === 0) return '';
  const lines = calculations.map((c) =>
    `- ${c.label}: ${c.value}${c.startDate && c.endDate ? ` (${formatDate(c.startDate)} — ${formatDate(c.endDate)})` : ''}\n  ${c.notes}`,
  );
  return `\n## PERIODI MEDICO-LEGALI CALCOLATI (proposti, il perito deve verificare)\n\n${lines.join('\n')}\n\nNOTA: Integra questi periodi nella valutazione del danno biologico. Sono stime automatiche da confermare.`;
}

export { CASE_TYPE_LABELS, SOURCE_TYPE_LABELS };
