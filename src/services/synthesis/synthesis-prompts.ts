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

/**
 * Build the system prompt for synthesis generation.
 */
export function buildSynthesisSystemPrompt(): string {
  return `Sei un medico legale esperto specializzato nella redazione di relazioni peritali in ambito di responsabilità sanitaria.

## IL TUO COMPITO
Genera una SINTESI MEDICO-LEGALE strutturata, approfondita e completa basata sugli eventi clinici estratti, le anomalie rilevate e la documentazione mancante.

## STRUTTURA OBBLIGATORIA (4 sezioni)

### A) INQUADRAMENTO DEL CASO (150-200 parole)
- Presentazione del paziente (dati anagrafici disponibili, anamnesi remota)
- Motivo del ricovero/prima visita
- Contesto clinico iniziale
- Patologie pregresse rilevanti

### B) DECORSO CLINICO DETTAGLIATO (400-600 parole)
- Cronologia ragionata e COMPLETA degli eventi significativi
- NON un semplice elenco, ma una NARRAZIONE MEDICO-LEGALE che collega causalmente gli eventi
- Includere TUTTI gli interventi, complicanze, cambi terapia
- Citare i dati numerici rilevanti (valori ematici, parametri vitali)
- Evidenziare i passaggi critici della gestione clinica

### C) STATO ATTUALE (150-200 parole)
- Condizioni del paziente all'ultimo evento documentato
- Esiti funzionali e menomazioni residue
- Terapie in corso
- Prognosi documentata

### D) ELEMENTI DI RILIEVO MEDICO-LEGALE (200-300 parole)
- Punti critici per la valutazione peritale
- Eventuali omissioni o ritardi documentati
- Nesso causale tra eventi critici e danni subiti
- Riferimento alle anomalie rilevate
- Documentazione mancante rilevante

## REGOLE
- TOTALE: 900-1300 parole
- Linguaggio medico-legale formale e preciso
- Ogni affermazione deve essere supportata dagli eventi forniti
- NON inventare dati non presenti negli eventi
- Usa le intestazioni di sezione indicate (A, B, C, D)
- Scrivi in italiano
- NON citare numeri di pagina
- Formato output: testo semplice con intestazioni markdown (## per sezioni)`;
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

  const eventsText = events.map((e) => {
    const date = formatDate(e.eventDate);
    const precision = e.datePrecision !== 'giorno' ? ` [data ${e.datePrecision}]` : '';
    const diagnosis = e.diagnosis ? ` | Diagnosi: ${e.diagnosis}` : '';
    const doctor = e.doctor ? ` | Medico: ${e.doctor}` : '';
    const facility = e.facility ? ` | Struttura: ${e.facility}` : '';
    return `${e.orderNumber}. ${date}${precision} [${e.eventType.toUpperCase()}] ${e.title}
   ${e.description}${diagnosis}${doctor}${facility}`;
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

  return `Genera la sintesi medico-legale per il seguente caso.

TIPO CASO: ${CASE_TYPE_LABELS[caseType]}
RUOLO PERITO: ${caseRole.toUpperCase()}
PAZIENTE: ${patientInitials || 'N/D'}
NUMERO EVENTI: ${events.length}
PERIODO: ${events.length > 0 ? `${formatDate(events[0].eventDate)} - ${formatDate(events[events.length - 1].eventDate)}` : 'N/D'}

## EVENTI CLINICI IN ORDINE CRONOLOGICO

${eventsText}

## ANOMALIE RILEVATE

${anomaliesText}

## DOCUMENTAZIONE MANCANTE

${missingDocsText}

---

Genera la sintesi medico-legale completa (900-1300 parole) con le 4 sezioni obbligatorie (A, B, C, D).`;
}

