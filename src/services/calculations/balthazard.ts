/**
 * Balthazard formula for concurrent/preexisting injuries.
 *
 * When a subject has multiple injuries (concurrent or preexisting),
 * the total invalidation is NOT the arithmetic sum. The Balthazard
 * formula accounts for the "remaining capacity" principle:
 *
 *   IP_total = IP_a + IP_b - (IP_a * IP_b / 100)
 *
 * For multiple injuries, the formula is applied iteratively.
 *
 * Example: IP_a = 20%, IP_b = 30%
 *   IP_total = 20 + 30 - (20 * 30 / 100) = 44% (not 50%)
 *
 * This is the standard formula used in Italian medico-legal practice.
 */

// --- Types ---

export interface BalthazardStep {
  previousTotal: number;
  addedPercentage: number;
  newTotal: number;
  formulaApplied: string;
}

export interface BalthazardResult {
  combinedPercentage: number;
  inputPercentages: readonly number[];
  steps: readonly BalthazardStep[];
  formulaDescription: string;
  notes: string;
}

/**
 * Apply the Balthazard formula to combine two invalidation percentages.
 */
function balthazardPair(ipA: number, ipB: number): number {
  return ipA + ipB - (ipA * ipB / 100);
}

/**
 * Calculate the combined invalidation using the Balthazard formula.
 *
 * @param percentages - Array of individual invalidation percentages (0-100 each)
 * @returns BalthazardResult with combined percentage and step-by-step breakdown
 */
export function calculateBalthazard(
  percentages: readonly number[],
): BalthazardResult {
  if (percentages.length === 0) {
    return {
      combinedPercentage: 0,
      inputPercentages: [],
      steps: [],
      formulaDescription: 'Nessuna percentuale fornita.',
      notes: 'Inserire almeno una percentuale di invalidazione.',
    };
  }

  // Validate all percentages
  const invalidIdx = percentages.findIndex((p) => p < 0 || p > 100);
  if (invalidIdx !== -1) {
    return {
      combinedPercentage: 0,
      inputPercentages: percentages,
      steps: [],
      formulaDescription: 'Errore di validazione.',
      notes: `Percentuale non valida all'indice ${invalidIdx}: ${percentages[invalidIdx]}%. Ogni valore deve essere compreso tra 0 e 100.`,
    };
  }

  if (percentages.length === 1) {
    return {
      combinedPercentage: round2(percentages[0]),
      inputPercentages: percentages,
      steps: [],
      formulaDescription: `IP unica: ${percentages[0]}%`,
      notes: 'Con una sola invalidazione, la formula di Balthazard non si applica.',
    };
  }

  // Sort descending for conventional application (largest first)
  const sorted = [...percentages].sort((a, b) => b - a);
  const steps: BalthazardStep[] = [];
  let running = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const previousTotal = running;
    const added = sorted[i];
    running = balthazardPair(running, added);
    const newTotal = round2(running);

    steps.push({
      previousTotal: round2(previousTotal),
      addedPercentage: added,
      newTotal,
      formulaApplied: `${round2(previousTotal)} + ${added} - (${round2(previousTotal)} x ${added} / 100) = ${newTotal}`,
    });
  }

  const combinedPercentage = round2(running);
  const inputList = sorted.map((p) => `${p}%`).join(' + ');

  return {
    combinedPercentage,
    inputPercentages: percentages,
    steps,
    formulaDescription: `Balthazard: ${inputList} => ${combinedPercentage}% (somma aritmetica: ${round2(sorted.reduce((a, b) => a + b, 0))}%)`,
    notes: 'Formula di Balthazard applicata iterativamente in ordine decrescente. '
      + 'Il risultato e sempre inferiore alla somma aritmetica delle singole invalidazioni.',
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
