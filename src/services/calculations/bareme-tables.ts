/**
 * Barème tables for Italian biological damage calculation.
 *
 * Two systems:
 * 1. Micropermanenti (1-9%) — Art. 139 Codice delle Assicurazioni Private
 * 2. Macropermanenti (10-100%) — Tabella Unica Nazionale (DPR 12/2025)
 *
 * Values: base 2024, updated yearly via ISTAT.
 */

// --- Micropermanenti (1-9%) ---

const MICROPERMANENTI_BASE_POINT_VALUE = 947.30; // EUR per point (2024)

/**
 * Multiplier coefficient per invalidation percentage (Art. 139 comma 6).
 * Each percentage point gets a progressively higher coefficient.
 */
const MICRO_COEFFICIENTS: Record<number, number> = {
  1: 1.0,
  2: 1.1,
  3: 1.2,
  4: 1.3,
  5: 1.5,
  6: 1.7,
  7: 1.9,
  8: 2.1,
  9: 2.3,
};

// --- Macropermanenti (10-100%) — TUN DPR 12/2025 ---

const TUN_BASE_POINT_VALUE = 947.30; // EUR (same base, 2024)

/**
 * Tavola 1.A — Coefficiente moltiplicatore biologico per punto (10-100%).
 */
const TUN_INVALIDITY_COEFFICIENTS: Record<number, number> = {
  10: 2.75773, 11: 2.91941, 12: 3.07459, 13: 3.22456, 14: 3.37024,
  15: 3.51230, 16: 3.65125, 17: 3.78749, 18: 3.92129, 19: 4.05292,
  20: 4.18254, 21: 4.31033, 22: 4.43640, 23: 4.56086, 24: 4.68379,
  25: 4.80527, 26: 4.92536, 27: 5.04411, 28: 5.16157, 29: 5.27777,
  30: 5.39275, 31: 5.50654, 32: 5.61916, 33: 5.73064, 34: 5.84099,
  35: 5.95024, 36: 6.05840, 37: 6.16548, 38: 6.27149, 39: 6.37645,
  40: 6.48037, 41: 6.58326, 42: 6.68512, 43: 6.78596, 44: 6.88578,
  45: 6.98461, 46: 7.08243, 47: 7.17926, 48: 7.27510, 49: 7.36995,
  50: 7.46382, 51: 7.55671, 52: 7.64863, 53: 7.73958, 54: 7.82955,
  55: 7.91857, 56: 8.00661, 57: 8.09370, 58: 8.17983, 59: 8.26500,
  60: 8.34922, 61: 8.43248, 62: 8.51480, 63: 8.59616, 64: 8.67657,
  65: 8.75604, 66: 8.83456, 67: 8.91214, 68: 8.98877, 69: 9.06446,
  70: 9.13921, 71: 9.21302, 72: 9.28588, 73: 9.35781, 74: 9.42881,
  75: 9.49886, 76: 9.56798, 77: 9.63616, 78: 9.70341, 79: 9.76972,
  80: 9.83510, 81: 9.89954, 82: 9.96305, 83: 10.02563, 84: 10.08728,
  85: 10.14799, 86: 10.20778, 87: 10.26663, 88: 10.32456, 89: 10.38155,
  90: 10.43762, 91: 10.49275, 92: 10.54696, 93: 10.60023, 94: 10.65258,
  95: 10.70401, 96: 10.75450, 97: 10.80407, 98: 10.85270, 99: 10.90042,
  100: 10.94720,
};

/**
 * Tavola 1.B — Coefficiente di riduzione per età (1-100 anni).
 */
const TUN_AGE_COEFFICIENTS: Record<number, number> = {
  1: 1.000, 2: 0.995, 3: 0.990, 4: 0.985, 5: 0.980,
  6: 0.975, 7: 0.970, 8: 0.965, 9: 0.960, 10: 0.955,
  11: 0.950, 12: 0.945, 13: 0.940, 14: 0.935, 15: 0.930,
  16: 0.925, 17: 0.920, 18: 0.915, 19: 0.910, 20: 0.905,
  21: 0.901, 22: 0.896, 23: 0.891, 24: 0.886, 25: 0.881,
  26: 0.876, 27: 0.871, 28: 0.866, 29: 0.861, 30: 0.856,
  31: 0.851, 32: 0.846, 33: 0.841, 34: 0.836, 35: 0.831,
  36: 0.826, 37: 0.821, 38: 0.816, 39: 0.811, 40: 0.806,
  41: 0.801, 42: 0.797, 43: 0.792, 44: 0.787, 45: 0.782,
  46: 0.777, 47: 0.772, 48: 0.767, 49: 0.762, 50: 0.757,
  51: 0.752, 52: 0.747, 53: 0.742, 54: 0.738, 55: 0.733,
  56: 0.728, 57: 0.723, 58: 0.718, 59: 0.713, 60: 0.708,
  61: 0.703, 62: 0.698, 63: 0.694, 64: 0.689, 65: 0.684,
  66: 0.679, 67: 0.674, 68: 0.669, 69: 0.664, 70: 0.660,
  71: 0.655, 72: 0.650, 73: 0.645, 74: 0.640, 75: 0.636,
  76: 0.631, 77: 0.626, 78: 0.621, 79: 0.617, 80: 0.612,
  81: 0.607, 82: 0.602, 83: 0.598, 84: 0.593, 85: 0.588,
  86: 0.584, 87: 0.579, 88: 0.574, 89: 0.570, 90: 0.565,
  91: 0.560, 92: 0.556, 93: 0.551, 94: 0.547, 95: 0.542,
  96: 0.537, 97: 0.533, 98: 0.529, 99: 0.525, 100: 0.522,
};

// --- Public interface ---

export interface DannoBiologicoResult {
  percentage: number;
  tableUsed: string;
  pointValue: number;
  estimatedAmount: number | null;
  ageAtEvent: number | null;
  notes: string;
  confidence: 'suggerito' | 'da_verificare';
}

/**
 * Calculate biological damage from a percentage using the appropriate table.
 * - 1-9%: Micropermanenti (Art. 139 CdA)
 * - 10-100%: TUN (DPR 12/2025)
 */
export function calculateDannoBiologico(
  percentage: number,
  ageAtEvent?: number,
): DannoBiologicoResult {
  if (percentage < 1 || percentage > 100) {
    return {
      percentage,
      tableUsed: 'N/A',
      pointValue: 0,
      estimatedAmount: null,
      ageAtEvent: ageAtEvent ?? null,
      notes: 'Percentuale fuori range (1-100%)',
      confidence: 'da_verificare',
    };
  }

  if (percentage <= 9) {
    return calculateMicropermanenti(percentage, ageAtEvent);
  }

  return calculateMacropermanenti(percentage, ageAtEvent);
}

/**
 * Micropermanenti calculation (1-9%).
 * Formula: base * coefficient * points * ageReduction
 */
function calculateMicropermanenti(
  percentage: number,
  ageAtEvent?: number,
): DannoBiologicoResult {
  const coefficient = MICRO_COEFFICIENTS[percentage] ?? 1.0;
  const baseValue = MICROPERMANENTI_BASE_POINT_VALUE;

  // Age reduction: 0.5% per year from age 11
  let ageReduction = 1.0;
  if (ageAtEvent && ageAtEvent > 10) {
    ageReduction = 1 - (0.005 * (ageAtEvent - 10));
    ageReduction = Math.max(ageReduction, 0.1); // floor
  }

  const amount = baseValue * coefficient * percentage * ageReduction;

  const ageNote = ageAtEvent
    ? ` Coefficiente età (${ageAtEvent} anni): ${ageReduction.toFixed(3)}.`
    : ' Età non specificata — calcolo senza riduzione per età.';

  return {
    percentage,
    tableUsed: 'Art. 139 CdA — Micropermanenti (2024)',
    pointValue: baseValue * coefficient,
    estimatedAmount: Math.round(amount * 100) / 100,
    ageAtEvent: ageAtEvent ?? null,
    notes: `Base: €${baseValue}/punto, coefficiente: ${coefficient}.${ageNote}`,
    confidence: ageAtEvent ? 'suggerito' : 'da_verificare',
  };
}

/**
 * Macropermanenti calculation (10-100%) — TUN.
 * Formula: base * invalidityCoeff * ageCoeff * points
 */
function calculateMacropermanenti(
  percentage: number,
  ageAtEvent?: number,
): DannoBiologicoResult {
  const invalidityCoeff = TUN_INVALIDITY_COEFFICIENTS[percentage];
  if (!invalidityCoeff) {
    return {
      percentage,
      tableUsed: 'TUN DPR 12/2025',
      pointValue: 0,
      estimatedAmount: null,
      ageAtEvent: ageAtEvent ?? null,
      notes: `Coefficiente non disponibile per ${percentage}%`,
      confidence: 'da_verificare',
    };
  }

  const baseValue = TUN_BASE_POINT_VALUE;
  const clampedAge = ageAtEvent ? Math.min(Math.max(ageAtEvent, 1), 100) : undefined;
  const ageCoeff = clampedAge ? (TUN_AGE_COEFFICIENTS[clampedAge] ?? 0.8) : 0.856; // default ~30yo

  const amount = baseValue * invalidityCoeff * ageCoeff * percentage;

  const ageNote = ageAtEvent
    ? ` Coeff. età (${ageAtEvent} anni): ${ageCoeff.toFixed(3)}.`
    : ' Età non specificata — usato coefficiente standard (30 anni).';

  return {
    percentage,
    tableUsed: 'TUN DPR 12/2025 — Macropermanenti',
    pointValue: baseValue * invalidityCoeff,
    estimatedAmount: Math.round(amount * 100) / 100,
    ageAtEvent: ageAtEvent ?? null,
    notes: `Base: €${baseValue}, coeff. invalidità: ${invalidityCoeff.toFixed(5)}.${ageNote}`,
    confidence: ageAtEvent ? 'suggerito' : 'da_verificare',
  };
}

/**
 * Get the micro coefficient for a given percentage (exported for testing).
 */
export function getMicroCoefficient(percentage: number): number | undefined {
  return MICRO_COEFFICIENTS[percentage];
}

/**
 * Get the TUN invalidity coefficient for a given percentage (exported for testing).
 */
export function getTunInvalidityCoefficient(percentage: number): number | undefined {
  return TUN_INVALIDITY_COEFFICIENTS[percentage];
}

/**
 * Get the TUN age coefficient for a given age (exported for testing).
 */
export function getTunAgeCoefficient(age: number): number | undefined {
  return TUN_AGE_COEFFICIENTS[age];
}
