import { describe, it, expect } from 'vitest';
import { planDocSanitariaEventBatches, DOC_SANITARIA_EVENT_BATCH_SIZE, filterImagesForBatch } from './doc-sanitaria-batch';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';

function img(overrides?: Partial<ImageAnalysisResult>): ImageAnalysisResult {
  return { pageNumber: 1, imageType: 'radiografia', description: 'd', confidence: 0.9, storagePath: 'p', documentId: 'doc-a', ...overrides };
}

describe('filterImagesForBatch', () => {
  it('keeps only the images whose documentId is in the batch docIds', () => {
    const images = [
      img({ documentId: 'doc-a', storagePath: 'a/1.png' }),
      img({ documentId: 'doc-b', storagePath: 'b/1.png' }),
      img({ documentId: 'doc-a', storagePath: 'a/2.png' }),
    ];
    const out = filterImagesForBatch(images, ['doc-a']);
    expect(out?.map((i) => i.storagePath)).toEqual(['a/1.png', 'a/2.png']);
  });

  it('excludes images without a documentId (not attributable to a window)', () => {
    const out = filterImagesForBatch([img({ documentId: undefined })], ['doc-a']);
    expect(out).toEqual([]);
  });

  it('returns undefined when imageAnalysis is undefined', () => {
    expect(filterImagesForBatch(undefined, ['doc-a'])).toBeUndefined();
  });
});

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

describe('planDocSanitariaEventBatches', () => {
  it('returns no batches for an empty event list', () => {
    expect(planDocSanitariaEventBatches([], 50)).toEqual([]);
  });

  it('puts every event in exactly one batch (no loss, no duplication)', () => {
    const events = Array.from({ length: 217 }, (_, i) => makeEvent({ orderNumber: i + 1 })); // il caso Lavini
    const batches = planDocSanitariaEventBatches(events, 50);
    const flat = batches.flatMap((b) => b.events);
    expect(flat).toEqual(events);
    expect(batches.length).toBe(5); // 50+50+50+50+17
  });

  it('preserves chronological order across and within batches', () => {
    const events = Array.from({ length: 120 }, (_, i) =>
      makeEvent({ orderNumber: i + 1, eventDate: `2024-01-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
    const batches = planDocSanitariaEventBatches(events, 50);
    const flatOrders = batches.flatMap((b) => b.events.map((e) => e.orderNumber));
    expect(flatOrders).toEqual(events.map((e) => e.orderNumber));
  });

  it('derives the deduped set of referenced docIds per batch', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-a' }),
      makeEvent({ orderNumber: 3, documentId: 'doc-b' }),
    ];
    const batches = planDocSanitariaEventBatches(events, 50);
    expect(batches).toHaveLength(1);
    expect(batches[0].docIds).toEqual(['doc-a', 'doc-b']);
  });

  it('keeps docIds scoped to the events of each batch', () => {
    const events = [
      makeEvent({ orderNumber: 1, documentId: 'doc-a' }),
      makeEvent({ orderNumber: 2, documentId: 'doc-b' }),
      makeEvent({ orderNumber: 3, documentId: 'doc-c' }),
    ];
    const batches = planDocSanitariaEventBatches(events, 2);
    expect(batches).toHaveLength(2);
    expect(batches[0].docIds).toEqual(['doc-a', 'doc-b']);
    expect(batches[1].docIds).toEqual(['doc-c']);
  });

  it('degrades to a single batch when size <= 0 (never loses events)', () => {
    const events = [makeEvent({ orderNumber: 1 }), makeEvent({ orderNumber: 2 })];
    const batches = planDocSanitariaEventBatches(events, 0);
    expect(batches).toHaveLength(1);
    expect(batches[0].events).toEqual(events);
  });

  it('computes a readable DD.MM.YYYY date range per batch (first – last)', () => {
    const events = [
      makeEvent({ orderNumber: 1, eventDate: '2024-03-15' }),
      makeEvent({ orderNumber: 2, eventDate: '2024-06-20' }),
    ];
    const [batch] = planDocSanitariaEventBatches(events, 50);
    expect(batch.dateRange).toBe('15.03.2024 – 20.06.2024');
  });

  it('exposes a sane default batch size', () => {
    expect(DOC_SANITARIA_EVENT_BATCH_SIZE).toBeGreaterThan(0);
    expect(DOC_SANITARIA_EVENT_BATCH_SIZE).toBeLessThanOrEqual(80);
  });
});
