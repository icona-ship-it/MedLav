import type { AnomalyType, AnomalySeverity, CaseType } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { formatDate } from '@/lib/format';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { detectCriticalClinicalValues } from './clinical-values-detector';

export interface DetectedAnomaly {
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  involvedEvents: Array<{
    eventId: string | null;
    orderNumber: number;
    date: string;
    title: string;
  }>;
  suggestion: string;
  /** Optional perito-authored note. When present, the synthesis prompt embeds it
   * verbatim and instructs the LLM to integrate it as factual context in the report. */
  resolutionNote?: string | null;
}

// Solo per il filtro di comparazione diagnosi (NON è la ragione dell'anomalia:
// evita di confrontare una diagnosi con un'altra a distanza di anni).
const DIAGNOSI_COMPARE_WINDOW_DAYS = 60;

/**
 * Tipi di anomalia RITIRATI (direttiva Lavini 2026-07-14): temporali/da-assenza,
 * non più prodotti dal detector. I casi GIÀ processati ne hanno di storiche nel
 * DB: vanno NASCOSTE al read-time (UI + export) — hide-don't-delete, nessuna
 * scrittura su dati Art.9. Le anomalie superstiti sono solo content-based.
 */
export const RETIRED_ANOMALY_TYPES: ReadonlySet<string> = new Set([
  'ritardo_diagnostico', 'gap_post_chirurgico', 'gap_documentale',
  'terapia_senza_followup', 'complicanza_non_gestita',
  'consenso_non_documentato', 'sequenza_temporale_violata',
]);

/** Filtra via le anomalie di tipo ritirato (temporale/da-assenza). Puro. */
export function filterRetiredAnomalies<T extends { anomaly_type?: string; anomalyType?: string }>(rows: T[]): T[] {
  return rows.filter((a) => !RETIRED_ANOMALY_TYPES.has(a.anomaly_type ?? a.anomalyType ?? ''));
}

/** Check if a date is a sentinel/placeholder (1900-*) */
function isSentinelDate(dateStr: string): boolean {
  return dateStr.startsWith('1900-');
}

/**
 * Rileva anomalie medico-legali dagli eventi consolidati.
 *
 * DIRETTIVA LAVINI (2026-07-14): un'anomalia NON deve MAI nascere da una distanza
 * temporale tra due eventi né dall'assenza di un documento — in una perizia RC il
 * perito lavora con ciò che ha, e "sono passati N giorni" o "manca il consenso"
 * non sono anomalie cliniche ma rumore (spesso solo documentazione non fornita).
 * Restano SOLO le anomalie basate sul CONTENUTO, che un perito controlla davvero:
 *   1. diagnosi_contraddittoria — due referti dicono diagnosi in conflitto;
 *   2. valore_clinico_critico  — un valore clinico fuori soglia critica.
 * RIMOSSE (temporali/da-assenza): ritardo_diagnostico, gap_documentale,
 * gap_post_chirurgico, terapia_senza_followup, complicanza_non_gestita,
 * consenso_non_documentato, sequenza_temporale_violata. Recuperabili da git.
 */
export function detectAnomalies(
  events: ConsolidatedEvent[],
  // Mantenuto per compatibilità coi chiamanti (regenerate, detect-issues): le
  // anomalie superstiti sono content-based e non dipendono dal tipo caso.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: { caseType?: CaseType; caseTypes?: CaseType[] },
): DetectedAnomaly[] {
  if (events.length < 2) return [];

  // Filtra gli eventi non clinici (notifiche costo SSN, ticket, documenti
  // amministrativi): date amministrative slegate dalla clinica.
  events = events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.eventType));
  if (events.length < 2) return [];

  const anomalies: DetectedAnomaly[] = [];

  // Anomalie CONTENUTO-based (mai temporali, mai da-assenza):
  anomalies.push(...detectDiagnosiContraddittoria(events));
  anomalies.push(...detectCriticalClinicalValues(events));

  // Deduplicate anomalies by type + description
  const seen = new Set<string>();
  return anomalies.filter((a) => {
    const key = `${a.anomalyType}:${a.description.slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Diagnosi Contraddittoria: due referti formulano diagnosi in CONFLITTO di
 * contenuto. L'anomalia nasce dalla DISCORDANZA (contenuto), NON dal tempo: la
 * finestra di 60 giorni è solo un filtro di comparazione (non confrontare una
 * diagnosi con un'altra a distanza di anni, che sarebbe una normale evoluzione).
 */
function detectDiagnosiContraddittoria(events: ConsolidatedEvent[]): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const eventsWithDiagnosis = events.filter((e) => e.diagnosis && e.diagnosis.length > 10 && !isSentinelDate(e.eventDate));

  // Limit to avoid O(n²) explosion
  const maxToCheck = Math.min(eventsWithDiagnosis.length, 20);

  for (let i = 0; i < maxToCheck; i++) {
    for (let j = i + 1; j < maxToCheck; j++) {
      const a = eventsWithDiagnosis[i];
      const b = eventsWithDiagnosis[j];

      // Filtro (NON ragione): salta le coppie troppo distanti nel tempo.
      if (daysDiff(a.eventDate, b.eventDate) > DIAGNOSI_COMPARE_WINDOW_DAYS) {
        continue;
      }

      if (areDiagnosesContradictory(a.diagnosis!, b.diagnosis!)) {
        anomalies.push({
          anomalyType: 'diagnosi_contraddittoria',
          severity: 'media',
          // La descrizione GUIDA col CONTENUTO discordante, non con la distanza temporale.
          description: `Diagnosi potenzialmente discordanti. Un documento riporta "${a.diagnosis}" (${formatDate(a.eventDate)}, evento: "${a.title}"), un altro riporta "${b.diagnosis}" (${formatDate(b.eventDate)}, evento: "${b.title}"). La differenza nel contenuto diagnostico richiede una verifica: può trattarsi di evoluzione clinica, di aggiornamento diagnostico motivato da nuovi accertamenti, oppure di una reale discordanza valutativa.`,
          involvedEvents: [makeEventRef(a), makeEventRef(b)],
          suggestion: 'Confrontare i due documenti alla fonte e stabilire se la differenza sia giustificata da accertamenti intercorsi o configuri una reale discordanza rilevante ai fini medico-legali.',
        });
      }
    }
  }

  return anomalies;
}

// --- Helpers ---

function daysDiff(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function makeEventRef(event: ConsolidatedEvent): DetectedAnomaly['involvedEvents'][number] {
  return {
    eventId: null,
    orderNumber: event.orderNumber,
    date: event.eventDate,
    title: event.title,
  };
}

/**
 * Heuristic: two diagnoses are contradictory only if they share
 * very few words (< 20% overlap) and both are substantial.
 */
function areDiagnosesContradictory(a: string, b: string): boolean {
  const normalizedA = a.toLowerCase().trim();
  const normalizedB = b.toLowerCase().trim();

  if (normalizedA === normalizedB) return false;

  const wordsA = new Set(normalizedA.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(normalizedB.split(/\s+/).filter((w) => w.length > 3));

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  const maxSize = Math.max(wordsA.size, wordsB.size);
  if (maxSize === 0) return false;

  // Only flag if overlap is very low (< 20%) — clearly different diagnoses
  if (overlap / maxSize > 0.2) return false;

  // Both must have at least 3 meaningful words
  return wordsA.size >= 3 && wordsB.size >= 3;
}
