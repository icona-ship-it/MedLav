import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  streamMistralChat: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  TIMEOUT_EXTRACTION: 240_000,
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
  inferMissingDates,
} from './extraction-service';
import type { ExtractedEvent } from './extraction-schemas';
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
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

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
      mockStreamChat.mockResolvedValue({ content: JSON.stringify({ events: [] }), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

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
      mockStreamChat.mockResolvedValue({
        content: '{"events": [{"title": "Intervento", "description": "desc", "eventDate": "2024-01-01"',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });

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

  describe('date format normalization (D4 fix)', () => {
    it('should accept ISO YYYY-MM-DD format', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2024-03-15',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita',
          description: 'Visita di controllo.',
          sourceType: 'referto_controllo',
          confidence: 85,
          sourceText: 'Visita del 15/03/2024',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Visita del 15/03/2024: controllo post-operatorio.',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].eventDate).toBe('2024-03-15');
    });

    it('should normalize DD.MM.YYYY to YYYY-MM-DD', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '15.03.2024',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita',
          description: 'Desc.',
          sourceType: 'referto_controllo',
          confidence: 85,
          sourceText: 'Visita del 15.03.2024',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Visita del 15.03.2024',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].eventDate).toBe('2024-03-15');
    });

    it('should normalize DD/MM/YYYY to YYYY-MM-DD', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '15/03/2024',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita',
          description: 'Desc.',
          sourceType: 'referto_controllo',
          confidence: 85,
          sourceText: 'Visita',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Visita del 15/03/2024',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].eventDate).toBe('2024-03-15');
    });

    it('should use sentinel for unrecognizable date format', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: 'March 15th 2024',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita',
          description: 'Desc.',
          sourceType: 'referto_controllo',
          confidence: 85,
          sourceText: 'Visita',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Visit of March 15th 2024',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].eventDate).toBe('1900-01-01');
      expect(result.events[0].requiresVerification).toBe(true);
    });
  });

  describe('name validation against OCR (C2 fix)', () => {
    it('should preserve doctor name found in OCR text', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2024-03-15',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita ortopedica',
          description: 'Controllo.',
          sourceType: 'referto_controllo',
          doctor: 'Dott. Rossi',
          facility: null,
          confidence: 90,
          sourceText: 'Visita dal Dott. Rossi',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Visita dal Dott. Rossi il 15/03/2024 presso ambulatorio.',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].doctor).toBe('Dott. Rossi');
      expect(result.events[0].confidence).toBe(90);
    });

    it('should nullify doctor name NOT found in OCR text', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2024-03-15',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita ortopedica',
          description: 'Controllo.',
          sourceType: 'referto_controllo',
          doctor: 'Prof. Bianchi Giovanni',
          facility: null,
          confidence: 90,
          sourceText: 'Visita di controllo',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Visita di controllo del 15/03/2024 presso ambulatorio ortopedico.',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      // Doctor name not in OCR → nullified for safety
      expect(result.events[0].doctor).toBeNull();
      expect(result.events[0].confidence).toBeLessThanOrEqual(50);
      expect(result.events[0].requiresVerification).toBe(true);
    });

    it('should nullify facility name NOT found in OCR text', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2024-03-15',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita',
          description: 'Desc.',
          sourceType: 'referto_controllo',
          doctor: null,
          facility: 'Ospedale Fantasma Roma',
          confidence: 85,
          sourceText: 'Visita di controllo',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Visita presso il Pronto Soccorso cittadino il 15/03/2024.',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].facility).toBeNull();
      expect(result.events[0].confidence).toBeLessThanOrEqual(50);
    });
  });

  describe('inferMissingDates (C3 fix)', () => {
    function makeTestEvent(overrides: Partial<ExtractedEvent>): ExtractedEvent {
      return {
        eventDate: '2024-01-15',
        datePrecision: 'giorno',
        eventType: 'visita',
        title: 'Test event',
        description: 'Test.',
        sourceType: 'referto_controllo',
        diagnosis: null,
        doctor: null,
        facility: null,
        confidence: 90,
        requiresVerification: false,
        reliabilityNotes: null,
        sourceText: 'Test',
        sourcePages: [1],
        ...overrides,
      };
    }

    it('should infer date from same page with confidence capped at 25', () => {
      const events = [
        makeTestEvent({ eventDate: '1900-01-01', sourcePages: [5], title: 'Esame senza data' }),
        makeTestEvent({ eventDate: '2024-03-15', sourcePages: [5], title: 'Visita datata' }),
      ];

      const result = inferMissingDates(events);

      expect(result[0].eventDate).toBe('2024-03-15');
      expect(result[0].confidence).toBeLessThanOrEqual(25);
      expect(result[0].requiresVerification).toBe(true);
      expect(result[0].datePrecision).toBe('sconosciuta');
    });

    it('should include INFERITA note in reliabilityNotes', () => {
      const events = [
        makeTestEvent({ eventDate: '1900-01-01', sourcePages: [3] }),
        makeTestEvent({ eventDate: '2024-06-01', sourcePages: [3] }),
      ];

      const result = inferMissingDates(events);

      expect(result[0].reliabilityNotes).toContain('INFERITA');
      expect(result[0].reliabilityNotes).toContain('non presente nel documento originale');
    });

    it('should not infer if all events have sentinel dates', () => {
      const events = [
        makeTestEvent({ eventDate: '1900-01-01', sourcePages: [1] }),
        makeTestEvent({ eventDate: '1900-01-01', sourcePages: [2] }),
      ];

      const result = inferMissingDates(events);

      expect(result[0].eventDate).toBe('1900-01-01');
      expect(result[1].eventDate).toBe('1900-01-01');
    });

    it('should not modify events that already have valid dates', () => {
      const events = [
        makeTestEvent({ eventDate: '2024-03-15', confidence: 95, sourcePages: [1] }),
      ];

      const result = inferMissingDates(events);

      expect(result[0].eventDate).toBe('2024-03-15');
      expect(result[0].confidence).toBe(95);
    });

    it('should cap confidence even if original was very high', () => {
      const events = [
        makeTestEvent({ eventDate: '1900-01-01', confidence: 99, sourcePages: [1] }),
        makeTestEvent({ eventDate: '2024-01-01', confidence: 95, sourcePages: [1] }),
      ];

      const result = inferMissingDates(events);

      // Even with original confidence 99, inferred date caps at 25
      expect(result[0].confidence).toBeLessThanOrEqual(25);
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
