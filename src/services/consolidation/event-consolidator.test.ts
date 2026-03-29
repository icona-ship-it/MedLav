import { describe, it, expect } from 'vitest';
import { consolidateEvents } from './event-consolidator';
import type { ExtractedEvent } from '../extraction/extraction-schemas';

function makeEvent(overrides: Partial<ExtractedEvent>): ExtractedEvent {
  return {
    eventDate: '2024-01-15',
    datePrecision: 'giorno',
    eventType: 'visita',
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
    ...overrides,
  };
}

describe('consolidateEvents', () => {
  it('should return empty array for no documents', () => {
    expect(consolidateEvents([])).toEqual([]);
  });

  it('should assign sequential order numbers', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [
          makeEvent({ eventDate: '2024-01-15', title: 'Event 1' }),
          makeEvent({ eventDate: '2024-01-20', title: 'Event 2' }),
        ],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].orderNumber).toBe(1);
    expect(result[1].orderNumber).toBe(2);
  });

  it('should sort events chronologically', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [
          makeEvent({ eventDate: '2024-03-01', title: 'Later' }),
          makeEvent({ eventDate: '2024-01-01', title: 'Earlier' }),
        ],
      },
    ]);

    expect(result[0].title).toBe('Earlier');
    expect(result[1].title).toBe('Later');
  });

  it('should merge events from multiple documents', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [makeEvent({ eventDate: '2024-01-15', title: 'From doc 1' })],
      },
      {
        documentId: 'doc-2',
        events: [makeEvent({ eventDate: '2024-01-20', title: 'From doc 2' })],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].documentId).toBe('doc-1');
    expect(result[1].documentId).toBe('doc-2');
  });

  it('should detect discrepancies for same event in multiple documents', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'intervento',
          title: 'Intervento chirurgico anca',
          description: 'Osteosintesi con placca',
          diagnosis: 'Frattura femore',
        })],
      },
      {
        documentId: 'doc-2',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'intervento',
          title: 'Intervento chirurgico anca protesi',
          description: 'Protesi totale anca',
          diagnosis: 'Coxartrosi',
        })],
      },
    ]);

    expect(result).toHaveLength(2);
    // At least one should have a discrepancy note
    const withDiscrepancy = result.filter((e) => e.discrepancyNote !== null);
    expect(withDiscrepancy.length).toBeGreaterThan(0);
  });

  it('should cap confidence at 30 and flag requiresVerification for diagnosis conflicts (C1 fix)', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'intervento',
          title: 'Intervento chirurgico ginocchio',
          description: 'Artroscopia diagnostica e terapeutica',
          diagnosis: 'Lesione meniscale',
          confidence: 95,
        })],
      },
      {
        documentId: 'doc-2',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'intervento',
          title: 'Intervento chirurgico ginocchio artroscopia',
          description: 'Artroscopia del ginocchio',
          diagnosis: 'Rottura LCA',
          confidence: 90,
        })],
      },
    ]);

    // At least one event should have diagnosis discrepancy flagged
    const flagged = result.filter((e) => e.discrepancyNote?.includes('DIAGNOSI DISCORDANTE'));
    expect(flagged.length).toBeGreaterThan(0);

    // Flagged events must have lowered confidence and requiresVerification
    for (const event of flagged) {
      expect(event.confidence).toBeLessThanOrEqual(30);
      expect(event.requiresVerification).toBe(true);
      // Note must include both diagnoses for the expert
      expect(event.discrepancyNote).toContain('Lesione meniscale');
      expect(event.discrepancyNote).toContain('Rottura LCA');
    }
  });

  it('should flag doctor name discrepancy with requiresVerification (C1 fix)', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [makeEvent({
          eventDate: '2024-02-10',
          eventType: 'visita',
          title: 'Visita ortopedica controllo',
          description: 'Controllo post-operatorio',
          doctor: 'Dott. Rossi',
        })],
      },
      {
        documentId: 'doc-2',
        events: [makeEvent({
          eventDate: '2024-02-10',
          eventType: 'visita',
          title: 'Visita ortopedica controllo follow-up',
          description: 'Follow-up post intervento',
          doctor: 'Dott. Bianchi',
        })],
      },
    ]);

    const flagged = result.filter((e) => e.discrepancyNote?.includes('MEDICO DISCORDANTE'));
    expect(flagged.length).toBeGreaterThan(0);
    for (const event of flagged) {
      expect(event.requiresVerification).toBe(true);
    }
  });

  it('should NOT flag discrepancy for same data across documents', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'visita',
          title: 'Visita ortopedica controllo',
          description: 'Controllo regolare',
          diagnosis: 'Frattura femore in via di guarigione',
          doctor: 'Dott. Rossi',
        })],
      },
      {
        documentId: 'doc-2',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'visita',
          title: 'Visita ortopedica controllo follow-up',
          description: 'Controllo post-operatorio regolare',
          diagnosis: 'Frattura femore in via di guarigione',
          doctor: 'Dott. Rossi',
        })],
      },
    ]);

    // Same diagnosis + same doctor → no conflict flags
    const diagnosisFlags = result.filter((e) => e.discrepancyNote?.includes('DIAGNOSI DISCORDANTE'));
    const doctorFlags = result.filter((e) => e.discrepancyNote?.includes('MEDICO DISCORDANTE'));
    expect(diagnosisFlags).toHaveLength(0);
    expect(doctorFlags).toHaveLength(0);
  });

  it('should preserve document ID for each event', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-abc',
        events: [makeEvent({ title: 'My event' })],
      },
    ]);

    expect(result[0].documentId).toBe('doc-abc');
  });
});
