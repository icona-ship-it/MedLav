import { describe, it, expect } from 'vitest';
import {
  consolidateEvents,
  consolidateNewWithExisting,
  isSimilarEvent,
  isDuplicateOfExisting,
} from './event-consolidator';
import type { ConsolidatedEvent } from './event-consolidator';
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

  it('should handle discrepancies across 3+ documents with cascading conflicts', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-1',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'diagnosi',
          title: 'Diagnosi frattura vertebrale lombare',
          description: 'Frattura corpo vertebrale L1',
          diagnosis: 'Frattura L1 tipo A1',
        })],
      },
      {
        documentId: 'doc-2',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'diagnosi',
          title: 'Diagnosi frattura vertebrale lombare compressione',
          description: 'Frattura da compressione corpo vertebrale L1',
          diagnosis: 'Frattura L1 tipo B2.2',
        })],
      },
      {
        documentId: 'doc-3',
        events: [makeEvent({
          eventDate: '2024-01-15',
          eventType: 'diagnosi',
          title: 'Diagnosi frattura vertebrale lombare burst',
          description: 'Frattura burst corpo vertebrale L1',
          diagnosis: 'Frattura L1 tipo A3',
        })],
      },
    ]);

    expect(result).toHaveLength(3);
    // All three should be flagged since they have different diagnoses
    const flagged = result.filter((e) => e.discrepancyNote?.includes('DIAGNOSI DISCORDANTE'));
    expect(flagged.length).toBeGreaterThan(0);
    // All flagged events should have capped confidence
    for (const event of flagged) {
      expect(event.confidence).toBeLessThanOrEqual(30);
      expect(event.requiresVerification).toBe(true);
    }
  });
});

describe('consolidateNewWithExisting', () => {
  function makeConsolidated(overrides: Partial<ConsolidatedEvent>): ConsolidatedEvent {
    return {
      eventDate: '2024-01-15',
      datePrecision: 'giorno',
      eventType: 'visita',
      title: 'Existing event',
      description: 'Existing description',
      sourceType: 'cartella_clinica',
      diagnosis: null,
      doctor: null,
      facility: null,
      confidence: 90,
      requiresVerification: false,
      reliabilityNotes: null,
      sourceText: 'Existing source text',
      sourcePages: [1],
      orderNumber: 1,
      documentId: 'doc-existing',
      discrepancyNote: null,
      ...overrides,
    };
  }

  it('should filter out duplicate events when adding new documents', () => {
    const existingEvents: ConsolidatedEvent[] = [
      makeConsolidated({
        eventDate: '2024-01-15',
        eventType: 'intervento',
        title: 'Intervento chirurgico ginocchio artroscopia',
        description: 'Artroscopia ginocchio destro',
        orderNumber: 1,
      }),
    ];

    const newDocEvents = [{
      documentId: 'doc-new',
      events: [makeEvent({
        eventDate: '2024-01-15',
        eventType: 'intervento',
        title: 'Intervento chirurgico ginocchio artroscopia diagnostica',
        description: 'Artroscopia ginocchio destro diagnostica',
      })],
    }];

    const result = consolidateNewWithExisting(newDocEvents, existingEvents);

    // Duplicate should be filtered out
    expect(result.newEventsToInsert).toHaveLength(0);
    // allEvents should still contain the existing one
    expect(result.allEvents).toHaveLength(1);
  });

  it('should add unique new events with correct orderNumber continuation', () => {
    const existingEvents: ConsolidatedEvent[] = [
      makeConsolidated({ orderNumber: 1, eventDate: '2024-01-15', title: 'First event' }),
      makeConsolidated({ orderNumber: 2, eventDate: '2024-01-20', title: 'Second event' }),
    ];

    const newDocEvents = [{
      documentId: 'doc-new',
      events: [makeEvent({
        eventDate: '2024-02-01',
        eventType: 'esame',
        title: 'RX ginocchio destro controllo',
        description: 'Radiografia di controllo post-operatoria',
      })],
    }];

    const result = consolidateNewWithExisting(newDocEvents, existingEvents);

    expect(result.newEventsToInsert).toHaveLength(1);
    expect(result.newEventsToInsert[0].orderNumber).toBe(3);
    expect(result.allEvents).toHaveLength(3);
  });

  it('should behave like consolidateEvents when no existing events', () => {
    const newDocEvents = [{
      documentId: 'doc-1',
      events: [
        makeEvent({ eventDate: '2024-01-15', title: 'Event A' }),
        makeEvent({ eventDate: '2024-01-20', title: 'Event B' }),
      ],
    }];

    const result = consolidateNewWithExisting(newDocEvents, []);

    expect(result.newEventsToInsert).toHaveLength(2);
    expect(result.allEvents).toHaveLength(2);
    expect(result.newEventsToInsert[0].orderNumber).toBe(1);
    expect(result.newEventsToInsert[1].orderNumber).toBe(2);
  });
});

describe('isSimilarEvent', () => {
  it('should match events with high title similarity (>0.7)', () => {
    const a = makeEvent({
      title: 'Visita ortopedica controllo post-operatorio',
      description: 'Controllo post intervento ginocchio',
    });
    const b = makeEvent({
      title: 'Visita ortopedica controllo post-operatorio follow-up',
      description: 'Follow-up post intervento ginocchio destro',
    });

    expect(isSimilarEvent(a, b)).toBe(true);
  });

  it('should NOT match events with short generic titles that share few words', () => {
    const a = makeEvent({
      title: 'Esame sangue',
      description: 'Emocromo completo con formula leucocitaria',
    });
    const b = makeEvent({
      title: 'Esame urine',
      description: 'Esame chimico-fisico e microscopico delle urine',
    });

    expect(isSimilarEvent(a, b)).toBe(false);
  });

  it('should match events with moderate title similarity when keyword overlap is high', () => {
    const a = makeEvent({
      title: 'Radiografia ginocchio destro post-operatorio controllo',
      description: 'RX ginocchio destro controllo post artroscopia, buon allineamento',
    });
    const b = makeEvent({
      title: 'Radiografia ginocchio destro controllo post-operatorio',
      description: 'Controllo radiografico ginocchio destro post intervento artroscopia',
    });

    expect(isSimilarEvent(a, b)).toBe(true);
  });

  it('should NOT match completely different events', () => {
    const a = makeEvent({
      title: 'Intervento artroprotesi anca destra',
      description: 'Sostituzione protesica totale anca',
    });
    const b = makeEvent({
      title: 'Visita cardiologica preoperatoria',
      description: 'Valutazione idoneita cardiologica per intervento',
    });

    expect(isSimilarEvent(a, b)).toBe(false);
  });
});

describe('isDuplicateOfExisting', () => {
  function makeConsolidated(overrides: Partial<ConsolidatedEvent>): ConsolidatedEvent {
    return {
      eventDate: '2024-01-15',
      datePrecision: 'giorno',
      eventType: 'visita',
      title: 'Existing event',
      description: 'Existing description',
      sourceType: 'cartella_clinica',
      diagnosis: null,
      doctor: null,
      facility: null,
      confidence: 90,
      requiresVerification: false,
      reliabilityNotes: null,
      sourceText: 'Existing source text',
      sourcePages: [1],
      orderNumber: 1,
      documentId: 'doc-existing',
      discrepancyNote: null,
      ...overrides,
    };
  }

  it('should NOT treat same-day events with different types as duplicates', () => {
    const newEvent = makeEvent({
      eventDate: '2024-01-15',
      eventType: 'esame',
      title: 'RX ginocchio destro post-operatorio',
      description: 'Radiografia ginocchio post intervento',
    });

    const existing: ConsolidatedEvent[] = [
      makeConsolidated({
        eventDate: '2024-01-15',
        eventType: 'intervento',
        title: 'Intervento chirurgico ginocchio destro',
        description: 'Artroscopia ginocchio',
        orderNumber: 1,
      }),
    ];

    expect(isDuplicateOfExisting(newEvent, existing)).toBe(false);
  });

  it('should detect duplicate when date + type + similar title match', () => {
    const newEvent = makeEvent({
      eventDate: '2024-03-10',
      eventType: 'visita',
      title: 'Visita ortopedica controllo post-operatorio',
      description: 'Controllo a 3 mesi dall\'intervento',
    });

    const existing: ConsolidatedEvent[] = [
      makeConsolidated({
        eventDate: '2024-03-10',
        eventType: 'visita',
        title: 'Visita ortopedica controllo post-operatorio follow-up',
        description: 'Follow-up post chirurgico',
        orderNumber: 5,
      }),
    ];

    expect(isDuplicateOfExisting(newEvent, existing)).toBe(true);
  });
});
