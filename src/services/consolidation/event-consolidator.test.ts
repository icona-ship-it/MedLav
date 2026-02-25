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
