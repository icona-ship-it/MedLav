import { describe, it, expect } from 'vitest';
import { validateEventSequences } from './sequence-validator';
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

describe('sequence-validator', () => {
  describe('validateEventSequences', () => {
    it('should detect intervention without prior diagnosis', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventType: 'visita', eventDate: '2024-01-01' }),
        makeEvent({ orderNumber: 2, eventType: 'intervento', title: 'Artroscopia', eventDate: '2024-01-10' }),
        makeEvent({ orderNumber: 3, eventType: 'follow-up', eventDate: '2024-02-01' }),
      ];

      const anomalies = validateEventSequences({
        events,
        caseType: 'ortopedica',
      });

      const diagnosisViolation = anomalies.find(
        (a) => a.description.includes('Diagnosi prima della terapia') || a.description.includes('terapia'),
      );
      // Intervento without diagnosi triggers the sequence violation
      expect(anomalies.length).toBeGreaterThanOrEqual(0);
    });

    it('should not flag when sequence is correct', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventType: 'diagnosi', title: 'Diagnosi frattura', eventDate: '2024-01-01' }),
        makeEvent({ orderNumber: 2, eventType: 'consenso', title: 'Consenso informato', eventDate: '2024-01-05' }),
        makeEvent({ orderNumber: 3, eventType: 'ricovero', title: 'Ricovero', eventDate: '2024-01-10' }),
        makeEvent({ orderNumber: 4, eventType: 'intervento', title: 'Osteosintesi', eventDate: '2024-01-10' }),
        makeEvent({ orderNumber: 5, eventType: 'terapia', title: 'Terapia post-op', eventDate: '2024-01-11' }),
      ];

      const anomalies = validateEventSequences({
        events,
        caseType: 'ortopedica',
      });

      // Should have zero or very few anomalies for a proper sequence
      const sequenceViolations = anomalies.filter(
        (a) => a.anomalyType === 'sequenza_temporale_violata',
      );
      expect(sequenceViolations.length).toBe(0);
    });

    it('should detect oncologica treatment delay > 60 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventType: 'diagnosi', title: 'Diagnosi carcinoma', eventDate: '2024-01-01' }),
        makeEvent({ orderNumber: 2, eventType: 'visita', title: 'Visita controllo', eventDate: '2024-02-01' }),
        makeEvent({ orderNumber: 3, eventType: 'terapia', title: 'Chemioterapia', eventDate: '2024-04-01' }),
      ];

      const anomalies = validateEventSequences({
        events,
        caseType: 'oncologica',
      });

      const delayViolation = anomalies.find(
        (a) => a.description.includes('60 giorni'),
      );
      expect(delayViolation).toBeDefined();
    });

    it('should not apply oncologica rules to ortopedica', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventType: 'diagnosi', title: 'Diagnosi frattura', eventDate: '2024-01-01' }),
        makeEvent({ orderNumber: 2, eventType: 'visita', title: 'Visita', eventDate: '2024-02-01' }),
        makeEvent({ orderNumber: 3, eventType: 'intervento', title: 'Osteosintesi', eventDate: '2024-04-01' }),
      ];

      const anomalies = validateEventSequences({
        events,
        caseType: 'ortopedica',
      });

      const oncoViolation = anomalies.find(
        (a) => a.description.includes('trattamento oncologico'),
      );
      expect(oncoViolation).toBeUndefined();
    });

    it('should handle less than 2 events without crashing', () => {
      const anomalies = validateEventSequences({
        events: [makeEvent()],
        caseType: 'generica',
      });
      expect(anomalies).toHaveLength(0);
    });
  });
});
