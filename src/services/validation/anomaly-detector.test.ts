import { describe, it, expect } from 'vitest';
import { detectAnomalies } from './anomaly-detector';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

function makeEvent(overrides: Partial<ConsolidatedEvent> & { orderNumber: number; eventDate: string; eventType: ConsolidatedEvent['eventType'] }): ConsolidatedEvent {
  return {
    documentId: 'doc-1',
    datePrecision: 'giorno',
    title: 'Test event',
    description: 'Test description',
    sourceType: 'cartella_clinica',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 90,
    requiresVerification: false,
    reliabilityNotes: null,
    discrepancyNote: null,
    ...overrides,
  };
}

describe('detectAnomalies', () => {
  it('should return empty array for no events', () => {
    expect(detectAnomalies([])).toEqual([]);
  });

  describe('ritardo_diagnostico', () => {
    it('should detect delay >30 days between visit and diagnosis', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Prima visita' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-03-15', eventType: 'diagnosi', title: 'Diagnosi tardiva' }),
      ];

      const anomalies = detectAnomalies(events);
      const ritardo = anomalies.filter((a) => a.anomalyType === 'ritardo_diagnostico');

      expect(ritardo.length).toBe(1);
      expect(ritardo[0].involvedEvents).toHaveLength(2);
    });

    it('should not flag delay <=30 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Visita' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-01', eventType: 'diagnosi', title: 'Diagnosi rapida' }),
      ];

      const anomalies = detectAnomalies(events);
      const ritardo = anomalies.filter((a) => a.anomalyType === 'ritardo_diagnostico');
      expect(ritardo.length).toBe(0);
    });
  });

  describe('gap_post_chirurgico', () => {
    it('should detect missing follow-up after surgery', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento chirurgico' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_post_chirurgico');

      expect(gaps.length).toBe(1);
      expect(gaps[0].severity).toBe('alta');
    });

    it('should detect late follow-up >30 days after surgery', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-03-20', eventType: 'follow-up', title: 'Controllo tardivo' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_post_chirurgico');

      expect(gaps.length).toBe(1);
    });

    it('should not flag follow-up within 30 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-25', eventType: 'follow-up', title: 'Controllo' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_post_chirurgico');
      expect(gaps.length).toBe(0);
    });
  });

  describe('gap_documentale', () => {
    it('should detect gap >60 days between events', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Prima visita' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-05-15', eventType: 'visita', title: 'Seconda visita' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_documentale');

      expect(gaps.length).toBe(1);
    });

    it('should mark >180 days as critical', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Prima' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-08-15', eventType: 'visita', title: 'Seconda' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_documentale');

      expect(gaps.length).toBe(1);
      expect(gaps[0].severity).toBe('critica');
    });
  });

  describe('consenso_non_documentato', () => {
    it('should detect missing consent for surgery', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento senza consenso' }),
      ];

      const anomalies = detectAnomalies(events);
      const consenso = anomalies.filter((a) => a.anomalyType === 'consenso_non_documentato');

      expect(consenso.length).toBe(1);
      expect(consenso[0].severity).toBe('alta');
    });

    it('should not flag when consent is present', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-05', eventType: 'consenso', title: 'Consenso informato' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento' }),
      ];

      const anomalies = detectAnomalies(events);
      const consenso = anomalies.filter((a) => a.anomalyType === 'consenso_non_documentato');
      expect(consenso.length).toBe(0);
    });
  });

  describe('complicanza_non_gestita', () => {
    it('should detect complication without treatment', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'complicanza', title: 'Infezione post-op' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-25', eventType: 'visita', title: 'Visita' }),
      ];

      const anomalies = detectAnomalies(events);
      const complicanza = anomalies.filter((a) => a.anomalyType === 'complicanza_non_gestita');

      expect(complicanza.length).toBe(1);
    });

    it('should not flag when treatment follows within 7 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'complicanza', title: 'Complicanza' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-12', eventType: 'terapia', title: 'Antibioticoterapia' }),
      ];

      const anomalies = detectAnomalies(events);
      const complicanza = anomalies.filter((a) => a.anomalyType === 'complicanza_non_gestita');
      expect(complicanza.length).toBe(0);
    });
  });

  describe('diagnosi_contraddittoria', () => {
    it('should detect contradictory diagnoses within 90 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'diagnosi', title: 'Diagnosi A', diagnosis: 'Frattura femore destro' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-15', eventType: 'diagnosi', title: 'Diagnosi B', diagnosis: 'Lussazione anca sinistra' }),
      ];

      const anomalies = detectAnomalies(events);
      const contradictions = anomalies.filter((a) => a.anomalyType === 'diagnosi_contraddittoria');

      expect(contradictions.length).toBe(1);
    });

    it('should not flag same diagnosis rephrased', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'diagnosi', title: 'D1', diagnosis: 'Frattura femore destro sottocapitata' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-20', eventType: 'diagnosi', title: 'D2', diagnosis: 'Frattura sottocapitata femore destro composta' }),
      ];

      const anomalies = detectAnomalies(events);
      const contradictions = anomalies.filter((a) => a.anomalyType === 'diagnosi_contraddittoria');
      expect(contradictions.length).toBe(0);
    });
  });

  describe('terapia_senza_followup', () => {
    it('should detect therapy without follow-up within 14 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'terapia', title: 'Terapia antibiotica' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-20', eventType: 'visita', title: 'Visita successiva' }),
      ];

      const anomalies = detectAnomalies(events);
      const noFollowup = anomalies.filter((a) => a.anomalyType === 'terapia_senza_followup');

      expect(noFollowup.length).toBe(1);
      expect(noFollowup[0].severity).toBe('bassa');
    });
  });
});
