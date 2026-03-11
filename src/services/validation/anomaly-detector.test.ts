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
    sourceText: 'Test source text for verification',
    sourcePages: [1],
    discrepancyNote: null,
    ...overrides,
  };
}

describe('detectAnomalies', () => {
  it('should return empty array for no events', () => {
    expect(detectAnomalies([])).toEqual([]);
  });

  it('should return empty array for single event', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita' }),
    ];
    expect(detectAnomalies(events)).toEqual([]);
  });

  it('should handle empty events array', () => {
    // Arrange
    const events: ConsolidatedEvent[] = [];

    // Act
    const anomalies = detectAnomalies(events);

    // Assert
    expect(anomalies).toEqual([]);
    expect(anomalies).toHaveLength(0);
  });

  it('should return empty array for well-ordered events without anomalies', () => {
    // Arrange — regular follow-ups, no gaps, proper sequencing
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Prima visita' }),
      makeEvent({ orderNumber: 2, eventDate: '2024-01-15', eventType: 'diagnosi', title: 'Diagnosi' }),
      makeEvent({ orderNumber: 3, eventDate: '2024-01-20', eventType: 'terapia', title: 'Terapia prescritta' }),
      makeEvent({ orderNumber: 4, eventDate: '2024-02-01', eventType: 'follow-up', title: 'Controllo' }),
    ];

    // Act
    const anomalies = detectAnomalies(events);

    // Assert
    expect(anomalies).toEqual([]);
  });

  describe('ritardo_diagnostico', () => {
    it('should detect delay >90 days between visit and diagnosis', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Prima visita' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-05-15', eventType: 'diagnosi', title: 'Diagnosi tardiva' }),
      ];

      const anomalies = detectAnomalies(events);
      const ritardo = anomalies.filter((a) => a.anomalyType === 'ritardo_diagnostico');

      expect(ritardo.length).toBe(1);
      expect(ritardo[0].involvedEvents).toHaveLength(2);
    });

    it('should not flag delay <=90 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Visita' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-03-15', eventType: 'diagnosi', title: 'Diagnosi' }),
      ];

      const anomalies = detectAnomalies(events);
      const ritardo = anomalies.filter((a) => a.anomalyType === 'ritardo_diagnostico');
      expect(ritardo.length).toBe(0);
    });
  });

  describe('gap_post_chirurgico', () => {
    it('should detect missing follow-up after surgery when later events exist', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento chirurgico' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-06-15', eventType: 'esame', title: 'Esame molto dopo' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_post_chirurgico');

      expect(gaps.length).toBe(1);
    });

    it('should detect late follow-up >60 days after surgery', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-04-20', eventType: 'follow-up', title: 'Controllo tardivo' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_post_chirurgico');

      expect(gaps.length).toBe(1);
    });

    it('should not flag follow-up within 60 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-15', eventType: 'follow-up', title: 'Controllo' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_post_chirurgico');
      expect(gaps.length).toBe(0);
    });
  });

  describe('gap_documentale', () => {
    it('should detect gap >180 days between events when enough events exist', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'V1' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-10', eventType: 'esame', title: 'E1' }),
        makeEvent({ orderNumber: 3, eventDate: '2024-03-10', eventType: 'terapia', title: 'T1' }),
        makeEvent({ orderNumber: 4, eventDate: '2024-04-10', eventType: 'visita', title: 'V2' }),
        makeEvent({ orderNumber: 5, eventDate: '2024-12-15', eventType: 'visita', title: 'V3 dopo gap' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_documentale');

      expect(gaps.length).toBe(1);
    });

    it('should mark >365 days as alta severity', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2023-01-10', eventType: 'visita', title: 'V1' }),
        makeEvent({ orderNumber: 2, eventDate: '2023-02-10', eventType: 'esame', title: 'E1' }),
        makeEvent({ orderNumber: 3, eventDate: '2023-03-10', eventType: 'terapia', title: 'T1' }),
        makeEvent({ orderNumber: 4, eventDate: '2023-04-10', eventType: 'visita', title: 'V2' }),
        makeEvent({ orderNumber: 5, eventDate: '2024-08-15', eventType: 'visita', title: 'V3 dopo gap lungo' }),
      ];

      const anomalies = detectAnomalies(events);
      const gaps = anomalies.filter((a) => a.anomalyType === 'gap_documentale');

      expect(gaps.length).toBe(1);
      expect(gaps[0].severity).toBe('alta');
    });
  });

  describe('consenso_non_documentato', () => {
    it('should detect missing consent only with multiple document sources', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento', documentId: 'doc-1' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-10', eventType: 'visita', title: 'Visita', documentId: 'doc-2' }),
      ];

      const anomalies = detectAnomalies(events);
      const consenso = anomalies.filter((a) => a.anomalyType === 'consenso_non_documentato');

      expect(consenso.length).toBe(1);
    });

    it('should not flag consent with single document source', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento', documentId: 'doc-1' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-10', eventType: 'visita', title: 'Visita', documentId: 'doc-1' }),
      ];

      const anomalies = detectAnomalies(events);
      const consenso = anomalies.filter((a) => a.anomalyType === 'consenso_non_documentato');
      expect(consenso.length).toBe(0);
    });

    it('should not flag when consent is present', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-05', eventType: 'consenso', title: 'Consenso informato', documentId: 'doc-1' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento', documentId: 'doc-2' }),
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
    it('should detect contradictory diagnoses within 60 days', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'diagnosi', title: 'Diagnosi A', diagnosis: 'Frattura femore destro composta' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-15', eventType: 'diagnosi', title: 'Diagnosi B', diagnosis: 'Lussazione anca sinistra post traumatica' }),
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
    it('should detect therapy without follow-up when multiple doc sources', () => {
      const events = [
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'terapia', title: 'Terapia antibiotica', documentId: 'doc-1' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-03-20', eventType: 'visita', title: 'Visita successiva', documentId: 'doc-2' }),
      ];

      const anomalies = detectAnomalies(events);
      const noFollowup = anomalies.filter((a) => a.anomalyType === 'terapia_senza_followup');

      expect(noFollowup.length).toBe(1);
      expect(noFollowup[0].severity).toBe('bassa');
    });
  });
});
