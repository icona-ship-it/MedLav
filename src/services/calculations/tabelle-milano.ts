/**
 * Tabelle Milano 2024 — Biological damage calculation.
 *
 * The Milan Court tables (Tabelle del Tribunale di Milano) are the
 * de facto standard for macropermanenti damage quantification in Italy,
 * used by most courts outside the TUN system.
 *
 * This implementation uses:
 * - Anchor-point base amounts at reference age (~30) with linear interpolation
 * - Per-year age demoltiplicator with linear interpolation between anchor ages
 *
 * Key characteristics:
 * - Progressive total amounts based on percentage and age
 * - Higher amounts for younger victims (longer residual life)
 * - Per-year age precision (not brackets)
 */

// --- Types ---

export interface MilanoResult {
  percentage: number;
  ageAtEvent: number;
  ageUsed: number;
  ageDemoltiplicator: number;
  isInterpolated: boolean;
  estimatedAmount: number;
  perPointValue: number;
  tableReference: string;
  confidence: 'indicativo' | 'da_verificare';
  notes: string;
}

// --- Anchor-point base amounts at reference age (~30) ---

/**
 * Base total amounts at reference age (approximately 30 years old).
 * These represent the TOTAL biological damage for each anchor percentage.
 *
 * Source: Tabelle Milano 2024, realistic approximation from published tables.
 * For percentages between anchors, linear interpolation is applied.
 */
const BASE_AMOUNT_ANCHORS: ReadonlyArray<{ pct: number; amount: number }> = [
  { pct: 10, amount: 27_300 },
  { pct: 15, amount: 60_300 },
  { pct: 20, amount: 105_300 },
  { pct: 25, amount: 163_000 },
  { pct: 30, amount: 235_000 },
  { pct: 40, amount: 422_000 },
  { pct: 50, amount: 660_000 },
  { pct: 60, amount: 940_000 },
  { pct: 70, amount: 1_250_000 },
  { pct: 80, amount: 1_600_000 },
  { pct: 90, amount: 1_990_000 },
  { pct: 100, amount: 2_400_000 },
];

/**
 * Get the base amount for a given percentage by interpolating between anchors.
 * Returns the amount and whether interpolation was used.
 */
function getBaseAmount(percentage: number): { amount: number; isInterpolated: boolean } {
  // Check for exact anchor match
  const exactAnchor = BASE_AMOUNT_ANCHORS.find((a) => a.pct === percentage);
  if (exactAnchor) {
    return { amount: exactAnchor.amount, isInterpolated: false };
  }

  // Find surrounding anchors for interpolation
  const lower = [...BASE_AMOUNT_ANCHORS]
    .filter((a) => a.pct < percentage)
    .sort((a, b) => b.pct - a.pct)[0];
  const upper = BASE_AMOUNT_ANCHORS.find((a) => a.pct > percentage);

  if (!lower || !upper) {
    // Should not happen for 10-100 range, but handle edge case
    const closest = exactAnchor
      ?? lower
      ?? upper
      ?? BASE_AMOUNT_ANCHORS[0];
    return { amount: closest.amount, isInterpolated: true };
  }

  // Linear interpolation
  const ratio = (percentage - lower.pct) / (upper.pct - lower.pct);
  const amount = Math.round(lower.amount + ratio * (upper.amount - lower.amount));
  return { amount, isInterpolated: true };
}

// --- Per-year age demoltiplicator ---

/**
 * Age demoltiplicator anchor points.
 * Values represent the multiplier applied to the base amount.
 * Younger ages have higher multipliers (longer residual life).
 *
 * For ages between anchors, linear interpolation is applied,
 * giving per-year precision.
 */
const AGE_DEMOLTIPLICATOR_ANCHORS: ReadonlyArray<{ age: number; multiplier: number }> = [
  { age: 1, multiplier: 1.000 },
  { age: 10, multiplier: 0.955 },
  { age: 20, multiplier: 0.905 },
  { age: 30, multiplier: 0.856 },
  { age: 40, multiplier: 0.806 },
  { age: 50, multiplier: 0.757 },
  { age: 60, multiplier: 0.708 },
  { age: 70, multiplier: 0.660 },
  { age: 80, multiplier: 0.612 },
  { age: 90, multiplier: 0.565 },
  { age: 100, multiplier: 0.522 },
];

/**
 * Get the age demoltiplicator for a given age by interpolating between anchors.
 */
function getAgeDemoltiplicator(age: number): number {
  // Clamp to anchor range
  const minAge = AGE_DEMOLTIPLICATOR_ANCHORS[0].age;
  const maxAge = AGE_DEMOLTIPLICATOR_ANCHORS[AGE_DEMOLTIPLICATOR_ANCHORS.length - 1].age;
  const clampedAge = Math.max(minAge, Math.min(age, maxAge));

  // Check for exact anchor match
  const exactAnchor = AGE_DEMOLTIPLICATOR_ANCHORS.find((a) => a.age === clampedAge);
  if (exactAnchor) {
    return exactAnchor.multiplier;
  }

  // Find surrounding anchors
  const lower = [...AGE_DEMOLTIPLICATOR_ANCHORS]
    .filter((a) => a.age < clampedAge)
    .sort((a, b) => b.age - a.age)[0];
  const upper = AGE_DEMOLTIPLICATOR_ANCHORS.find((a) => a.age > clampedAge);

  if (!lower || !upper) {
    // Edge case: return nearest anchor
    return (lower ?? upper ?? AGE_DEMOLTIPLICATOR_ANCHORS[0]).multiplier;
  }

  // Linear interpolation between anchor ages
  const ratio = (clampedAge - lower.age) / (upper.age - lower.age);
  const multiplier = lower.multiplier + ratio * (upper.multiplier - lower.multiplier);
  return Math.round(multiplier * 10000) / 10000;
}

/**
 * Calculate biological damage using Tabelle Milano 2024.
 *
 * @param percentage - Invalidation percentage (10-100)
 * @param age - Age at time of event
 * @returns MilanoResult with estimated amount and metadata
 */
export function calculateMilano(
  percentage: number,
  age: number,
): MilanoResult {
  const roundedPercentage = Math.round(percentage);
  const clampedAge = Math.max(0, Math.min(age, 100));

  if (roundedPercentage < 10 || roundedPercentage > 100) {
    return {
      percentage: roundedPercentage,
      ageAtEvent: clampedAge,
      ageUsed: clampedAge,
      ageDemoltiplicator: 0,
      isInterpolated: false,
      estimatedAmount: 0,
      perPointValue: 0,
      tableReference: 'Tabelle Milano 2024',
      confidence: 'da_verificare',
      notes: 'Le Tabelle Milano si applicano solo a macropermanenti (10-100%). Per 1-9% usare Art. 139 CdA.',
    };
  }

  const { amount: baseAmount, isInterpolated } = getBaseAmount(roundedPercentage);
  const ageUsed = clampedAge < 1 ? 1 : clampedAge;
  const ageDemoltiplicator = getAgeDemoltiplicator(ageUsed);

  const estimatedAmount = Math.round(baseAmount * ageDemoltiplicator);
  const perPointValue = Math.round((estimatedAmount / roundedPercentage) * 100) / 100;

  return {
    percentage: roundedPercentage,
    ageAtEvent: clampedAge,
    ageUsed,
    ageDemoltiplicator,
    isInterpolated,
    estimatedAmount,
    perPointValue,
    tableReference: 'Tabelle Milano 2024 (valori approssimati)',
    confidence: 'indicativo',
    notes: `Eta ${ageUsed} anni, demoltiplicatore: ${ageDemoltiplicator}. `
      + `Importo base (rif. eta ~30): ${baseAmount.toLocaleString('it-IT')} EUR. `
      + (isInterpolated ? 'Percentuale interpolata tra valori tabellari. ' : '')
      + 'Valori indicativi — consultare tabelle ufficiali per importo esatto.',
  };
}
