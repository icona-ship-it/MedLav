/**
 * Gabrielli formula for preexisting conditions.
 *
 * When a patient has a preexisting invalidation, the new injury's
 * effective contribution must be calculated by subtracting the
 * preexisting condition. The Gabrielli formula determines the
 * ADDITIONAL damage attributable solely to the new injury:
 *
 *   IP_effective = ((IP_total - IP_preexisting) / (100 - IP_preexisting)) * 100
 *
 * This is the standard Italian medico-legal approach to isolating
 * the damage caused by the new event from the preexisting condition.
 *
 * Example: IP_total = 40%, IP_preexisting = 20%
 *   IP_effective = ((40 - 20) / (100 - 20)) * 100 = 25%
 *   The new injury is "worth" 25% of the remaining capacity.
 */

// --- Types ---

export interface GabrielliResult {
  effectivePercentage: number;
  totalPercentage: number;
  preexistingPercentage: number;
  formulaApplied: string;
  explanation: string;
  notes: string;
}

/**
 * Calculate the effective additional damage using the Gabrielli formula.
 *
 * @param totalPercentage - Total invalidation after the new injury (0-100)
 * @param preexistingPercentage - Preexisting invalidation before the injury (0-100)
 * @returns GabrielliResult with effective percentage and explanation
 */
export function calculateGabrielli(
  totalPercentage: number,
  preexistingPercentage: number,
): GabrielliResult {
  // Validate inputs
  if (totalPercentage < 0 || totalPercentage > 100) {
    return makeError(
      totalPercentage,
      preexistingPercentage,
      `Percentuale totale non valida: ${totalPercentage}%. Deve essere compresa tra 0 e 100.`,
    );
  }

  if (preexistingPercentage < 0 || preexistingPercentage > 100) {
    return makeError(
      totalPercentage,
      preexistingPercentage,
      `Percentuale preesistente non valida: ${preexistingPercentage}%. Deve essere compresa tra 0 e 100.`,
    );
  }

  if (preexistingPercentage >= 100) {
    return makeError(
      totalPercentage,
      preexistingPercentage,
      'La percentuale preesistente non puo essere 100%: nessuna capacita residua disponibile.',
    );
  }

  if (totalPercentage < preexistingPercentage) {
    return makeError(
      totalPercentage,
      preexistingPercentage,
      `La percentuale totale (${totalPercentage}%) non puo essere inferiore alla preesistente (${preexistingPercentage}%).`,
    );
  }

  // Edge case: no preexisting condition
  if (preexistingPercentage === 0) {
    return {
      effectivePercentage: totalPercentage,
      totalPercentage,
      preexistingPercentage,
      formulaApplied: `Nessuna preesistenza. IP effettiva = ${totalPercentage}%`,
      explanation: 'In assenza di preesistenza, il danno effettivo coincide con il danno totale.',
      notes: 'Formula di Gabrielli non necessaria in assenza di preesistenza.',
    };
  }

  // Edge case: no new damage
  if (totalPercentage === preexistingPercentage) {
    return {
      effectivePercentage: 0,
      totalPercentage,
      preexistingPercentage,
      formulaApplied: `IP totale = IP preesistente = ${totalPercentage}%. Nessun danno aggiuntivo.`,
      explanation: 'La percentuale totale coincide con quella preesistente: nessun danno aggiuntivo rilevato.',
      notes: 'Il nuovo evento non ha determinato un incremento della invalidazione.',
    };
  }

  // Apply Gabrielli formula
  const numerator = totalPercentage - preexistingPercentage;
  const denominator = 100 - preexistingPercentage;
  const effectivePercentage = round2((numerator / denominator) * 100);

  const formulaApplied =
    `((${totalPercentage} - ${preexistingPercentage}) / (100 - ${preexistingPercentage})) x 100 = `
    + `(${numerator} / ${denominator}) x 100 = ${effectivePercentage}%`;

  return {
    effectivePercentage,
    totalPercentage,
    preexistingPercentage,
    formulaApplied,
    explanation:
      `Il soggetto presentava una invalidazione preesistente del ${preexistingPercentage}%. `
      + `L'invalidazione totale post-evento e del ${totalPercentage}%. `
      + `Applicando la formula di Gabrielli, il danno effettivamente attribuibile `
      + `al nuovo evento e pari al ${effectivePercentage}% della capacita residua.`,
    notes: 'La formula di Gabrielli isola il danno attribuibile al nuovo evento, '
      + 'escludendo la componente preesistente. '
      + 'Il valore rappresenta la percentuale della capacita residua perduta.',
  };
}

function makeError(
  totalPercentage: number,
  preexistingPercentage: number,
  errorMessage: string,
): GabrielliResult {
  return {
    effectivePercentage: 0,
    totalPercentage,
    preexistingPercentage,
    formulaApplied: 'N/A',
    explanation: errorMessage,
    notes: 'Errore nei parametri di input. Verificare i valori inseriti.',
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
