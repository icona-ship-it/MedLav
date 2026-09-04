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

import { planChunksSync, PAGES_PER_CHUNK, OVERLAP_PAGES, isRetriableExtractionError, buildEventInsertRow, insertEventRowsWithFallback } from './extract-events';
import type { SupabaseClient } from '@supabase/supabase-js';

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

  it('rilancia 500/504 e il circuit-breaker OPEN (audit 2026-08-11, G-1)', () => {
    expect(isRetriableExtractionError('Mistral API error: HTTP 500 Internal Server Error')).toBe(true);
    expect(isRetriableExtractionError('HTTP 504 Gateway Timeout')).toBe(true);
    expect(isRetriableExtractionError('[circuit-breaker] Circuit OPEN — too many failures')).toBe(true);
  });

  it('rilancia i codici di rete che NON contengono la parola "timeout"', () => {
    // 'etimedout' ≠ 'timeout' ('timedout' manca la "e"): prima venivano ingoiati.
    expect(isRetriableExtractionError('connect ETIMEDOUT 1.2.3.4:443')).toBe(true);
    expect(isRetriableExtractionError('connect ECONNREFUSED 1.2.3.4:443')).toBe(true);
    expect(isRetriableExtractionError('write EPIPE')).toBe(true);
  });

  it('rilancia il fallimento dell\'insert di RECUPERO (no perdita silenziosa)', () => {
    expect(isRetriableExtractionError('Retry event insert failed: deadlock detected')).toBe(true);
  });

  it('NON scatta su falsi positivi da substring (word boundary su stalled/insert failed)', () => {
    expect(isRetriableExtractionError('package reinstalled successfully')).toBe(false); // contiene 'stalled' ma non è '\\bstalled\\b'
    expect(isRetriableExtractionError('the module was reinserted into the registry')).toBe(false);
  });
});

describe('buildEventInsertRow — un solo costruttore per main e retry (giro avversariale 2026-09-04)', () => {
  const event = {
    eventDate: '2026-05-22', datePrecision: 'giorno', eventType: 'visita', title: 'Visita', description: 'd',
    sourceType: 'referto_controllo', diagnosis: null, doctor: null, facility: null, confidence: 90,
    requiresVerification: false, reliabilityNotes: null, sourceText: 'Visita', sourcePages: [1],
    temporalScope: 'retrospettivo' as const,
  };

  it('main e retry producono le STESSE colonne (solo extraction_pass cambia)', () => {
    const main = buildEventInsertRow({ caseId: 'c', documentId: 'd', rangeStart: 1, index: 0, event, pass: 'pass1_only' });
    const retry = buildEventInsertRow({ caseId: 'c', documentId: 'd', rangeStart: 1, index: 0, event, pass: 'retry' });
    expect(Object.keys(main).sort()).toEqual(Object.keys(retry).sort());
    expect(main.extraction_pass).toBe('pass1_only');
    expect(retry.extraction_pass).toBe('retry');
    expect(main.temporal_scope).toBe('retrospettivo');
    expect(main.order_number).toBe(1);
  });

  it('temporal_scope fuori enum → corrente (mai un valore che violi il CHECK della 0034)', () => {
    const row = buildEventInsertRow({ caseId: 'c', documentId: 'd', rangeStart: 3, index: 2, event: { ...event, temporalScope: 'past' as unknown as 'corrente' }, pass: 'pass1_only' });
    expect(row.temporal_scope).toBe('corrente');
    expect(row.order_number).toBe(203);
  });
});

describe('insertEventRowsWithFallback — migration 0034 non applicata', () => {
  function fakeClient(responses: Array<{ error: { message: string } | null }>) {
    const inserted: Array<Array<Record<string, unknown>>> = [];
    let call = 0;
    const client = {
      from: () => ({
        insert: (rows: Array<Record<string, unknown>>) => {
          inserted.push(rows);
          return Promise.resolve(responses[call++] ?? { error: null });
        },
      }),
    } as unknown as SupabaseClient;
    return { client, inserted };
  }
  const row = buildEventInsertRow({ caseId: 'c', documentId: 'd', rangeStart: 1, index: 0, pass: 'pass1_only', event: {
    eventDate: '2026-05-22', datePrecision: 'giorno', eventType: 'visita', title: 'V', description: 'd', sourceType: 'altro',
    diagnosis: null, doctor: null, facility: null, confidence: 90, requiresVerification: false, reliabilityNotes: null,
    sourceText: 'V', sourcePages: [1], temporalScope: 'corrente',
  } });

  it('colonna temporal_scope assente → reinserisce SENZA la colonna, degraded=true, nessun errore (il caso prosegue)', async () => {
    const { client, inserted } = fakeClient([{ error: { message: "Could not find the 'temporal_scope' column of 'events' in the schema cache" } }, { error: null }]);
    const res = await insertEventRowsWithFallback(client, [row], 'c', 'test');
    expect(res).toEqual({ error: null, degraded: true });
    expect(inserted).toHaveLength(2);
    expect('temporal_scope' in inserted[1][0]).toBe(false);
    expect(inserted[1][0].title).toBe('V');
  });

  it('altro errore → torna com\'è, nessun secondo insert (mai mascherare un errore vero)', async () => {
    const { client, inserted } = fakeClient([{ error: { message: 'duplicate key value violates unique constraint' } }]);
    const res = await insertEventRowsWithFallback(client, [row], 'c', 'test');
    expect(res.error?.message).toContain('duplicate key');
    expect(res.degraded).toBe(false);
    expect(inserted).toHaveLength(1);
  });

  it('insert riuscito → un solo insert con la colonna', async () => {
    const { client, inserted } = fakeClient([{ error: null }]);
    const res = await insertEventRowsWithFallback(client, [row], 'c', 'test');
    expect(res).toEqual({ error: null, degraded: false });
    expect(inserted).toHaveLength(1);
    expect(inserted[0][0].temporal_scope).toBe('corrente');
  });
});
