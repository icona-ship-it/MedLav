/**
 * Damage estimation service that uses barème tables
 * to provide indicative biological damage ranges by case type.
 *
 * Integrates TUN (DPR 12/2025), Tabelle Milano 2024,
 * and Balthazard formula for concurrent injuries.
 */

import type { CaseType } from '@/types';
import { calculateDannoBiologico, type DannoBiologicoResult } from './bareme-tables';
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
 * TUN (DPR 12/2025) applies to incidents from 2025-03-25 onwards.
 * For earlier incidents, Tabelle Milano 2024 are the primary reference.
 */
const TUN_EFFECTIVE_DATE = '2025-03-25';

/**
 * Estimate biological damage based on case type and events.
 * Returns an indicative range and a table lookup on the midpoint.
 *
 * Table selection logic based on incident date:
 * - incidentDate >= 2025-03-25 → TUN primary (DPR 12/2025)
 * - incidentDate < 2025-03-25 → Milano primary, TUN as secondary comparison
 * - no incidentDate → TUN primary with Milano comparison (default)
 */
export function estimateBiologicalDamage(
  events: CalcEvent[],
  caseType: CaseType,
  incidentDate?: string,
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

  // Determine table selection based on incident date
  const { useTunAsPrimary, tableSelectionNote } = resolveTableSelection(incidentDate);

  let lookupResult: DannoBiologicoResult | null;
  let milanoComparison: MilanoResult | null;

  if (useTunAsPrimary) {
    // TUN as primary, Milano as secondary comparison for macropermanenti
    lookupResult = calculateDannoBiologico(midpoint);
    milanoComparison = buildMilanoComparison(midpoint);
  } else {
    // Milano as primary, TUN as secondary comparison
    milanoComparison = buildMilanoComparison(midpoint, true);
    lookupResult = calculateDannoBiologico(midpoint);
  }

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
 * Resolve which table to use as primary based on incident date.
 */
function resolveTableSelection(incidentDate?: string): {
  useTunAsPrimary: boolean;
  tableSelectionNote: string;
} {
  if (!incidentDate) {
    return {
      useTunAsPrimary: true,
      tableSelectionNote: 'Data sinistro non disponibile. '
        + 'Utilizzata TUN (DPR 12/2025) come tabella primaria con confronto Tabelle Milano 2024. '
        + 'Il perito deve verificare la data del sinistro per determinare la tabella applicabile.',
    };
  }

  if (incidentDate >= TUN_EFFECTIVE_DATE) {
    return {
      useTunAsPrimary: true,
      tableSelectionNote: `Sinistro del ${incidentDate} (>= ${TUN_EFFECTIVE_DATE}): `
        + 'si applica la Tabella Unica Nazionale (DPR 12/2025) come tabella primaria. '
        + 'Confronto con Tabelle Milano 2024 fornito a titolo indicativo.',
    };
  }

  return {
    useTunAsPrimary: false,
    tableSelectionNote: `Sinistro del ${incidentDate} (< ${TUN_EFFECTIVE_DATE}): `
      + 'si applicano le Tabelle Milano 2024 come tabella primaria. '
      + 'Confronto con TUN (DPR 12/2025) fornito a titolo indicativo.',
  };
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
  _isPrimary: boolean = false,
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
