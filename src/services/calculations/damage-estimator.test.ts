import { describe, it, expect } from 'vitest';
import { estimateBiologicalDamage } from './damage-estimator';

function makeCalcEvent(overrides: Partial<{
  event_date: string;
  event_type: string;
  title: string;
  description: string;
}> = {}) {
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
    it('should return range for ortopedica', () => {
      const events = [
        makeCalcEvent({ event_type: 'intervento', title: 'Artroprotesi ginocchio' }),
      ];

      const result = estimateBiologicalDamage(events, 'ortopedica');
      expect(result.estimatedRange).not.toBeNull();
      expect(result.estimatedRange!.min).toBeGreaterThanOrEqual(5);
      expect(result.estimatedRange!.max).toBeLessThanOrEqual(30);
      expect(result.lookupResult).not.toBeNull();
    });

    it('should return lower range for rc_auto without surgery', () => {
      const events = [
        makeCalcEvent({ event_type: 'visita', title: 'Visita PS post sinistro' }),
        makeCalcEvent({ event_type: 'esame', title: 'RX rachide cervicale' }),
      ];

      const result = estimateBiologicalDamage(events, 'rc_auto');
      expect(result.estimatedRange).not.toBeNull();
      expect(result.estimatedRange!.max).toBeLessThanOrEqual(9);
    });

    it('should return null range for unknown case type', () => {
      const events = [makeCalcEvent()];
      const result = estimateBiologicalDamage(events, 'generica');
      expect(result.estimatedRange).toBeNull();
      expect(result.lookupResult).toBeNull();
    });

    it('should increase range when complications are present', () => {
      const eventsNoComplication = [
        makeCalcEvent({ event_type: 'intervento', title: 'Intervento' }),
      ];
      const eventsWithComplication = [
        makeCalcEvent({ event_type: 'intervento', title: 'Intervento' }),
        makeCalcEvent({ event_type: 'complicanza', title: 'Infezione post-operatoria' }),
      ];

      const noComp = estimateBiologicalDamage(eventsNoComplication, 'ortopedica');
      const withComp = estimateBiologicalDamage(eventsWithComplication, 'ortopedica');

      expect(withComp.estimatedRange!.min).toBeGreaterThanOrEqual(noComp.estimatedRange!.min);
    });

    it('should provide a midpoint percentage', () => {
      const events = [makeCalcEvent({ event_type: 'intervento' })];
      const result = estimateBiologicalDamage(events, 'ortopedica');
      expect(result.midpointPercentage).toBeGreaterThan(0);
    });
  });
});
