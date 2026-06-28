import { describe, it, expect } from 'vitest';
import { chunkArray, buildAttiIndex, chunkEventsByDocument, buildDocSanitariaChunkSpec } from './section-generator';
import type { SectionSpec } from './section-generation-types';
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

  it('renders the 1900-01-01 sentinel as "s.d." (never the validator-blocked 01.01.1900)', () => {
    const idx = buildAttiIndex([makeEvent({ eventDate: '1900-01-01', eventType: 'spesa_medica' })]);
    expect(idx).toContain('(s.d.)');
    expect(idx).not.toMatch(/01[./]01[./]1900/);
  });
});

describe('chunkEventsByDocument — non spezza i documenti (fix Bigon chunked)', () => {
  it('impacchetta i gruppi-documento senza spezzarli tra blocchi', () => {
    const evs = [
      makeEvent({ documentId: 'A' }), makeEvent({ documentId: 'A' }), makeEvent({ documentId: 'A' }),
      makeEvent({ documentId: 'B' }), makeEvent({ documentId: 'B' }),
      makeEvent({ documentId: 'C' }),
    ];
    const chunks = chunkEventsByDocument(evs, 4); // soglia 4
    // ogni documento sta TUTTO in un solo chunk (nessun documentId attraversa due chunk)
    for (const id of ['A', 'B', 'C']) {
      const chunksWith = chunks.filter((c) => c.some((e) => e.documentId === id));
      expect(chunksWith).toHaveLength(1);
    }
    // tutti gli eventi sono preservati
    expect(chunks.flat()).toHaveLength(6);
  });

  it('input vuoto → un blocco vuoto, non crash', () => {
    expect(chunkEventsByDocument([], 50)).toEqual([[]]);
  });
});

describe('buildDocSanitariaChunkSpec — nota RC vs non-RC', () => {
  const base = { id: 'documentazione_sanitaria', promptDirective: 'BASE' } as SectionSpec;
  it('RC (excludeLabTests): nota VERBATIM per-documento, NON "selettiva", niente inventario', () => {
    const rc = buildDocSanitariaChunkSpec({ ...base, excludeLabTests: true }, 0, 3);
    expect(rc.promptDirective).toMatch(/VERBATIM/);
    expect(rc.promptDirective).toMatch(/un blocco per documento/i);
    expect(rc.promptDirective).not.toMatch(/narrazione cronologica selettiva/i);
  });
  it('non-RC: mantiene la nota selettiva storica', () => {
    const ctu = buildDocSanitariaChunkSpec({ ...base, excludeLabTests: false }, 0, 3);
    expect(ctu.promptDirective).toMatch(/narrazione cronologica selettiva/i);
  });
});
