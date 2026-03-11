/**
 * Damage estimation service that uses barème tables
 * to provide indicative biological damage ranges by case type.
 */

import type { CaseType } from '@/types';
import { calculateDannoBiologico, type DannoBiologicoResult } from './bareme-tables';

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
}

/**
 * Estimate biological damage based on case type and events.
 * Returns an indicative range and a table lookup on the midpoint.
 */
export function estimateBiologicalDamage(
  events: CalcEvent[],
  caseType: CaseType,
): DamageEstimate {
  const range = CASE_TYPE_RANGES[caseType];

  if (!range) {
    return {
      estimatedRange: null,
      midpointPercentage: null,
      reasoning: `Nessuna fascia indicativa disponibile per il tipo caso "${caseType}". Il perito deve valutare autonomamente.`,
      lookupResult: null,
    };
  }

  // Refine range based on event signals
  const refinedRange = refineRange(range, events, caseType);

  const midpoint = Math.round((refinedRange.min + refinedRange.max) / 2);
  const lookupResult = calculateDannoBiologico(midpoint);

  return {
    estimatedRange: { min: refinedRange.min, max: refinedRange.max },
    midpointPercentage: midpoint,
    reasoning: `${range.notes}. Stima indicativa: ${refinedRange.min}-${refinedRange.max}% (punto medio: ${midpoint}%).`,
    lookupResult,
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
