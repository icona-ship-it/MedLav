import { describe, it, expect } from 'vitest';
import { estimateBiologicalDamage } from './damage-estimator';
import type { CaseType } from '@/types';

interface TestEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
}

function makeCalcEvent(overrides: Partial<TestEvent> = {}): TestEvent {
  return {
    event_date: '2024-01-01',
    event_type: 'visita',
    title: 'Visita',
    description: 'Descrizione',
    ...overrides,
  };
}

describe('damage-estimator', () => {
  describe('estimateBiologicalDamage', () => {
    it('should return range for ortopedica case', () => {
      // Arrange
      const events = [
        makeCalcEvent({ event_type: 'intervento', title: 'Artroprotesi ginocchio' }),
      ];

      // Act
      const result = estimateBiologicalDamage(events, 'ortopedica');

      // Assert
      expect(result.estimatedRange).not.toBeNull();
      expect(result.estimatedRange!.min).toBeGreaterThanOrEqual(5);
      expect(result.estimatedRange!.max).toBeLessThanOrEqual(30);
      expect(result.lookupResult).not.toBeNull();
      expect(result.reasoning).toContain('ortopedica');
    });

    it('should return lower range for rc_auto without surgery', () => {
      // Arrange
      const events = [
        makeCalcEvent({ event_type: 'visita', title: 'Visita PS post sinistro' }),
        makeCalcEvent({ event_type: 'esame', title: 'RX rachide cervicale' }),
      ];

      // Act
      const result = estimateBiologicalDamage(events, 'rc_auto');

      // Assert
      expect(result.estimatedRange).not.toBeNull();
      expect(result.estimatedRange!.max).toBeLessThanOrEqual(9);
      expect(result.reasoning).toContain('RC auto');
    });

    it('should return range for oncologica case', () => {
      // Arrange
      const events = [makeCalcEvent({ event_type: 'visita' })];

      // Act
      const result = estimateBiologicalDamage(events, 'oncologica');

      // Assert
      expect(result.estimatedRange).not.toBeNull();
      expect(result.estimatedRange!.min).toBeGreaterThanOrEqual(15);
      expect(result.estimatedRange!.max).toBeLessThanOrEqual(80);
    });

    it('should return null estimate for case type with no range', () => {
      // Arrange — 'generica' has no range in CASE_TYPE_RANGES
      const events = [makeCalcEvent()];

      // Act
      const result = estimateBiologicalDamage(events, 'generica');

      // Assert
      expect(result.estimatedRange).toBeNull();
      expect(result.midpointPercentage).toBeNull();
      expect(result.lookupResult).toBeNull();
      expect(result.milanoComparison).toBeNull();
      expect(result.balthazardNote).toBeNull();
      expect(result.reasoning).toContain('generica');
    });

    it('should include Milano comparison when midpoint >= 10', () => {
      // Arrange — oncologica min=15, max=80 → midpoint well above 10
      const events = [makeCalcEvent({ event_type: 'visita' })];

      // Act
      const result = estimateBiologicalDamage(events, 'oncologica');

      // Assert
      expect(result.milanoComparison).not.toBeNull();
      expect(result.milanoComparison!.percentage).toBeGreaterThanOrEqual(10);
    });

    it('should return null Milano comparison when midpoint < 10', () => {
      // Arrange — rc_auto without surgery: max capped at 9, so midpoint < 10
      const events = [makeCalcEvent({ event_type: 'visita' })];

      // Act
      const result = estimateBiologicalDamage(events, 'rc_auto');

      // Assert
      expect(result.milanoComparison).toBeNull();
    });

    it('should include Balthazard note when multiple surgeries', () => {
      // Arrange
      const events = [
        makeCalcEvent({ event_type: 'intervento', title: 'Primo intervento' }),
        makeCalcEvent({ event_type: 'intervento', title: 'Secondo intervento' }),
      ];

      // Act
      const result = estimateBiologicalDamage(events, 'ortopedica');

      // Assert
      expect(result.balthazardNote).not.toBeNull();
      expect(result.balthazardNote).toContain('Balthazard');
      expect(result.balthazardNote).toContain('2 interventi');
    });

    it('should return null Balthazard note when fewer than 2 surgeries', () => {
      // Arrange
      const events = [
        makeCalcEvent({ event_type: 'intervento', title: 'Unico intervento' }),
      ];

      // Act
      const result = estimateBiologicalDamage(events, 'ortopedica');

      // Assert
      expect(result.balthazardNote).toBeNull();
    });

    it('should increase range when complications are present', () => {
      // Arrange
      const eventsNoComplication = [
        makeCalcEvent({ event_type: 'intervento', title: 'Intervento' }),
      ];
      const eventsWithComplication = [
        makeCalcEvent({ event_type: 'intervento', title: 'Intervento' }),
        makeCalcEvent({ event_type: 'complicanza', title: 'Infezione post-operatoria' }),
      ];

      // Act
      const noComp = estimateBiologicalDamage(eventsNoComplication, 'ortopedica');
      const withComp = estimateBiologicalDamage(eventsWithComplication, 'ortopedica');

      // Assert
      expect(withComp.estimatedRange!.min).toBeGreaterThan(noComp.estimatedRange!.min);
    });

    it('should cap ortopedica max at 15 when no surgery', () => {
      // Arrange — no surgery events
      const events = [makeCalcEvent({ event_type: 'visita' })];

      // Act
      const result = estimateBiologicalDamage(events, 'ortopedica');

      // Assert
      expect(result.estimatedRange!.max).toBeLessThanOrEqual(15);
    });

    it('should provide a midpoint percentage for supported case types', () => {
      // Arrange
      const events = [makeCalcEvent({ event_type: 'intervento' })];

      // Act
      const result = estimateBiologicalDamage(events, 'ortopedica');

      // Assert
      expect(result.midpointPercentage).toBeGreaterThan(0);
    });

    it('should handle all supported case types without error', () => {
      // Arrange
      const allTypes: CaseType[] = [
        'ortopedica', 'oncologica', 'ostetrica', 'anestesiologica',
        'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto', 'generica',
      ];
      const events = [makeCalcEvent()];

      // Act & Assert
      for (const caseType of allTypes) {
        expect(() => estimateBiologicalDamage(events, caseType)).not.toThrow();
      }
    });
  });

  // ── Routing tabellare verificato su fonti ufficiali (2026-06-10) ──
  // GU n. 40/2025 (entrata in vigore TUN: 05/03/2025) + Cass. Sez. III 8630/2026.

  describe('routing tabellare TUN (vigenza 05/03/2025 + Cass. 8630/2026)', () => {
    const events = [makeCalcEvent()];

    it('sinistro tra il 5 e il 25 marzo 2025: TUN DIRETTA (la vecchia costante 2025-03-25 era errata di 20 giorni)', () => {
      const r = estimateBiologicalDamage(events, 'ortopedica', '2025-03-10', '2026-06-10');
      expect(r.tableSelectionNote).toContain('via DIRETTA');
      expect(r.tableSelectionNote).toContain('2025-03-05');
    });

    it('fatti anteriori al 05/03/2025: TUN comunque primaria in via INDIRETTA ex Cass. 8630/2026, Milano residuale', () => {
      const r = estimateBiologicalDamage(events, 'ortopedica', '2024-06-01', '2026-06-10');
      expect(r.tableSelectionNote).toContain('8630');
      expect(r.tableSelectionNote).toMatch(/INDIRETTA/);
      expect(r.tableSelectionNote).toMatch(/motivazione puntuale/i);
      expect(r.lookupResult).not.toBeNull(); // TUN sempre calcolata
    });

    it("staleness: oltre 8 mesi dall'ultima verifica normativa appare l'avviso, prima no", () => {
      const fresh = estimateBiologicalDamage(events, 'ortopedica', '2025-06-01', '2026-07-01');
      expect(fresh.tableSelectionNote).not.toContain('ATTENZIONE');

      const stale = estimateBiologicalDamage(events, 'ortopedica', '2025-06-01', '2027-06-10');
      expect(stale.tableSelectionNote).toContain('ATTENZIONE');
      expect(stale.tableSelectionNote).toContain('2026-06-10'); // data ultima verifica
    });
  });
});
