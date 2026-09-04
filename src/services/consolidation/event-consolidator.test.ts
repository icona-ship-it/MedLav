import { describe, it, expect } from 'vitest';
import {
  consolidateEvents,
  consolidateNewWithExisting,
  isSimilarEvent,
  isDuplicateOfExisting,
  computeRelevanceTier,
  eventTimeMinutes,
  clinicalDayRank,
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
    temporalScope: 'corrente' as const,
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
      temporalScope: 'corrente' as const,
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

  // ── A5: same-day events at different times stay separate ──
  describe('A5 — temporal separation', () => {
    it('should NOT merge ECG mattina and ECG pomeriggio (same date)', () => {
      const morning = makeEvent({ eventType: 'esame_strumentale', title: 'ECG mattina', description: 'Elettrocardiogramma eseguito al mattino' });
      const afternoon = makeEvent({ eventType: 'esame_strumentale', title: 'ECG pomeriggio', description: 'Elettrocardiogramma eseguito nel pomeriggio' });
      expect(isSimilarEvent(morning, afternoon)).toBe(false);
    });

    it('should NOT merge events with explicit clock times in different halves of the day', () => {
      const a = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'Elettrocardiogramma ore 8:00' });
      const b = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'Elettrocardiogramma ore 16:30' });
      expect(isSimilarEvent(a, b)).toBe(false);
    });

    it('should still merge two ECG with the same time bucket (guard does not block)', () => {
      const a = makeEvent({ eventType: 'esame_strumentale', title: 'ECG mattina', description: 'Elettrocardiogramma eseguito al mattino a riposo' });
      const b = makeEvent({ eventType: 'esame_strumentale', title: 'ECG mattina', description: 'Elettrocardiogramma eseguito al mattino a riposo' });
      expect(isSimilarEvent(a, b)).toBe(true);
    });

    it('should behave normally when no time marker is present (identical ECG → similar)', () => {
      const a = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'Elettrocardiogramma a riposo' });
      const b = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'Elettrocardiogramma a riposo' });
      expect(isSimilarEvent(a, b)).toBe(true);
    });

    it('should keep both same-day ECG events through full consolidation', () => {
      const result = consolidateEvents([
        {
          documentId: 'doc-1',
          events: [
            makeEvent({ eventDate: '2024-02-10', eventType: 'esame_strumentale', title: 'ECG mattina', description: 'Elettrocardiogramma al mattino, ritmo sinusale' }),
            makeEvent({ eventDate: '2024-02-10', eventType: 'esame_strumentale', title: 'ECG pomeriggio', description: 'Elettrocardiogramma nel pomeriggio, ritmo sinusale' }),
          ],
        },
      ]);
      const ecgEvents = result.filter((e) => e.title.toLowerCase().includes('ecg'));
      expect(ecgEvents).toHaveLength(2);
    });
  });

  // ── A6: medical abbreviation whitelist (modality survives tokenization) ──
  describe('A6 — medical abbreviations', () => {
    it('should NOT merge "RX torace" and "TC torace" (different modalities, same body part)', () => {
      const rx = makeEvent({ eventType: 'esame_strumentale', title: 'RX torace', description: 'Radiografia del torace in due proiezioni' });
      const tc = makeEvent({ eventType: 'esame_strumentale', title: 'TC torace', description: 'Tomografia computerizzata del torace con mezzo di contrasto' });
      expect(isSimilarEvent(rx, tc)).toBe(false);
    });

    it('should treat ECO and RMN as distinct modalities of the same district', () => {
      const eco = makeEvent({ eventType: 'esame_strumentale', title: 'ECO addome', description: 'Ecografia addome completo' });
      const rmn = makeEvent({ eventType: 'esame_strumentale', title: 'RMN addome', description: 'Risonanza magnetica nucleare addome' });
      expect(isSimilarEvent(eco, rmn)).toBe(false);
    });
  });

  // ── A6 regression: aggregation must not collapse distinct same-modality exams ──
  describe('A6 — aggregation does not lose distinct exams (post-audit)', () => {
    it('keeps 3 distinct same-modality exams (RX torace/addome/bacino) separate', () => {
      const result = consolidateEvents([
        {
          documentId: 'doc-1',
          events: [
            makeEvent({ eventDate: '2024-03-01', eventType: 'esame_strumentale', title: 'RX torace', description: 'Radiografia del torace' }),
            makeEvent({ eventDate: '2024-03-01', eventType: 'esame_strumentale', title: 'RX addome', description: 'Radiografia diretta addome' }),
            makeEvent({ eventDate: '2024-03-01', eventType: 'esame_strumentale', title: 'RX bacino', description: 'Radiografia del bacino' }),
          ],
        },
      ]);
      expect(result).toHaveLength(3);
      expect(result.some((e) => e.title.toLowerCase().includes('routinari'))).toBe(false);
    });

    it('preserves requiresVerification (OR) and member diagnoses when aggregation fires', () => {
      const result = consolidateEvents([
        {
          documentId: 'doc-1',
          events: [
            makeEvent({ eventDate: '2024-03-01', eventType: 'esame_ematochimico', title: 'Emocromo', description: 'Emocromo completo', requiresVerification: false, diagnosis: null }),
            makeEvent({ eventDate: '2024-03-01', eventType: 'esame_ematochimico', title: 'Glicemia', description: 'Glicemia a digiuno', requiresVerification: true, diagnosis: 'Iperglicemia da verificare' }),
            makeEvent({ eventDate: '2024-03-01', eventType: 'esame_ematochimico', title: 'Creatinina', description: 'Creatinina sierica', requiresVerification: false, diagnosis: null }),
          ],
        },
      ]);
      const agg = result.find((e) => e.title.toLowerCase().includes('ematochimici'));
      expect(agg).toBeDefined();
      expect(agg!.requiresVerification).toBe(true); // a member flagged → aggregate flagged
      expect(agg!.description).toContain('Iperglicemia da verificare'); // diagnosis not lost
    });
  });

  // ── A5 regression: lab tokens must not be read as clock times ──
  describe('A5 — getTimeBucket does not false-positive on lab tokens (post-audit)', () => {
    it('does not treat a titer "1:20" as a clock time', () => {
      // OLD: "1:20" → 01:20 → am; paired with "ore 16" → pm → conflict → merge blocked.
      const a = makeEvent({ eventType: 'esame_ematochimico', title: 'Dosaggio ANA', description: 'Titolo 1:20 positivo' });
      const b = makeEvent({ eventType: 'esame_ematochimico', title: 'Dosaggio ANA', description: 'Esame eseguito ore 16' });
      expect(isSimilarEvent(a, b)).toBe(true);
    });

    it('does not treat lab factor "h 11" as a morning time', () => {
      const a = makeEvent({ eventType: 'esame_ematochimico', title: 'Emocromo', description: 'fattore h 11 nella norma' });
      const b = makeEvent({ eventType: 'esame_ematochimico', title: 'Emocromo', description: 'prelievo ore 16' });
      expect(isSimilarEvent(a, b)).toBe(true);
    });

    it('still separates genuine "ore"/"alle" morning vs afternoon times', () => {
      const a = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'ECG eseguito ore 8' });
      const b = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'ECG eseguito alle 16' });
      expect(isSimilarEvent(a, b)).toBe(false);
    });

    it('does NOT conflict an event spanning "mattina e pomeriggio" with a pm event', () => {
      // Spans both → null bucket → no spurious time conflict (post-audit fix).
      const both = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'ECG eseguito mattina e pomeriggio' });
      const pm = makeEvent({ eventType: 'esame_strumentale', title: 'ECG', description: 'ECG eseguito nel pomeriggio' });
      expect(isSimilarEvent(both, pm)).toBe(true);
    });
  });

  // ── Tokenizer unicode-aware: punteggiatura non rompe la similarità (post-audit) ──
  describe('similarity is robust to punctuation', () => {
    it('matches titles that differ only by punctuation (comma)', () => {
      const a = makeEvent({ eventType: 'esame_strumentale', title: 'Radiografia torace, due proiezioni', description: 'RX torace' });
      const b = makeEvent({ eventType: 'esame_strumentale', title: 'Radiografia torace due proiezioni', description: 'RX torace' });
      expect(isSimilarEvent(a, b)).toBe(true);
    });
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
      temporalScope: 'corrente' as const,
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

// ── Schönweger regression: sentinel dates + broken OCR + intra-doc dedup ──

describe('consolidateEvents — Schönweger regression (CASO-2026-160)', () => {
  it('drops events with sentinel date 1900-01-01', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-A',
        events: [
          makeEvent({ eventDate: '2024-04-13', title: 'Vera visita' }),
          makeEvent({ eventDate: '1900-01-01', title: 'Tabelle non decodificabili' }),
          makeEvent({ eventDate: '1900-01-01', title: 'Diagnosi senza data inferibile' }),
          makeEvent({ eventDate: '2024-04-14', title: 'Altra visita' }),
        ],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.eventDate)).toEqual(['2024-04-13', '2024-04-14']);
  });

  // Lavini 2026-05-11: spese mediche senza data pagamento devono comparire
  // comunque in tabella spese (l'importo e' il dato vincolante, non la data).
  // Esempi: imposta di bollo, riepiloghi, contanti senza ricevuta.
  it('keeps spesa_medica events with sentinel date (Lavini regression)', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-A',
        events: [
          makeEvent({ eventDate: '2024-04-13', title: 'Vera visita', eventType: 'visita' }),
          makeEvent({ eventDate: '1900-01-01', title: 'Imposta di bollo', eventType: 'spesa_medica' }),
          makeEvent({ eventDate: '1900-01-01', title: 'Visita ortopedica', eventType: 'spesa_medica' }),
          makeEvent({ eventDate: '1900-01-01', title: 'Diagnosi senza data', eventType: 'diagnosi' }),
        ],
      },
    ]);
    // Visita (real date) + 2 spesa_medica (sentinel kept) = 3.
    // Diagnosi with sentinel is dropped (not a spesa_medica).
    expect(result).toHaveLength(3);
    const expenseTitles = result
      .filter((e) => e.eventType === 'spesa_medica')
      .map((e) => e.title);
    expect(expenseTitles).toContain('Imposta di bollo');
    expect(expenseTitles).toContain('Visita ortopedica');
  });

  // Sprint 1 S1.4 (Lavini quality, 2026-05-17): aggregate similar exams.
  it('aggregates 5+ similar lab exams on the same date into 1 event', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-A',
        events: [
          makeEvent({
            eventDate: '2024-04-13',
            eventType: 'esame_ematochimico',
            title: 'Emocromo completo prelievo mattutino',
            sourcePages: [1],
          }),
          makeEvent({
            eventDate: '2024-04-13',
            eventType: 'esame_ematochimico',
            title: 'Emocromo controllo serale',
            sourcePages: [2],
          }),
          makeEvent({
            eventDate: '2024-04-13',
            eventType: 'esame_ematochimico',
            title: 'Emocromo controllo notturno',
            sourcePages: [3],
          }),
          makeEvent({
            eventDate: '2024-04-13',
            eventType: 'esame_ematochimico',
            title: 'Emocromo emergenza',
            sourcePages: [4],
          }),
          makeEvent({
            eventDate: '2024-04-14',
            eventType: 'visita',
            title: 'Visita ortopedica controllo',
          }),
        ],
      },
    ]);
    // 4 emocromi aggregati → 1 evento + visita = 2 totali
    expect(result).toHaveLength(2);
    const aggregated = result.find((e) => e.eventType === 'esame_ematochimico');
    expect(aggregated).toBeDefined();
    expect(aggregated!.title).toMatch(/Esami ematochimici routinari .* esami raggruppati/);
    expect(aggregated!.sourcePages).toEqual([1, 2, 3, 4]);
  });

  it('does NOT aggregate dissimilar exams on same date (low token overlap)', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-A',
        events: [
          makeEvent({
            eventDate: '2024-04-13',
            eventType: 'esame_strumentale',
            title: 'RX gomito destro proiezione AP',
          }),
          makeEvent({
            eventDate: '2024-04-13',
            eventType: 'esame_strumentale',
            title: 'RX ginocchio sinistro carico',
          }),
          makeEvent({
            eventDate: '2024-04-13',
            eventType: 'esame_strumentale',
            title: 'Risonanza magnetica colonna lombare',
          }),
        ],
      },
    ]);
    // 3 esami diversi → NON aggregati (token overlap < 0.5)
    expect(result).toHaveLength(3);
  });

  it('does NOT aggregate interventi/diagnosi (out of aggregable types)', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-A',
        events: [
          makeEvent({ eventDate: '2024-04-13', eventType: 'intervento', title: 'Osteosintesi olecrano destro' }),
          makeEvent({ eventDate: '2024-04-13', eventType: 'intervento', title: 'Osteosintesi olecrano controllo' }),
          makeEvent({ eventDate: '2024-04-13', eventType: 'intervento', title: 'Osteosintesi olecrano revisione' }),
        ],
      },
    ]);
    // 3 interventi stessa data → MAI aggregati (interventi sono load-bearing)
    expect(result).toHaveLength(3);
  });

  it('drops events whose description contains [object Object] (broken OCR)', () => {
    const result = consolidateEvents([
      {
        documentId: 'doc-A',
        events: [
          makeEvent({
            title: 'Vero esame',
            description: 'Emocromo e biochimica nella norma',
          }),
          makeEvent({
            title: 'Esami ematochimici - Tabella 1',
            description: 'Dettagli non leggibili a causa di OCR corrotto ([object Object])',
          }),
          makeEvent({
            title: 'Tabelle non interpretabili (pagina 86)',
            description: 'Presenza di tabelle ([object Object]) senza intestazioni',
          }),
        ],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Vero esame');
  });

  it('dedupes near-identical events from the SAME document (intra-doc)', () => {
    // Schönweger: "Spondilodesi D11-L3" extracted twice from the same doc
    // with slightly different titles — should keep the higher-confidence one.
    const result = consolidateEvents([
      {
        documentId: 'doc-A',
        events: [
          makeEvent({
            eventDate: '2024-04-14',
            eventType: 'intervento',
            title: 'Spondilodesi D11-L3 e decompressione canale spinale L2',
            confidence: 90,
          }),
          makeEvent({
            eventDate: '2024-04-14',
            eventType: 'intervento',
            title: 'Spondilodesi D11-L3 e decompressione del canale spinale a livello L2',
            confidence: 95,
          }),
        ],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(95); // higher-confidence twin survives
  });

  it('preserves cross-document duplicates (annotated by markDiscrepancies, not merged)', () => {
    // Cross-doc merge is currently disabled (it broke order_number persistence);
    // duplicates are annotated, not collapsed.
    const result = consolidateEvents([
      { documentId: 'doc-A', events: [makeEvent({ title: 'Visita ortopedica' })] },
      { documentId: 'doc-B', events: [makeEvent({ title: 'Visita ortopedica' })] },
    ]);
    expect(result.length).toBe(2);
  });
});

describe('computeRelevanceTier', () => {
  it('rates diagnoses / surgeries / hospitalizations / complications as T1', () => {
    expect(computeRelevanceTier({ eventType: 'diagnosi' })).toBe('T1');
    expect(computeRelevanceTier({ eventType: 'intervento' })).toBe('T1');
    expect(computeRelevanceTier({ eventType: 'ricovero' })).toBe('T1');
    expect(computeRelevanceTier({ eventType: 'complicanza' })).toBe('T1');
  });

  it('bumps any event WITH a documented diagnosis to T1', () => {
    expect(computeRelevanceTier({ eventType: 'visita', diagnosis: 'Frattura del radio' })).toBe('T1');
  });

  it('rates discordant (contested) events as T1', () => {
    expect(computeRelevanceTier({ eventType: 'esame', discrepancyNote: '⚠ DIAGNOSI DISCORDANTE — ...' })).toBe('T1');
  });

  it('rates visits / referti / imaging as T2', () => {
    expect(computeRelevanceTier({ eventType: 'visita' })).toBe('T2');
    expect(computeRelevanceTier({ eventType: 'referto' })).toBe('T2');
    expect(computeRelevanceTier({ eventType: 'esame', sourceType: 'esame_strumentale' })).toBe('T2');
  });

  it('rates routine labs / prescriptions / admin as T3 (context)', () => {
    expect(computeRelevanceTier({ eventType: 'esame', sourceType: 'esame_ematochimico' })).toBe('T3');
    expect(computeRelevanceTier({ eventType: 'prescrizione' })).toBe('T3');
    expect(computeRelevanceTier({ eventType: 'spesa_medica' })).toBe('T3');
  });

  it('consolidateEvents attaches a relevanceTier to every event', () => {
    const result = consolidateEvents([
      { documentId: 'd1', events: [makeEvent({ eventType: 'intervento', title: 'Spondilodesi' })] },
    ]);
    expect(result[0].relevanceTier).toBe('T1');
  });
});

describe('ordinamento same-day — orario reale + sequenza clinica', () => {
  describe('eventTimeMinutes', () => {
    it('estrae i minuti da "ore HH.MM" / "alle HH"', () => {
      expect(eventTimeMinutes({ description: 'investita verso le ore 17.40' })).toBe(17 * 60 + 40);
      expect(eventTimeMinutes({ title: 'Accesso PS alle 18' })).toBe(18 * 60);
      expect(eventTimeMinutes({ description: 'ore 8:05' })).toBe(8 * 60 + 5);
    });
    it('ritorna null senza orario inequivocabile o con orario invalido', () => {
      expect(eventTimeMinutes({ description: 'emoglobina h 11, glicemia 1:20' })).toBeNull();
      expect(eventTimeMinutes({ description: 'nessun orario qui' })).toBeNull();
      expect(eventTimeMinutes({ description: 'ore 25' })).toBeNull();
    });
  });

  describe('clinicalDayRank', () => {
    it('la causa (incidente/trauma) precede l\'accesso PS', () => {
      const incidente = clinicalDayRank({ eventType: 'altro', title: 'Incidente stradale, tamponamento' });
      const accessoPs = clinicalDayRank({ eventType: 'ricovero', title: 'Accesso al Pronto Soccorso' });
      expect(incidente).toBeLessThan(accessoPs);
    });
    it('accesso PS precede visita/esami/intervento; dimissione è ultima', () => {
      const ps = clinicalDayRank({ eventType: 'ricovero', title: 'Accesso PS' });
      const visita = clinicalDayRank({ eventType: 'visita', title: 'Visita ortopedica' });
      const intervento = clinicalDayRank({ eventType: 'intervento', title: 'Osteosintesi' });
      const dimissione = clinicalDayRank({ eventType: 'ricovero', title: 'Dimissione a domicilio' });
      expect(ps).toBeLessThan(visita);
      expect(visita).toBeLessThan(intervento);
      expect(intervento).toBeLessThan(dimissione);
    });
    it('il consenso precede l\'intervento', () => {
      expect(clinicalDayRank({ eventType: 'consenso', title: 'Consenso informato' }))
        .toBeLessThan(clinicalDayRank({ eventType: 'intervento', title: 'Intervento' }));
    });
  });

  it('INTEGRAZIONE: stesso giorno, l\'incidente precede il Pronto Soccorso (era invertito)', () => {
    const result = consolidateEvents([
      { documentId: 'd1', events: [
        makeEvent({ eventDate: '2024-03-10', eventType: 'ricovero', title: 'Accesso al Pronto Soccorso', description: 'giunge in PS' }),
        makeEvent({ eventDate: '2024-03-10', eventType: 'altro', title: 'Incidente stradale', description: 'tamponamento' }),
      ] },
    ]);
    expect(result.map((e) => e.title)).toEqual(['Incidente stradale', 'Accesso al Pronto Soccorso']);
  });

  it('INTEGRAZIONE: stesso giorno con orari, ordina per orario a prescindere dal tipo', () => {
    const result = consolidateEvents([
      { documentId: 'd1', events: [
        makeEvent({ eventDate: '2024-03-10', eventType: 'esame', title: 'TC encefalo', description: 'eseguita alle 14' }),
        makeEvent({ eventDate: '2024-03-10', eventType: 'visita', title: 'Prima valutazione', description: 'ore 8.30' }),
      ] },
    ]);
    expect(result.map((e) => e.title)).toEqual(['Prima valutazione', 'TC encefalo']);
  });
});

describe('temporalScope nel consolidamento (collaudo 2026-09-04: referto esploso in 12 eventi)', () => {
  it('dedup intra-documento: il gemello "corrente" sopravvive alla menzione "retrospettivo" anche con confidence più bassa', () => {
    const result = consolidateEvents([{
      documentId: 'referto',
      events: [
        makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Mastectomia nipple sparing bilaterale', confidence: 95, temporalScope: 'retrospettivo' }),
        makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Mastectomia nipple sparing bilaterale con ricostruzione', confidence: 70, temporalScope: 'corrente' }),
      ],
    }]);
    expect(result).toHaveLength(1);
    expect(result[0].temporalScope).toBe('corrente');
  });

  it('dedup intra-documento: a parità di scope vince ancora la confidence più alta (comportamento storico)', () => {
    const result = consolidateEvents([{
      documentId: 'doc',
      events: [
        makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Osteosintesi piatto tibiale', confidence: 60 }),
        makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Osteosintesi piatto tibiale dx', confidence: 90 }),
      ],
    }]);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(90);
  });

  it('aggregazione esami: un esame solo citato in anamnesi non collassa con i 3 eseguiti lo stesso giorno', () => {
    const exam = (title: string, scope: 'corrente' | 'retrospettivo') =>
      makeEvent({ eventDate: '2026-03-03', eventType: 'esame_ematochimico', sourceType: 'esame_ematochimico', title, temporalScope: scope });
    const result = consolidateEvents([{
      documentId: 'cartella',
      events: [exam('Emocromo', 'corrente'), exam('Glicemia', 'corrente'), exam('Creatinina', 'corrente'), exam('Emocromo pregresso riferito', 'retrospettivo')],
    }]);
    const scopes = result.map((e) => e.temporalScope).sort();
    expect(scopes).toEqual(['corrente', 'retrospettivo']);
    expect(result.find((e) => e.temporalScope === 'corrente')?.title).toContain('raggruppati');
  });

  it('discrepanze cross-documento: la fonte primaria NON viene cappata a 30 dalla sua menzione anamnestica con diagnosi diversa', () => {
    const result = consolidateEvents([
      { documentId: 'cartella-operatoria', events: [makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Mastectomia nipple sparing bilaterale', diagnosis: 'Carcinoma lobulare infiltrante G2 mm 7, DCIS diffuso', confidence: 95, temporalScope: 'corrente' })] },
      { documentId: 'referto-oncologico', events: [makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Mastectomia nipple sparing bilaterale', diagnosis: 'Carcinoma lobulare', confidence: 90, temporalScope: 'retrospettivo' })] },
    ]);
    const primary = result.find((e) => e.documentId === 'cartella-operatoria')!;
    const mention = result.find((e) => e.documentId === 'referto-oncologico')!;
    expect(primary.confidence).toBe(95);
    expect(primary.requiresVerification).toBe(false);
    expect(primary.discrepancyNote).toContain('anamnesi');
    expect(mention.discrepancyNote).toContain('fonte primaria');
    expect(mention.confidence).toBe(90);
  });

  it('discrepanze fra due fonti primarie restano escalate come prima (mai auto-risolte)', () => {
    const result = consolidateEvents([
      { documentId: 'a', events: [makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Osteosintesi piatto tibiale', diagnosis: 'Frattura composta', confidence: 95 })] },
      { documentId: 'b', events: [makeEvent({ eventDate: '2026-04-14', eventType: 'intervento', title: 'Osteosintesi piatto tibiale', diagnosis: 'Frattura scomposta', confidence: 90 })] },
    ]);
    expect(result.every((e) => e.confidence <= 30 && e.requiresVerification)).toBe(true);
  });
});

describe('temporalScope — discordanze fra menzione e fonte primaria (giro avversariale 2026-09-04)', () => {
  it('lateralità/diagnosi DISCORDANTE fra anamnesi e cartella: ⚠ su entrambi, coda SOLO sulla menzione, fonte primaria mai cappata', () => {
    const result = consolidateEvents([
      { documentId: 'cartella', events: [makeEvent({ eventDate: '2026-03-10', eventType: 'intervento', title: 'Osteosintesi polso', diagnosis: 'Frattura polso sinistro', confidence: 95, temporalScope: 'corrente' })] },
      { documentId: 'referto', events: [makeEvent({ eventDate: '2026-03-10', eventType: 'intervento', title: 'Osteosintesi polso', diagnosis: 'Frattura polso destro', confidence: 90, temporalScope: 'retrospettivo' })] },
    ]);
    const primary = result.find((e) => e.documentId === 'cartella')!;
    const mention = result.find((e) => e.documentId === 'referto')!;
    expect(primary.discrepancyNote).toContain('⚠ DIAGNOSI DISCORDANTE');
    expect(primary.confidence).toBe(95);
    expect(primary.requiresVerification).toBe(false);
    expect(mention.discrepancyNote).toContain('⚠ DIAGNOSI DISCORDANTE');
    expect(mention.requiresVerification).toBe(true);
    expect(mention.confidence).toBe(90);
  });

  it('intervento PREVISTO in una lettera pre-operatoria ed ESEGUITO in cartella: la cartella non viene cappata per la sua anticipazione', () => {
    const result = consolidateEvents([
      { documentId: 'pre-op', events: [makeEvent({ eventDate: '2026-05-10', eventType: 'intervento', title: 'Rimozione mezzi di sintesi', diagnosis: 'Programmata rimozione placca', confidence: 90, temporalScope: 'programmato' })] },
      { documentId: 'cartella', events: [makeEvent({ eventDate: '2026-05-10', eventType: 'intervento', title: 'Rimozione mezzi di sintesi', diagnosis: 'Esiti di frattura radio distale dx, rimozione placca', confidence: 95, temporalScope: 'corrente' })] },
    ]);
    const primary = result.find((e) => e.documentId === 'cartella')!;
    expect(primary.confidence).toBe(95);
    expect(primary.requiresVerification).toBe(false);
  });
});
