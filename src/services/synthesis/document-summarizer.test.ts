import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DocumentOcrContext } from '@/inngest/steps/types';

// Mock Mistral client before importing the module
vi.mock('@/lib/mistral/client', () => ({
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  streamMistralChat: vi.fn(),
  DETERMINISTIC_SEED: 42,
  assertNotTruncated: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { summarizeDocument, summarizeDocumentBatch, OCR_PER_DOC_SUMMARY_LIMIT, DOC_SUMMARY_MAX_CHARS } from './document-summarizer';
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
  });
});
