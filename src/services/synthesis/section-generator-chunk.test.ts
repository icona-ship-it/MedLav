import { describe, it, expect } from 'vitest';
import { chunkArray, buildAttiIndex } from './section-generator';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

function makeEvent(overrides?: Partial<ConsolidatedEvent>): ConsolidatedEvent {
  return {
    orderNumber: 1,
    documentId: 'doc-1',
    eventDate: '2024-03-15',
    datePrecision: 'giorno',
    eventType: 'visita',
    title: 'Visita ortopedica',
    description: 'Paziente visitato.',
    sourceType: 'referto_controllo',
    diagnosis: null,
    doctor: null,
    facility: null,
    confidence: 90,
    requiresVerification: false,
    reliabilityNotes: null,
    sourceText: 'x',
    sourcePages: [1],
    discrepancyNote: null,
    ...overrides,
  };
}

describe('chunkArray', () => {
  it('returns empty for an empty input', () => {
    expect(chunkArray([], 50)).toEqual([]);
  });

  it('splits an exact multiple into equal blocks', () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('puts the remainder in a shorter last block', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single block when size >= length', () => {
    expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('degrades to a single block when size <= 0 (never loses items)', () => {
    expect(chunkArray([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });

  it('NEVER loses or duplicates items — concatenation reconstitutes the original', () => {
    const items = Array.from({ length: 217 }, (_, i) => i); // il caso Lavini
    const flat = chunkArray(items, 50).flat();
    expect(flat).toEqual(items);
    expect(chunkArray(items, 50).length).toBe(5); // 50+50+50+50+17
  });
});

describe('buildAttiIndex', () => {
  it('reports the total count and one line per event', () => {
    const events = [makeEvent(), makeEvent({ orderNumber: 2 }), makeEvent({ orderNumber: 3 })];
    const idx = buildAttiIndex(events);
    expect(idx).toContain('(3,');
    expect(idx.split('\n').filter((l) => l.startsWith('- ')).length).toBe(3);
  });

  it('formats the date as DD.MM.YYYY', () => {
    const idx = buildAttiIndex([makeEvent({ eventDate: '2024-03-15' })]);
    expect(idx).toContain('(15.03.2024)');
  });

  it('prefers facility, falls back to doctor, then to bare type', () => {
    expect(buildAttiIndex([makeEvent({ facility: 'Ospedale X', doctor: 'Dr. Y' })])).toContain('— Ospedale X');
    expect(buildAttiIndex([makeEvent({ facility: null, doctor: 'Dr. Y' })])).toContain('— Dr. Y');
    const bare = buildAttiIndex([makeEvent({ facility: null, doctor: null, eventType: 'ricovero' })]);
    expect(bare).toContain('- Ricovero (');
    expect(bare).not.toContain('—');
  });
});
