/**
 * Passi del wizard del caso: i numeri cambiano per modulo (perizia RC a 4
 * passi, cronistoria/spese/anonimizzatore a 3). Chi deve "andare al passo
 * Elaborazione" lo cerca per ETICHETTA, mai per numero fisso: il banner
 * «analisi di una versione precedente» mandava al passo 2, che nella perizia
 * RC è «Info Perizia» (audit 2026-09-10, R2). Pura.
 */

export interface WizardStepLike {
  number: number;
  label: string;
}

export const PROCESSING_STEP_LABEL = 'Elaborazione';

export function findStepNumber(
  steps: ReadonlyArray<WizardStepLike>,
  label: string,
  fallback: number,
): number {
  const found = steps.find((s) => s.label === label);
  return found ? found.number : fallback;
}
