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

  // DIRETTIVA LAVINI (2026-07-14): un'anomalia non deve MAI nascere da una
  // distanza temporale tra eventi né dall'assenza di un documento. Restano solo
  // le anomalie basate sul CONTENUTO (diagnosi_contraddittoria, valore_clinico_critico).
  describe('nessuna anomalia temporale o da-assenza (direttiva Lavini)', () => {
    const REMOVED_TYPES = [
      'ritardo_diagnostico', 'gap_post_chirurgico', 'gap_documentale',
      'terapia_senza_followup', 'complicanza_non_gestita',
      'consenso_non_documentato', 'sequenza_temporale_violata',
    ];

    it('NON flagga un ritardo diagnostico (>90gg visita→diagnosi)', () => {
      const anomalies = detectAnomalies([
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Prima visita' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-05-15', eventType: 'diagnosi', title: 'Diagnosi tardiva' }),
      ]);
      expect(anomalies.some((a) => a.anomalyType === 'ritardo_diagnostico')).toBe(false);
    });

    it('NON flagga un gap post-chirurgico né una lacuna documentale', () => {
      const anomalies = detectAnomalies([
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-10', eventType: 'esame', title: 'E1' }),
        makeEvent({ orderNumber: 3, eventDate: '2024-03-10', eventType: 'terapia', title: 'T1' }),
        makeEvent({ orderNumber: 4, eventDate: '2024-04-10', eventType: 'visita', title: 'V2' }),
        makeEvent({ orderNumber: 5, eventDate: '2024-12-15', eventType: 'visita', title: 'V3 molto dopo' }),
      ]);
      expect(anomalies.some((a) => a.anomalyType === 'gap_post_chirurgico')).toBe(false);
      expect(anomalies.some((a) => a.anomalyType === 'gap_documentale')).toBe(false);
    });

    it('NON flagga consenso mancante né complicanza non gestita né terapia senza follow-up', () => {
      const anomalies = detectAnomalies([
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento', documentId: 'doc-1' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-11', eventType: 'complicanza', title: 'Infezione post-op', documentId: 'doc-2' }),
        makeEvent({ orderNumber: 3, eventDate: '2024-01-20', eventType: 'terapia', title: 'Terapia', documentId: 'doc-2' }),
        makeEvent({ orderNumber: 4, eventDate: '2024-06-20', eventType: 'visita', title: 'Visita tardiva', documentId: 'doc-3' }),
      ]);
      for (const t of ['consenso_non_documentato', 'complicanza_non_gestita', 'terapia_senza_followup']) {
        expect(anomalies.some((a) => a.anomalyType === t)).toBe(false);
      }
    });

    it('NESSUN tipo temporale/da-assenza compare mai, nemmeno su un caso ricco', () => {
      const anomalies = detectAnomalies([
        makeEvent({ orderNumber: 1, eventDate: '2023-01-10', eventType: 'visita', title: 'V1' }),
        makeEvent({ orderNumber: 2, eventDate: '2023-02-10', eventType: 'intervento', title: 'Intervento' }),
        makeEvent({ orderNumber: 3, eventDate: '2023-03-10', eventType: 'complicanza', title: 'Complicanza' }),
        makeEvent({ orderNumber: 4, eventDate: '2024-08-15', eventType: 'diagnosi', title: 'Diagnosi', diagnosis: 'Frattura femore destro' }),
      ], { caseType: 'rc_auto' });
      for (const t of REMOVED_TYPES) {
        expect(anomalies.some((a) => a.anomalyType === t)).toBe(false);
      }
    });
  });

  describe('diagnosi_contraddittoria (CONTENUTO, non tempo)', () => {
    it('flagga due diagnosi discordanti (differenza di contenuto)', () => {
      const anomalies = detectAnomalies([
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'diagnosi', title: 'Diagnosi A', diagnosis: 'Frattura femore destro composta' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-02-15', eventType: 'diagnosi', title: 'Diagnosi B', diagnosis: 'Lussazione anca sinistra post traumatica' }),
      ]);
      const contradictions = anomalies.filter((a) => a.anomalyType === 'diagnosi_contraddittoria');
      expect(contradictions.length).toBe(1);
      // La descrizione GUIDA col contenuto, non con "a distanza di N giorni".
      expect(contradictions[0].description).not.toMatch(/a distanza di \d+ giorni/);
      expect(contradictions[0].description).toContain('discordanti');
    });

    it('NON flagga la stessa diagnosi riformulata', () => {
      const anomalies = detectAnomalies([
        makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'diagnosi', title: 'D1', diagnosis: 'Frattura femore destro sottocapitata' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-20', eventType: 'diagnosi', title: 'D2', diagnosis: 'Frattura sottocapitata femore destro composta' }),
      ]);
      expect(anomalies.filter((a) => a.anomalyType === 'diagnosi_contraddittoria').length).toBe(0);
    });

    it('NON flagga diagnosi_contraddittoria con date sentinella 1900', () => {
      const anomalies = detectAnomalies([
        makeEvent({ orderNumber: 1, eventDate: '1900-01-01', eventType: 'diagnosi', title: 'D1', diagnosis: 'Frattura femore destro composta' }),
        makeEvent({ orderNumber: 2, eventDate: '2024-01-15', eventType: 'diagnosi', title: 'D2', diagnosis: 'Lussazione anca sinistra post traumatica' }),
      ]);
      expect(anomalies.filter((a) => a.anomalyType === 'diagnosi_contraddittoria').length).toBe(0);
    });
  });

});
