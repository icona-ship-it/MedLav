import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DocumentOcrContext } from '@/inngest/steps/types';

// Mock Mistral client before importing the module
vi.mock('@/lib/mistral/client', () => ({
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  streamMistralChat: vi.fn(),
  DETERMINISTIC_SEED: 42,
  assertNotTruncated: vi.fn(),
}));

// Supabase admin mock (used by summarizeDocumentBatchByIds via dynamic import)
const supabaseMocks = vi.hoisted(() => ({
  pagesOrder: vi.fn(),
  storageDownload: vi.fn(),
  storageUpload: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ order: supabaseMocks.pagesOrder }),
      }),
    }),
    storage: {
      from: () => ({
        download: supabaseMocks.storageDownload,
        upload: supabaseMocks.storageUpload,
      }),
    },
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  summarizeDocument,
  summarizeDocumentBatch,
  summarizeDocumentBatchByIds,
  buildTailPrioritizedOcrInput,
  shouldUseMapReduce,
  summaryCachePath,
  hashOcrTextForCache,
  OCR_PER_DOC_SUMMARY_LIMIT,
  DOC_SUMMARY_MAX_CHARS,
  MAP_REDUCE_THRESHOLD_DOCS,
  MIN_TOTAL_CHARS_FOR_MAP_REDUCE,
} from './document-summarizer';
import { streamMistralChat } from '@/lib/mistral/client';

const mockStreamMistralChat = vi.mocked(streamMistralChat);

function makeDoc(overrides?: Partial<DocumentOcrContext>): DocumentOcrContext {
  return {
    documentId: 'doc-1',
    fileName: 'referto.pdf',
    documentType: 'referto_controllo',
    pages: [
      { pageNumber: 1, ocrText: 'Referto di visita ortopedica del 15/03/2024. Diagnosi: frattura femore.' },
    ],
    totalChars: 70,
    ...overrides,
  };
}

describe('document-summarizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('summarizeDocument', () => {
    it('should return a structured summary from Mistral response', async () => {
      mockStreamMistralChat.mockResolvedValueOnce({
        content: 'Referto ortopedico: frattura femore diagnosticata il 15/03/2024.',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      });

      const doc = makeDoc();
      const result = await summarizeDocument(doc);

      expect(result.documentId).toBe('doc-1');
      expect(result.fileName).toBe('referto.pdf');
      expect(result.documentType).toBe('referto_controllo');
      expect(result.summary).toContain('frattura femore');
      expect(result.totalCharsOriginal).toBe(70);
    });

    it('should truncate summary to DOC_SUMMARY_MAX_CHARS', async () => {
      const longSummary = 'A'.repeat(DOC_SUMMARY_MAX_CHARS + 500);
      mockStreamMistralChat.mockResolvedValueOnce({
        content: longSummary,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      });

      const result = await summarizeDocument(makeDoc());
      expect(result.summary.length).toBe(DOC_SUMMARY_MAX_CHARS);
    });

    it('should truncate OCR input to OCR_PER_DOC_SUMMARY_LIMIT', async () => {
      const longPage = 'X'.repeat(OCR_PER_DOC_SUMMARY_LIMIT + 1000);
      mockStreamMistralChat.mockResolvedValueOnce({
        content: 'Summary',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        finishReason: 'stop',
      });

      const doc = makeDoc({
        pages: [{ pageNumber: 1, ocrText: longPage }],
        totalChars: longPage.length,
      });

      await summarizeDocument(doc);

      const callArgs = mockStreamMistralChat.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      // The OCR text in the prompt should be truncated
      expect(userMessage?.content.length).toBeLessThanOrEqual(OCR_PER_DOC_SUMMARY_LIMIT + 200); // +200 for prompt prefix
    });
  });

  describe('buildTailPrioritizedOcrInput — A7 tail priority', () => {
    it('returns text unchanged when within the limit', () => {
      const text = 'Documento breve';
      expect(buildTailPrioritizedOcrInput(text, 1000)).toBe(text);
    });

    it('never exceeds the limit', () => {
      const text = 'Z'.repeat(5000);
      expect(buildTailPrioritizedOcrInput(text, 1000).length).toBeLessThanOrEqual(1000);
    });

    it('preserves the END of the document (discharge / final therapy)', () => {
      const head = 'INIZIO '.repeat(2000);
      const tail = 'LETTERA DI DIMISSIONE: terapia domiciliare enoxaparina, follow-up a 30 giorni. FINE';
      const full = head + 'X'.repeat(40_000) + tail;
      const result = buildTailPrioritizedOcrInput(full, OCR_PER_DOC_SUMMARY_LIMIT);
      expect(result).toContain('LETTERA DI DIMISSIONE');
      expect(result).toContain('follow-up a 30 giorni');
      expect(result.endsWith('FINE')).toBe(true);
    });

    it('maximizes the head with a bounded tail reserve (minimizes middle-drop)', () => {
      const full = 'A'.repeat(90_000);
      const result = buildTailPrioritizedOcrInput(full, 45_000);
      const markerIdx = result.indexOf('[...PORZIONE');
      const beforeMarker = result.slice(0, markerIdx);
      const afterMarker = result.slice(result.indexOf(']', markerIdx) + 1).trim();
      // Head gets most of the budget; tail is a bounded reserve (~12K).
      expect(beforeMarker.length).toBeGreaterThan(25_000);
      expect(beforeMarker.length).toBeGreaterThan(afterMarker.length);
      expect(afterMarker.length).toBeLessThanOrEqual(12_000);
    });

    it('keeps mid-document content within the head budget (operative report at ~30K)', () => {
      // A 60-page-equivalent doc; operative report marker at offset ~30K must
      // survive in the head (the regression the rebalance fixes).
      const pre = 'X'.repeat(30_000);
      const opReport = 'DESCRIZIONE OPERATORIA: osteosintesi piatto tibiale.';
      const mid = 'Y'.repeat(20_000);
      const tail = 'LETTERA DI DIMISSIONE: terapia domiciliare, follow-up 30gg.';
      const full = pre + opReport + mid + tail;
      const result = buildTailPrioritizedOcrInput(full, 45_000);
      expect(result).toContain('DESCRIZIONE OPERATORIA'); // mid-doc preserved in head
      expect(result).toContain('LETTERA DI DIMISSIONE');   // tail preserved
    });

    it('keeps both head and tail with an omission marker between', () => {
      const full = 'HEAD' + 'm'.repeat(60_000) + 'TAILEND';
      const result = buildTailPrioritizedOcrInput(full, 20_000);
      expect(result.startsWith('HEAD')).toBe(true);
      expect(result.endsWith('TAILEND')).toBe(true);
      expect(result).toContain('PORZIONE CENTRALE OMESSA');
    });
  });

  describe('summarizeDocumentBatch', () => {
    it('should process all documents and return summaries', async () => {
      mockStreamMistralChat
        .mockResolvedValueOnce({
          content: 'Summary 1',
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          content: 'Summary 2',
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: 'stop',
        });

      const docs = [
        makeDoc({ documentId: 'doc-1', fileName: 'doc1.pdf' }),
        makeDoc({ documentId: 'doc-2', fileName: 'doc2.pdf' }),
      ];

      const results = await summarizeDocumentBatch(docs);
      expect(results).toHaveLength(2);
      expect(results[0].summary).toBe('Summary 1');
      expect(results[1].summary).toBe('Summary 2');
    });

    it('should include fallback with raw text when a document fails', async () => {
      mockStreamMistralChat
        .mockResolvedValueOnce({
          content: 'Summary 1',
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: 'stop',
        })
        .mockRejectedValueOnce(new Error('Mistral timeout'));

      const docs = [
        makeDoc({ documentId: 'doc-1' }),
        makeDoc({
          documentId: 'doc-2',
          pages: [{ pageNumber: 1, ocrText: 'Contenuto importante del documento.' }],
          totalChars: 35,
        }),
      ];

      const results = await summarizeDocumentBatch(docs);
      expect(results).toHaveLength(2);
      expect(results[0].summary).toBe('Summary 1');
      expect(results[1].summary).toContain('Riassunto non disponibile');
      expect(results[1].summary).toContain('Contenuto importante del documento');
    });

    it('should handle empty document gracefully in fallback', async () => {
      mockStreamMistralChat.mockRejectedValueOnce(new Error('fail'));

      const docs = [makeDoc({ pages: [], totalChars: 0 })];
      const results = await summarizeDocumentBatch(docs);

      expect(results).toHaveLength(1);
      expect(results[0].summary).toContain('nessun testo estraibile');
    });

    it('should preserve input order with concurrent summarization', async () => {
      // Resolve doc-2 FIRST, doc-1 later: order must still follow the input
      let resolveFirst: (v: Awaited<ReturnType<typeof streamMistralChat>>) => void;
      mockStreamMistralChat
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
        .mockResolvedValueOnce({
          content: 'Summary doc-2',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          finishReason: 'stop',
        });

      const pending = summarizeDocumentBatch([
        makeDoc({ documentId: 'doc-1' }),
        makeDoc({ documentId: 'doc-2' }),
      ]);
      // Let doc-2 settle first, then release doc-1
      await new Promise((r) => setTimeout(r, 0));
      resolveFirst!({
        content: 'Summary doc-1',
        usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 },
        finishReason: 'stop',
      });

      const results = await pending;
      expect(results.map((r) => r.documentId)).toEqual(['doc-1', 'doc-2']);
      expect(results[0].summary).toBe('Summary doc-1');
      expect(results[1].summary).toBe('Summary doc-2');
    });

    it('should expose LLM usage on each summary for cost tracking', async () => {
      mockStreamMistralChat.mockResolvedValueOnce({
        content: 'Summary',
        usage: { promptTokens: 120, completionTokens: 40, totalTokens: 160 },
        finishReason: 'stop',
      });
      const result = await summarizeDocument(makeDoc());
      expect(result.usage).toEqual({ promptTokens: 120, completionTokens: 40, totalTokens: 160 });
    });
  });

  describe('summarizeDocumentBatchByIds — persistent cache', () => {
    const PAGES = { data: [{ page_number: 1, ocr_text: 'Referto: frattura femore, dimissione 20/03/2024.' }] };
    const REF = { documentId: 'doc-1', fileName: 'referto.pdf', documentType: 'referto_controllo' };

    it('should return the cached summary WITHOUT calling the LLM on cache hit', async () => {
      supabaseMocks.pagesOrder.mockResolvedValueOnce(PAGES);
      supabaseMocks.storageDownload.mockResolvedValueOnce({
        data: {
          text: async () => JSON.stringify({
            documentId: 'doc-1',
            fileName: 'referto.pdf',
            documentType: 'referto_controllo',
            summary: 'RIASSUNTO IN CACHE',
            totalCharsOriginal: 48,
          }),
        },
        error: null,
      });

      const results = await summarizeDocumentBatchByIds([REF]);

      expect(results).toHaveLength(1);
      expect(results[0].summary).toBe('RIASSUNTO IN CACHE');
      expect(results[0].usage).toBeUndefined(); // no tokens paid on hit
      expect(mockStreamMistralChat).not.toHaveBeenCalled();
      expect(supabaseMocks.storageUpload).not.toHaveBeenCalled();
    });

    it('should summarize and write the cache (usage stripped) on cache miss', async () => {
      supabaseMocks.pagesOrder.mockResolvedValueOnce(PAGES);
      supabaseMocks.storageDownload.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
      supabaseMocks.storageUpload.mockResolvedValueOnce({ error: null });
      mockStreamMistralChat.mockResolvedValueOnce({
        content: 'Riassunto fresco dal modello.',
        usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140 },
        finishReason: 'stop',
      });

      const results = await summarizeDocumentBatchByIds([REF]);

      expect(results[0].summary).toBe('Riassunto fresco dal modello.');
      expect(results[0].usage).toEqual({ promptTokens: 100, completionTokens: 40, totalTokens: 140 });
      expect(mockStreamMistralChat).toHaveBeenCalledTimes(1);
      expect(supabaseMocks.storageUpload).toHaveBeenCalledTimes(1);
      const [path, body] = supabaseMocks.storageUpload.mock.calls[0];
      expect(path).toMatch(/^doc-summaries\/doc-1\/[0-9a-f]{16}-[0-9a-f]{12}\.json$/);
      expect(JSON.parse(body as string)).not.toHaveProperty('usage'); // never re-reports cost
    });

    it('cache key should change when the OCR text changes', () => {
      const a = summaryCachePath('doc-1', hashOcrTextForCache('testo A'));
      const b = summaryCachePath('doc-1', hashOcrTextForCache('testo B'));
      expect(a).not.toBe(b);
      expect(a.startsWith('doc-summaries/doc-1/')).toBe(true);
    });
  });

  describe('shouldUseMapReduce', () => {
    it('should require BOTH doc count and total volume', () => {
      // Classic large case: many docs, lots of text
      expect(shouldUseMapReduce(MAP_REDUCE_THRESHOLD_DOCS, MIN_TOTAL_CHARS_FOR_MAP_REDUCE)).toBe(true);
      expect(shouldUseMapReduce(15, 500_000)).toBe(true);
      // Many tiny docs (12 one-page certificates): raw OCR fits directly — skip
      expect(shouldUseMapReduce(12, 40_000)).toBe(false);
      // Few huge docs: stays on the direct-OCR path (tail-priority truncation)
      expect(shouldUseMapReduce(3, 800_000)).toBe(false);
      // Boundaries
      expect(shouldUseMapReduce(MAP_REDUCE_THRESHOLD_DOCS - 1, MIN_TOTAL_CHARS_FOR_MAP_REDUCE)).toBe(false);
      expect(shouldUseMapReduce(MAP_REDUCE_THRESHOLD_DOCS, MIN_TOTAL_CHARS_FOR_MAP_REDUCE - 1)).toBe(false);
    });
  });
});
