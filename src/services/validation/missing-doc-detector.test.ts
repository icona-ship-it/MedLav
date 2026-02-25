import { describe, it, expect } from 'vitest';
import { detectMissingDocuments } from './missing-doc-detector';
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

describe('detectMissingDocuments', () => {
  it('should detect missing consent for ortopedica case with surgery', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Osteosintesi', description: 'Intervento chirurgico ortopedico' }),
    ];

    const missing = detectMissingDocuments({
      events,
      caseType: 'ortopedica',
      uploadedDocTypes: [],
    });

    const consentMissing = missing.find((m) => m.documentName.toLowerCase().includes('consenso'));
    expect(consentMissing).toBeDefined();
  });

  it('should not flag consent when present in events', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-01-05', eventType: 'consenso', title: 'Consenso informato acquisito', description: 'Consenso informato per intervento' }),
      makeEvent({ orderNumber: 2, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento', description: 'Osteosintesi' }),
    ];

    const missing = detectMissingDocuments({
      events,
      caseType: 'ortopedica',
      uploadedDocTypes: [],
    });

    const consentMissing = missing.find((m) => m.documentName.toLowerCase().includes('consenso informato chirurgico'));
    expect(consentMissing).toBeUndefined();
  });

  it('should detect missing anesthesia record for anestesiologica case', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'intervento', title: 'Intervento', description: 'Intervento chirurgico' }),
    ];

    const missing = detectMissingDocuments({
      events,
      caseType: 'anestesiologica',
      uploadedDocTypes: [],
    });

    const anesthesiaMissing = missing.find((m) => m.documentName.toLowerCase().includes('anestesiologica'));
    expect(anesthesiaMissing).toBeDefined();
  });

  it('should return fewer missing docs for generica case type', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-01-10', eventType: 'visita', title: 'Visita', description: 'Visita generica' }),
    ];

    const genericMissing = detectMissingDocuments({
      events,
      caseType: 'generica',
      uploadedDocTypes: [],
    });

    const orthoMissing = detectMissingDocuments({
      events,
      caseType: 'ortopedica',
      uploadedDocTypes: [],
    });

    expect(genericMissing.length).toBeLessThan(orthoMissing.length);
  });

  it('should handle empty events array', () => {
    const missing = detectMissingDocuments({
      events: [],
      caseType: 'generica',
      uploadedDocTypes: [],
    });

    // Should still check based on uploaded doc types
    expect(Array.isArray(missing)).toBe(true);
  });
});
