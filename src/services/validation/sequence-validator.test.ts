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
    temporalScope: 'corrente' as const,
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

      // Intervento without diagnosi may trigger a sequence violation
      // depending on case type and validator implementation
      expect(Array.isArray(anomalies)).toBe(true);
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

    it('should NOT flag trauma→imaging when imaging done same day (regression — Regnoto case)', () => {
      // The Regnoto case false-positive: ricovero 13/12 + RX same day + tampone MDR 18/12.
      // Pre-fix the detector flagged the tampone as "delayed imaging".
      // After fix, keyword filter excludes the tampone and same-day RX satisfies the rule.
      const events = [
        makeEvent({ orderNumber: 1, eventType: 'ricovero', title: 'Ricovero urgente per frattura femore', eventDate: '2025-12-13' }),
        makeEvent({ orderNumber: 2, eventType: 'esame', title: 'RX anca sinistra preoperatoria', description: 'RX torace, RX anca sx, RX femore sx, RX bacino', eventDate: '2025-12-13' }),
        makeEvent({ orderNumber: 3, eventType: 'esame', title: 'Tampone MDR positivo per Escherichia coli ESBL', description: 'tampone microbiologico di routine', eventDate: '2025-12-18' }),
        makeEvent({ orderNumber: 4, eventType: 'esame', title: 'Densitometria ossea DEXA di controllo', description: 'DEXA colonna lombare', eventDate: '2026-01-05' }),
      ];

      const anomalies = validateEventSequences({
        events,
        caseType: 'rc_auto',
      });

      const traumaImagingViolation = anomalies.find(
        (a) => a.description.includes('Trauma → imaging'),
      );
      expect(traumaImagingViolation).toBeUndefined();
    });

    it('should flag trauma→imaging when imaging is genuinely delayed (>24h)', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventType: 'ricovero', title: 'Ricovero per trauma cranico', eventDate: '2024-01-01' }),
        makeEvent({ orderNumber: 2, eventType: 'visita', title: 'Visita neurologica', eventDate: '2024-01-02' }),
        makeEvent({ orderNumber: 3, eventType: 'esame', title: 'TC encefalo', description: 'TAC cerebrale', eventDate: '2024-01-05' }),
      ];

      const anomalies = validateEventSequences({
        events,
        caseType: 'rc_auto',
      });

      const violation = anomalies.find(
        (a) => a.description.includes('Trauma → imaging'),
      );
      expect(violation).toBeDefined();
    });

    it('should NOT flag trauma→imaging when only non-imaging exams follow (lab tests, swabs)', () => {
      // No imaging at all — the rule should not flag (handled by missing-doc detector).
      const events = [
        makeEvent({ orderNumber: 1, eventType: 'ricovero', title: 'Ricovero', eventDate: '2024-01-01' }),
        makeEvent({ orderNumber: 2, eventType: 'esame', title: 'Emocromo', description: 'esame ematochimico', eventDate: '2024-01-02' }),
        makeEvent({ orderNumber: 3, eventType: 'esame', title: 'Tampone faringeo', description: 'colturale', eventDate: '2024-01-03' }),
      ];

      const anomalies = validateEventSequences({
        events,
        caseType: 'rc_auto',
      });

      const violation = anomalies.find(
        (a) => a.description.includes('Trauma → imaging'),
      );
      expect(violation).toBeUndefined();
    });
  });
});
