/**
 * Damage estimation service that uses barème tables
 * to provide indicative biological damage ranges by case type.
 *
 * Integrates TUN (DPR 12/2025), Tabelle Milano 2024,
 * and Balthazard formula for concurrent injuries.
 */

import type { CaseType } from '@/types';
import { calculateDannoBiologico, normativeStalenessNote, type DannoBiologicoResult } from './bareme-tables';
import { calculateMilano, type MilanoResult } from './tabelle-milano';

interface CalcEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
}

/**
 * Indicative percentage ranges per case type (literature-based).
 * Min/max represent typical ranges — the expert decides the actual percentage.
 */
const CASE_TYPE_RANGES: Partial<Record<CaseType, { min: number; max: number; notes: string }>> = {
  ortopedica: {
    min: 5,
    max: 30,
    notes: 'Range tipico ortopedica: 5-15% fratture semplici, 15-30% protesi/complicanze',
  },
  rc_auto: {
    min: 1,
    max: 15,
    notes: 'Range tipico RC auto: 1-9% colpo di frusta/lesioni minori, 10-15% fratture',
  },
  oncologica: {
    min: 15,
    max: 80,
    notes: 'Range tipico oncologica: dipende fortemente da stadio e ritardo diagnostico',
  },
  ostetrica: {
    min: 10,
    max: 100,
    notes: 'Range tipico ostetrica: 10-30% sofferenza fetale recuperata, fino a 100% paralisi cerebrale',
  },
  anestesiologica: {
    min: 5,
    max: 60,
    notes: 'Range tipico anestesiologica: 5-15% reazioni avverse, fino a 60%+ danno neurologico',
  },
  infezione_nosocomiale: {
    min: 3,
    max: 40,
    notes: 'Range tipico infezione nosocomiale: 3-10% infezioni risolte, 15-40% con esiti permanenti',
  },
  errore_diagnostico: {
    min: 5,
    max: 60,
    notes: 'Range ampio: dipende dalla patologia non diagnosticata e dal ritardo',
  },
  perizia_assicurativa: {
    min: 1,
    max: 15,
    notes: 'Range tipico perizia assicurativa RC auto: 1-9% micropermanenti, 10-15% fratture',
  },
  opinione_prognostica: {
    min: 1,
    max: 50,
    notes: 'Range ampio (stima provvisoria): la quantificazione e necessariamente approssimativa in attesa della stabilizzazione dei postumi',
  },
};

export interface DamageEstimate {
  estimatedRange: { min: number; max: number } | null;
  midpointPercentage: number | null;
  reasoning: string;
  lookupResult: DannoBiologicoResult | null;
  milanoComparison: MilanoResult | null;
  balthazardNote: string | null;
  tableSelectionNote: string | null;
}

/**
 * Data di entrata in vigore della TUN (DPR 13 gennaio 2025, n. 12).
 * FONTE: GU Serie Generale n. 40 del 18/02/2025, S.O. n. 4 — «Entrata in
 * vigore del provvedimento: 05/03/2025» (verificato su GU il 2026-06-10;
 * confermato testualmente da Cass. civ., Sez. III, 07/04/2026, n. 8630).
 * NB: la precedente costante '2025-03-25' era ERRATA di 20 giorni.
 */
const TUN_EFFECTIVE_DATE = '2025-03-05';

/**
 * Estimate biological damage based on case type and events.
 * Returns an indicative range and a table lookup on the midpoint.
 *
 * Routing tabellare (Cass. civ., Sez. III, 07/04/2026, n. 8630 — principio di
 * diritto su rinvio pregiudiziale ex art. 363-bis c.p.c.):
 * - fatti ≥ 05/03/2025 in RCA/sanitaria → TUN ad applicazione DIRETTA
 * - fatti anteriori o illeciti fuori ambito → TUN comunque parametro
 *   privilegiato della valutazione equitativa (applicazione INDIRETTA ex
 *   artt. 1226/2056 c.c.); le tabelle pretorie (Milano ed. 2024) restano
 *   applicabili solo con motivazione puntuale su circostanze del tutto peculiari
 * - in ogni caso il confronto Milano è fornito a supporto della motivazione
 */
export function estimateBiologicalDamage(
  events: CalcEvent[],
  caseType: CaseType,
  incidentDate?: string,
  todayIso?: string,
): DamageEstimate {
  const range = CASE_TYPE_RANGES[caseType];

  if (!range) {
    return {
      estimatedRange: null,
      midpointPercentage: null,
      reasoning: `Nessuna fascia indicativa disponibile per il tipo caso "${caseType}". Il perito deve valutare autonomamente.`,
      lookupResult: null,
      milanoComparison: null,
      balthazardNote: null,
      tableSelectionNote: null,
    };
  }

  // Refine range based on event signals
  const refinedRange = refineRange(range, events, caseType);

  const midpoint = Math.round((refinedRange.min + refinedRange.max) / 2);

  // Determine table-selection note based on incident date (TUN is always the
  // primary lookup after Cass. 8630/2026 — diretta o indiretta che sia).
  const tableSelectionNote = buildTableSelectionNote(incidentDate, todayIso);

  const lookupResult: DannoBiologicoResult | null = calculateDannoBiologico(midpoint);
  const milanoComparison: MilanoResult | null = buildMilanoComparison(midpoint);

  // Balthazard note when multiple surgeries suggest concurrent injuries
  const balthazardNote = buildBalthazardNote(events);

  return {
    estimatedRange: { min: refinedRange.min, max: refinedRange.max },
    midpointPercentage: midpoint,
    reasoning: `${range.notes}. Stima indicativa: ${refinedRange.min}-${refinedRange.max}% (punto medio: ${midpoint}%).`,
    lookupResult,
    milanoComparison,
    balthazardNote,
    tableSelectionNote,
  };
}

/**
 * Nota sul routing tabellare per il perito, allineata a Cass. civ., Sez. III,
 * 07/04/2026, n. 8630: TUN sempre parametro privilegiato (diretta per fatti
 * ≥ 05/03/2025 in RCA/sanitaria, indiretta negli altri casi); Milano residuale
 * con motivazione puntuale. Appende l'avviso di staleness dei valori normativi
 * quando i dati hardcoded non vengono ri-verificati da troppo tempo.
 */
function buildTableSelectionNote(incidentDate?: string, todayIso?: string): string {
  const staleness = normativeStalenessNote(todayIso);
  const stalenessSuffix = staleness ? ` ${staleness}` : '';

  if (!incidentDate) {
    return 'Data sinistro non disponibile. '
      + 'Utilizzata TUN (DPR 12/2025, agg. D.M. 10/12/2025) come tabella primaria con confronto Tabelle Milano 2024. '
      + 'Il perito deve verificare la data del sinistro: per fatti anteriori al 05/03/2025 la TUN si applica in via indiretta (Cass. 8630/2026).'
      + stalenessSuffix;
  }

  if (incidentDate >= TUN_EFFECTIVE_DATE) {
    return `Sinistro del ${incidentDate} (≥ ${TUN_EFFECTIVE_DATE}): `
      + 'negli ambiti RC auto/natanti e responsabilità sanitaria si applica la Tabella Unica Nazionale '
      + '(DPR 12/2025, agg. D.M. 10/12/2025) in via DIRETTA. Confronto con Tabelle Milano 2024 fornito a titolo indicativo.'
      + stalenessSuffix;
  }

  return `Sinistro del ${incidentDate} (anteriore al ${TUN_EFFECTIVE_DATE}): `
    + 'per Cass. civ., Sez. III, 07/04/2026, n. 8630 la TUN trova comunque applicazione generalizzata in via INDIRETTA, '
    + 'quale parametro privilegiato della valutazione equitativa (artt. 1226 e 2056 c.c.); il giudice può applicare una '
    + 'tabella pretoria (es. Milano ed. 2024, qui fornita a confronto) solo con motivazione puntuale su circostanze del tutto peculiari.'
    + stalenessSuffix;
}

/**
 * Refine the range based on event signals (surgery count, complications, etc.).
 */
function refineRange(
  baseRange: { min: number; max: number },
  events: CalcEvent[],
  caseType: CaseType,
): { min: number; max: number } {
  let { min, max } = baseRange;

  const hasSurgery = events.some((e) => e.event_type === 'intervento');
  const hasComplication = events.some((e) => e.event_type === 'complicanza');
  const surgeryCount = events.filter((e) => e.event_type === 'intervento').length;

  // Multiple surgeries → higher range
  if (surgeryCount > 1) {
    min = Math.min(min + 5, max);
  }

  // Complications → higher range
  if (hasComplication) {
    min = Math.min(min + 3, max);
  }

  // No surgery in ortopedica → likely minor, lower range
  if (caseType === 'ortopedica' && !hasSurgery) {
    max = Math.min(max, 15);
  }

  // RC auto without surgery → micro range
  if (caseType === 'rc_auto' && !hasSurgery) {
    max = Math.min(max, 9);
  }

  return { min, max };
}

/**
 * Build Milano comparison estimate for macropermanenti (>= 10%).
 * Uses default age 35 when age is unknown.
 *
 * @param isPrimary - When true, always attempt lookup (Milano is the primary table)
 */
function buildMilanoComparison(
  midpoint: number,
): MilanoResult | null {
  // Milano tables only cover macropermanenti (10-100%)
  if (midpoint < 10) return null;

  // Default age 35 when patient age is unknown
  return calculateMilano(midpoint, 35);
}

/**
 * Build a note suggesting Balthazard formula when multiple surgeries
 * indicate potentially concurrent or sequential injuries.
 */
function buildBalthazardNote(events: CalcEvent[]): string | null {
  const surgeryCount = events.filter(
    (e) => e.event_type === 'intervento',
  ).length;

  if (surgeryCount < 2) return null;

  return `Rilevati ${surgeryCount} interventi chirurgici. `
    + 'In caso di lesioni plurime o concorrenti, considerare la formula di Balthazard '
    + 'per il calcolo della invalidazione complessiva '
    + '(IP_tot = IP_a + IP_b - IP_a*IP_b/100).';
}
