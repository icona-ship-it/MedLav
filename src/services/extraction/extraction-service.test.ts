import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  streamMistralChat: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  TIMEOUT_EXTRACTION: 300_000,
  DETERMINISTIC_SEED: 42,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  extractEventsFromChunk,
  prepareExtractionChunks,
} from './extraction-service';
import { streamMistralChat } from '@/lib/mistral/client';

const mockStreamChat = streamMistralChat as Mock;

describe('extraction-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractEventsFromChunk', () => {
    it('should return parsed events from valid LLM response', async () => {
      // Arrange
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2024-03-15',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita ortopedica',
          description: 'Paziente sottoposto a visita ortopedica di controllo.',
          sourceType: 'referto_controllo',
          diagnosis: 'Frattura femore',
          doctor: null,
          facility: null,
          confidence: 85,
          requiresVerification: false,
          reliabilityNotes: null,
          sourceText: 'Visita ortopedica di controllo del 15/03/2024',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue(llmResponse);

      // Act
      const result = await extractEventsFromChunk({
        chunkText: 'Referto del 15/03/2024: visita ortopedica di controllo.',
        chunkLabel: 'doc-test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      // Assert
      expect(result.events).toHaveLength(1);
      expect(result.events[0].title).toBe('Visita ortopedica');
      expect(result.events[0].eventDate).toBe('2024-03-15');
      expect(result.events[0].confidence).toBe(85);
      expect(mockStreamChat).toHaveBeenCalledOnce();
    });

    it('should return empty events for empty LLM response', async () => {
      // Arrange
      mockStreamChat.mockResolvedValue(JSON.stringify({ events: [] }));

      // Act
      const result = await extractEventsFromChunk({
        chunkText: 'Testo senza eventi clinici rilevanti.',
        chunkLabel: 'doc-empty.pdf',
        documentType: 'altro',
        caseType: 'generica',
      });

      // Assert
      expect(result.events).toHaveLength(0);
    });

    it('should handle malformed LLM response gracefully', async () => {
      // Arrange — truncated JSON
      mockStreamChat.mockResolvedValue(
        '{"events": [{"title": "Intervento", "description": "desc", "eventDate": "2024-01-01"',
      );

      // Act
      const result = await extractEventsFromChunk({
        chunkText: 'Cartella clinica con dati incompleti.',
        chunkLabel: 'doc-malformed.pdf',
        documentType: 'cartella_clinica',
        caseType: 'ortopedica',
      });

      // Assert — should recover partial data via jsonrepair
      expect(result).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
    });

    it('should propagate LLM errors', async () => {
      // Arrange
      mockStreamChat.mockRejectedValue(new Error('Mistral API timeout'));

      // Act & Assert
      await expect(
        extractEventsFromChunk({
          chunkText: 'Testo qualsiasi.',
          chunkLabel: 'doc-error.pdf',
          documentType: 'altro',
          caseType: 'generica',
        }),
      ).rejects.toThrow('Mistral API timeout');
    });
  });

  describe('prepareExtractionChunks', () => {
    it('should return single chunk for short text', () => {
      // Arrange
      const shortText = 'Referto breve con pochi dati clinici.';

      // Act
      const { chunks } = prepareExtractionChunks({
        documentText: shortText,
        fileName: 'short.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      // Assert
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain('Referto breve');
    });

    it('should split long text into multiple chunks', () => {
      // Arrange — text exceeding MAX_CHUNK_CHARS (15_000)
      const longText = 'Dato clinico importante. '.repeat(1000);

      // Act
      const { chunks } = prepareExtractionChunks({
        documentText: longText,
        fileName: 'long-doc.pdf',
        documentType: 'cartella_clinica',
        caseType: 'ortopedica',
      });

      // Assert
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(20_000);
      }
    });
  });
});
