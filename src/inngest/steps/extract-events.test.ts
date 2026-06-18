import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/services/extraction/extraction-service', () => ({
  extractEventsFromChunk: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { planChunksSync, PAGES_PER_CHUNK, OVERLAP_PAGES, isRetriableExtractionError } from './extract-events';

describe('planChunksSync — A4 overlap', () => {
  it('should use a stride smaller than the chunk size (overlap is active)', () => {
    expect(OVERLAP_PAGES).toBeGreaterThan(0);
    expect(OVERLAP_PAGES).toBeLessThan(PAGES_PER_CHUNK);
  });

  it('should produce a single chunk for a document at or below chunk size', () => {
    expect(planChunksSync(PAGES_PER_CHUNK)).toEqual([{ start: 1, end: PAGES_PER_CHUNK }]);
    expect(planChunksSync(5)).toEqual([{ start: 1, end: 5 }]);
    expect(planChunksSync(1)).toEqual([{ start: 1, end: 1 }]);
  });

  it('should overlap consecutive chunks by exactly OVERLAP_PAGES pages', () => {
    const ranges = planChunksSync(25);
    expect(ranges.length).toBeGreaterThan(1);

    for (let i = 1; i < ranges.length; i++) {
      const prev = ranges[i - 1];
      const curr = ranges[i];
      // Next chunk must start back inside the previous chunk's range so a
      // referto on the boundary is never split mid-document.
      expect(curr.start).toBeLessThanOrEqual(prev.end);
      const overlapPages = prev.end - curr.start + 1;
      expect(overlapPages).toBe(OVERLAP_PAGES);
    }
  });

  it('should cover every page (no gaps) and stay within pageCount', () => {
    const pageCount = 47;
    const ranges = planChunksSync(pageCount);
    const covered = new Set<number>();
    for (const { start, end } of ranges) {
      expect(start).toBeGreaterThanOrEqual(1);
      expect(end).toBeLessThanOrEqual(pageCount);
      for (let p = start; p <= end; p++) covered.add(p);
    }
    for (let p = 1; p <= pageCount; p++) {
      expect(covered.has(p)).toBe(true);
    }
    expect(ranges[ranges.length - 1].end).toBe(pageCount);
  });

  it('should terminate (no infinite loop) and have stride PAGES_PER_CHUNK - OVERLAP_PAGES', () => {
    const ranges = planChunksSync(100);
    // stride between chunk starts
    const stride = ranges[1].start - ranges[0].start;
    expect(stride).toBe(PAGES_PER_CHUNK - OVERLAP_PAGES);
    expect(ranges.length).toBeLessThan(100); // sanity: bounded
  });

  it('should return no chunks for an empty document', () => {
    expect(planChunksSync(0)).toEqual([]);
  });
});

describe('isRetriableExtractionError — mai perdere un fatto', () => {
  it('rilancia gli errori di INTEGRITÀ (troncamento / JSON irrecuperabile)', () => {
    expect(isRetriableExtractionError('LLM truncation detected (extraction:foo): finishReason=length, 30000 chars')).toBe(true);
    expect(isRetriableExtractionError('Estrazione fallita per "doc": JSON LLM irrecuperabile dopo 3 livelli')).toBe(true);
  });

  it('rilancia i transitori di rete', () => {
    expect(isRetriableExtractionError('fetch failed: ECONNRESET')).toBe(true);
    expect(isRetriableExtractionError('HTTP 503 Service Unavailable')).toBe(true);
  });

  it('rilancia gli altri vettori di perdita silenziosa (insert/pages/stall/empty)', () => {
    expect(isRetriableExtractionError('Event insert failed: deadlock detected')).toBe(true);
    expect(isRetriableExtractionError('Pages not found for chunk, will be retried by Inngest')).toBe(true);
    expect(isRetriableExtractionError('Stream stalled: no tokens received')).toBe(true);
    expect(isRetriableExtractionError('Stream completed but content is empty')).toBe(true);
  });

  it('NON rilancia un errore generico non-integrità (resta {count:0})', () => {
    expect(isRetriableExtractionError('some unexpected non-integrity validation message')).toBe(false);
  });
});
