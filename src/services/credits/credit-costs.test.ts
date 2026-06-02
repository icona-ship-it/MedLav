import { describe, it, expect } from 'vitest';
import { CREDIT_COSTS, getElaborationCost } from './credit-costs';

describe('CREDIT_COSTS', () => {
  it('should price every metered operation with a positive integer', () => {
    for (const [op, cost] of Object.entries(CREDIT_COSTS)) {
      expect(cost, op).toBeGreaterThan(0);
      expect(Number.isInteger(cost), op).toBe(true);
    }
  });

  it('should define the newly-metered free endpoints', () => {
    // These operations used to be free (denial-of-wallet vectors) and are now
    // billed — regressing them to 0 / removing them would re-open the hole.
    expect(CREDIT_COSTS.quesito).toBe(1);
    expect(CREDIT_COSTS.organizzazione_documenti).toBe(1);
    expect(CREDIT_COSTS.rigenerazione_report).toBeGreaterThan(0);
  });
});

describe('getElaborationCost', () => {
  it('should map full pipeline to the full elaboration cost', () => {
    expect(getElaborationCost('full')).toBe(CREDIT_COSTS.elaborazione_completa);
  });

  it('should map each known pipeline mode to its cost', () => {
    expect(getElaborationCost('extraction_only')).toBe(CREDIT_COSTS.elaborazione_estrazione);
    expect(getElaborationCost('expenses_only')).toBe(CREDIT_COSTS.elaborazione_spese);
    expect(getElaborationCost('anonymize_only')).toBe(CREDIT_COSTS.elaborazione_anonimizzazione);
  });

  it('should fall back to the full cost for an unknown mode (never free)', () => {
    expect(getElaborationCost('something_unknown')).toBe(CREDIT_COSTS.elaborazione_completa);
  });
});
