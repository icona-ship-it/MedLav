import { describe, it, expect } from 'vitest';
import { detectCriticalClinicalValues } from './clinical-values-detector';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

function makeEvent(overrides: Partial<ConsolidatedEvent> = {}): ConsolidatedEvent {
  return {
    orderNumber: 1,
    documentId: 'doc-1',
    eventDate: '2024-01-01',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Visita generica',
    description: 'Descrizione generica',
    sourceType: 'cartella_clinica',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 0.9,
    requiresVerification: false,
    reliabilityNotes: null,
    discrepancyNote: null,
    sourceText: '',
    sourcePages: [],
    ...overrides,
  };
}

describe('clinical-values-detector', () => {
  describe('detectCriticalClinicalValues', () => {
    it('should detect critical systolic blood pressure (230/120)', () => {
      const events = [
        makeEvent({ description: 'PA: 230/120 mmHg, paziente iperteso' }),
      ];

      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].anomalyType).toBe('valore_clinico_critico');
      expect(anomalies[0].description).toContain('230');
    });

    it('should detect critical SpO2 (85%)', () => {
      const events = [
        makeEvent({ description: 'SpO2: 85%, paziente in distress respiratorio' }),
      ];

      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some((a) => a.description.includes('Saturazione'))).toBe(true);
    });

    it('should not flag normal values', () => {
      const events = [
        makeEvent({ description: 'PA: 120/80 mmHg, FC: 72 bpm, SpO2: 98%' }),
      ];

      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies).toHaveLength(0);
    });

    it('should handle Italian decimal format (comma)', () => {
      const events = [
        makeEvent({ description: 'Emoglobina Hb: 5,2 g/dL, paziente anemico' }),
      ];

      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].description).toContain('Emoglobina');
    });

    it('should detect critical heart rate', () => {
      const events = [
        makeEvent({ description: 'FC: 200 bpm, tachicardia sopraventricolare' }),
      ];

      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('should deduplicate same value on same date', () => {
      const events = [
        makeEvent({
          title: 'Visita con PA: 230/120',
          description: 'PA: 230/120 mmHg',
        }),
      ];

      const anomalies = detectCriticalClinicalValues(events);
      // Should have at most one anomaly per pattern per date
      const systolicAnomalies = anomalies.filter((a) => a.description.includes('sistolica'));
      expect(systolicAnomalies.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for events without numeric values', () => {
      const events = [
        makeEvent({ description: 'Paziente in buone condizioni generali' }),
      ];

      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies).toHaveLength(0);
    });
  });
});
