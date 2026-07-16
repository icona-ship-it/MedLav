import { describe, it, expect } from 'vitest';
import { CREDIT_COSTS, PLAN_CREDITS, getElaborationCost } from './credit-costs';

describe('CREDIT_COSTS', () => {
  it('should price every metered operation with a non-negative integer', () => {
    // Eccezione DOCUMENTATA: `categorizzazione` è gratuita (0) — vedi test trappola-trial
    // sotto. Il vettore denial-of-wallet resta chiuso dal rate-limit sui route classify.
    for (const [op, cost] of Object.entries(CREDIT_COSTS)) {
      if (op === 'categorizzazione') continue;
      expect(cost, op).toBeGreaterThan(0);
      expect(Number.isInteger(cost), op).toBe(true);
    }
  });

  it('should keep categorization FREE so the trial grant always covers one full analysis (trappola-trial)', () => {
    // Trappola-trial (smoke test 2026-07-14): trial = 30 crediti = esattamente 1 analisi
    // completa. Se la categorizzazione costasse anche solo 1 credito, chi categorizza
    // PRIMA di avviare l'analisi resterebbe a 29 e non potrebbe più avviarla (vicolo
    // cieco al primo caso). Invariante: categorizzare N documenti non deve mai erodere
    // la capacità del trial di pagare l'analisi completa.
    expect(CREDIT_COSTS.categorizzazione).toBe(0);
    expect(PLAN_CREDITS.trial.initialGrant).toBeGreaterThanOrEqual(CREDIT_COSTS.elaborazione_completa);
  });

  it('should define the newly-metered free endpoints', () => {
    // These operations used to be free (denial-of-wallet vectors) and are now
    // billed — regressing them to 0 / removing them would re-open the hole.
    expect(CREDIT_COSTS.rigenerazione_report).toBeGreaterThan(0);
    expect(CREDIT_COSTS.rigenerazione_sezione).toBeGreaterThan(0);
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
