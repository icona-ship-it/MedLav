import { describe, it, expect } from 'vitest';
import { findStepNumber, PROCESSING_STEP_LABEL } from './wizard-steps';

const FULL = [
  { number: 1, label: 'Documenti' },
  { number: 2, label: 'Info Perizia' },
  { number: 3, label: 'Elaborazione' },
  { number: 4, label: 'Perizia' },
];
const EXTRACTION = [
  { number: 1, label: 'Documenti' },
  { number: 2, label: 'Elaborazione' },
  { number: 3, label: 'Cronistoria' },
];

describe('findStepNumber — il passo Elaborazione si cerca per etichetta, non per numero', () => {
  it('should return 3 for the RC wizard and 2 for the cronistoria wizard', () => {
    expect(findStepNumber(FULL, PROCESSING_STEP_LABEL, 3)).toBe(3);
    expect(findStepNumber(EXTRACTION, PROCESSING_STEP_LABEL, 3)).toBe(2);
  });

  it('should never return the Info Perizia step for the RC wizard', () => {
    expect(findStepNumber(FULL, PROCESSING_STEP_LABEL, 3)).not.toBe(2);
  });

  it('should fall back when the label is absent (empty or foreign wizard)', () => {
    expect(findStepNumber([], PROCESSING_STEP_LABEL, 3)).toBe(3);
    expect(findStepNumber([{ number: 1, label: 'Altro' }], PROCESSING_STEP_LABEL, 2)).toBe(2);
  });
});
