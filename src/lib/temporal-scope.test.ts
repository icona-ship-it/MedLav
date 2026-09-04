import { describe, it, expect } from 'vitest';
import {
  TEMPORAL_SCOPES,
  normalizeTemporalScope,
  temporalScopeRank,
  TEMPORAL_SCOPE_LABELS,
} from './temporal-scope';

/**
 * Ambito temporale di un evento (feedback medici 2026-08-19 Mail 2 / collaudo
 * 2026-09-04): un referto di visita di 3 pagine veniva esploso in 12 eventi
 * cronologici. L'etichetta distingue ciò che ACCADE nel documento (corrente)
 * da ciò che vi è solo RIFERITO (retrospettivo) o PREVISTO (programmato).
 */
describe('temporal-scope', () => {
  it('should expose exactly the three scopes, with corrente as the safe default', () => {
    expect([...TEMPORAL_SCOPES]).toEqual(['corrente', 'retrospettivo', 'programmato']);
    expect(normalizeTemporalScope(undefined)).toBe('corrente');
    expect(normalizeTemporalScope(null)).toBe('corrente');
    expect(normalizeTemporalScope('')).toBe('corrente');
  });

  it('should accept valid values (case/space tolerant) and reject anything else', () => {
    expect(normalizeTemporalScope('retrospettivo')).toBe('retrospettivo');
    expect(normalizeTemporalScope(' Programmato ')).toBe('programmato');
    expect(normalizeTemporalScope('CORRENTE')).toBe('corrente');
    // Valori fuori enum (LLM creativo, colonna legacy): MAI propagare — default.
    expect(normalizeTemporalScope('retrospective')).toBe('corrente');
    expect(normalizeTemporalScope('futuro')).toBe('corrente');
    expect(normalizeTemporalScope(42)).toBe('corrente');
    expect(normalizeTemporalScope({})).toBe('corrente');
  });

  it('INVARIANTE: corrente vince sempre su programmato e retrospettivo nel rank', () => {
    expect(temporalScopeRank('corrente')).toBeLessThan(temporalScopeRank('programmato'));
    expect(temporalScopeRank('programmato')).toBeLessThan(temporalScopeRank('retrospettivo'));
    expect(temporalScopeRank(undefined)).toBe(temporalScopeRank('corrente'));
  });

  it('should have an Italian label for every scope', () => {
    for (const s of TEMPORAL_SCOPES) expect(TEMPORAL_SCOPE_LABELS[s].length).toBeGreaterThan(3);
  });
});
