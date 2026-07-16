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

  describe('unità SI dei laboratori italiani (bug "Emoglobina 96 g/dL" impossibile)', () => {
    it('NON flagga Hb 96 g/L (= 9,6 g/dL, non critica) — il referto usa unità SI', () => {
      const events = [
        makeEvent({ description: 'Esami ematochimici: Emoglobina 96,0 g/L, nella norma per il decorso' }),
      ];
      expect(detectCriticalClinicalValues(events)).toHaveLength(0);
    });

    it('flagga Hb 45 g/L (= 4,5 g/dL, davvero critica) col valore CONVERTITO in g/dL', () => {
      const events = [
        makeEvent({ description: 'Emocromo urgente: Emoglobina 45,0 g/L, grave anemia' }),
      ];
      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].description).toContain('4.5 g/dL');
      expect(anomalies[0].description).not.toContain('45 g/dL');
    });

    it('SCARTA un valore implausibile in qualsiasi unità (garbage OCR), non lo flagga', () => {
      // "Hb 96,0" senza unità: impossibile in g/dL (max fisiologico ~25) e
      // normale in g/L — flaggarlo come critico è sempre sbagliato.
      const events = [
        makeEvent({ description: 'Referto: Hb 96,0 riscontrata agli esami del sangue' }),
      ];
      expect(detectCriticalClinicalValues(events)).toHaveLength(0);
    });

    it('NON flagga creatinina 350 µmol/L (= 3,96 mg/dL, dentro il range critico)', () => {
      const events = [
        makeEvent({ description: 'Esami ematochimici: creatinina 350,0 µmol/L in paziente nefropatico' }),
      ];
      expect(detectCriticalClinicalValues(events)).toHaveLength(0);
    });

    it('NON flagga glicemia 18,5 mmol/L (= 333 mg/dL, dentro il range critico)', () => {
      const events = [
        makeEvent({ description: 'Prelievo ematico: glicemia 18,5 mmol/L, paziente diabetico noto' }),
      ];
      expect(detectCriticalClinicalValues(events)).toHaveLength(0);
    });

    it('comportamento invariato con unità convenzionali: Hb 5,2 g/dL resta flaggata', () => {
      const events = [
        makeEvent({ description: 'Emoglobina Hb: 5,2 g/dL, paziente anemico' }),
      ];
      const anomalies = detectCriticalClinicalValues(events);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].description).toContain('5.2 g/dL');
    });
  });
});
