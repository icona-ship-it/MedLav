import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  streamMistralChat: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  TIMEOUT_EXTRACTION: 240_000,
  DETERMINISTIC_SEED: 42,
  assertNotTruncated: vi.fn(),
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
  normalizeDateFormat,
} from './extraction-service';
import type { ExtractedEvent } from './extraction-schemas';
import { streamMistralChat } from '@/lib/mistral/client';
import { logger } from '@/lib/logger';

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

  describe('data con precisione "sconosciuta" dal LLM — scartata, mai stampata (feedback medici 2026-08-19, CASO-033 "01.01.1990")', () => {
    /** Risposta LLM minimale con data/precisione parametrizzate. */
    function llmEventWith(eventDate: string, datePrecision: string): string {
      return JSON.stringify({
        events: [{
          eventDate,
          datePrecision,
          eventType: 'visita',
          title: 'Consulenza medico-legale',
          description: 'Consulenza menzionata in anamnesi.',
          sourceType: 'altro',
          confidence: 40,
          sourceText: 'consulenza medico-legale',
          sourcePages: [1],
        }],
      });
    }

    it('should replace LLM-invented date with sentinel when datePrecision is "sconosciuta"', async () => {
      // Il contratto interno: precisione "sconosciuta" + data valida è riservata
      // alle date DONATE da inferMissingDates. Il LLM che la emette direttamente
      // sta inventando (CASO-033: quattro eventi "1990-01-01" stampati in perizia).
      mockStreamChat.mockResolvedValue({ content: llmEventWith('1990-01-01', 'sconosciuta'), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'consulenza medico-legale senza data',
        chunkLabel: 'test.pdf',
        documentType: 'altro',
        caseType: 'generica',
      });

      expect(result.events[0].eventDate).toBe('1900-01-01');
      expect(result.events[0].datePrecision).toBe('sconosciuta');
      expect(result.events[0].requiresVerification).toBe(true);
      expect(result.events[0].reliabilityNotes).toContain('scartata');
    });

    it('should NOT touch a valid date with precision "giorno" (non-regression)', async () => {
      mockStreamChat.mockResolvedValue({ content: llmEventWith('2025-04-30', 'giorno'), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Ricovero del 30/04/2025',
        chunkLabel: 'test.pdf',
        documentType: 'altro',
        caseType: 'generica',
      });

      expect(result.events[0].eventDate).toBe('2025-04-30');
      expect(result.events[0].datePrecision).toBe('giorno');
      expect(result.events[0].requiresVerification).toBe(false);
    });

    it('should keep valid date but fall back to "giorno" when precision is outside the enum', async () => {
      // Enum DB: giorno|mese|anno|sconosciuta. Un valore alieno ('day') non deve
      // né far fallire l'insert né scartare una data vera.
      mockStreamChat.mockResolvedValue({ content: llmEventWith('2025-04-30', 'day'), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Ricovero del 30/04/2025',
        chunkLabel: 'test.pdf',
        documentType: 'altro',
        caseType: 'generica',
      });

      expect(result.events[0].eventDate).toBe('2025-04-30');
      expect(result.events[0].datePrecision).toBe('giorno');
    });

    it('should keep sentinel + "sconosciuta" when precision is outside the enum and date is missing', async () => {
      mockStreamChat.mockResolvedValue({ content: llmEventWith('', 'unknown'), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'evento senza data',
        chunkLabel: 'test.pdf',
        documentType: 'altro',
        caseType: 'generica',
      });

      expect(result.events[0].eventDate).toBe('1900-01-01');
      expect(result.events[0].datePrecision).toBe('sconosciuta');
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

    // Beta 2026-07-20 (CASO-2026-028): "Dr. Scapolo Vittorio" — nome interamente
    // inventato attribuito a 3 eventi — passava perché UNA parola del nome
    // coincideva per caso col testo (es. "Vittorio" in un indirizzo). Ora TUTTI
    // i token del nome (titoli esclusi) devono trovarsi nell'OCR.
    it('nullifica un nome inventato anche se UNA parola coincide per caso (es. toponimo)', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2026-05-13',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Visita ortopedica',
          description: 'Consulenza.',
          sourceType: 'referto_controllo',
          doctor: 'Dr. Scapolo Vittorio',
          facility: null,
          confidence: 90,
          sourceText: 'Visita ortopedica in urgenza',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        // "vittorio" compare nel testo (via Vittorio Veneto), "scapolo" no.
        chunkText: 'Visita ortopedica in urgenza. Ambulatorio di via Vittorio Veneto 12. Referto firmato.',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].doctor).toBeNull();
      expect(result.events[0].requiresVerification).toBe(true);
    });

    // Audit 2026-07-23: il \b di JS è ASCII-only — /\bcannavò\b/ non matcha MAI
    // un cognome accentato, e col criterio all-token il nome REALE veniva azzerato.
    it('conserva un cognome ACCENTATO presente verbatim nell\'OCR (Cannavò)', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2026-05-13', datePrecision: 'giorno', eventType: 'visita',
          title: 'Visita', description: 'Controllo.', sourceType: 'referto_controllo',
          doctor: 'Dott. Cannavò Marco', facility: null, confidence: 90,
          sourceText: 'Visita di controllo', sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
      const result = await extractEventsFromChunk({
        chunkText: 'Visita di controllo. Referto firmato Dott. Cannavò Marco in data odierna.',
        chunkLabel: 'test.pdf', documentType: 'referto_controllo', caseType: 'ortopedica',
      });
      expect(result.events[0].doctor).toBe('Dott. Cannavò Marco');
      expect(result.events[0].confidence).toBe(90);
    });

    it('cognome di 2 lettere (Dr. Re): nessun token confrontabile → lasciato INTATTO, mai azzerato', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2026-05-13', datePrecision: 'giorno', eventType: 'visita',
          title: 'Visita', description: 'Controllo.', sourceType: 'referto_controllo',
          doctor: 'Dr. Re', facility: null, confidence: 90,
          sourceText: 'Visita di controllo', sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
      const result = await extractEventsFromChunk({
        chunkText: 'Visita di controllo. Firmato Dr. Re.',
        chunkLabel: 'test.pdf', documentType: 'referto_controllo', caseType: 'ortopedica',
      });
      expect(result.events[0].doctor).toBe('Dr. Re');
      expect(result.events[0].requiresVerification).toBe(false);
    });

    it('accetta il nome reale anche con ordine invertito e titolo diverso (Piccoli Dr. Marco → Dr. Marco Piccoli)', async () => {
      const llmResponse = JSON.stringify({
        events: [{
          eventDate: '2026-05-13',
          datePrecision: 'giorno',
          eventType: 'visita',
          title: 'Consulenza ortopedica',
          description: 'Risposta consulenza.',
          sourceType: 'referto_controllo',
          doctor: 'Dott. Marco Piccoli',
          facility: null,
          confidence: 90,
          sourceText: 'Risposta consulenza',
          sourcePages: [1],
        }],
      });
      mockStreamChat.mockResolvedValue({ content: llmResponse, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

      const result = await extractEventsFromChunk({
        chunkText: 'Risposta consulenza. Il Medico Piccoli Dr. Marco. Frattura composta malleolo.',
        chunkLabel: 'test.pdf',
        documentType: 'referto_controllo',
        caseType: 'ortopedica',
      });

      expect(result.events[0].doctor).toBe('Dott. Marco Piccoli');
      expect(result.events[0].confidence).toBe(90);
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
      expect(result[0].confidence).toBeLessThanOrEqual(40);
      expect(result[0].confidence).toBeGreaterThanOrEqual(10);
      expect(result[0].requiresVerification).toBe(true);
      expect(result[0].datePrecision).toBe('sconosciuta');
    });

    it('should include INFERITA note in reliabilityNotes', () => {
      const events = [
        makeTestEvent({ eventDate: '1900-01-01', sourcePages: [3] }),
        makeTestEvent({ eventDate: '2024-06-01', sourcePages: [3] }),
      ];

      const result = inferMissingDates(events);

      expect(result[0].reliabilityNotes).toContain('Data approssimata');
      expect(result[0].reliabilityNotes).toContain('Verificare sul documento originale');
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

      // Even with original confidence 99, inferred date is penalized (max 40, min 10)
      expect(result[0].confidence).toBeLessThanOrEqual(40);
      expect(result[0].confidence).toBeGreaterThanOrEqual(10);
    });

    // ── Ondata 9 (bug Lavini): donor ambiguo non deve inventare una data ──
    it('does NOT infer when the page has MULTIPLE distinct dates (ambiguity → no fabricated date)', () => {
      // Pagina con ricovero (10.01) + esame senza data + dimissione (20.01).
      // Il vecchio codice assegnava la dimissione (più recente) all'esame: data
      // SBAGLIATA in un timeline forense. Ora resta sentinella (perito decide).
      const events = [
        makeTestEvent({ eventDate: '2024-01-10', sourcePages: [5], eventType: 'ricovero', title: 'Ricovero' }),
        makeTestEvent({ eventDate: '1900-01-01', sourcePages: [5], eventType: 'esame', title: 'Esami ematochimici senza data' }),
        makeTestEvent({ eventDate: '2024-01-20', sourcePages: [5], title: 'Dimissione' }),
      ];

      const result = inferMissingDates(events);
      const undated = result.find((e) => e.title.includes('senza data'))!;
      expect(undated.eventDate).toBe('1900-01-01'); // NON eredita la dimissione
    });

    it('still infers when the page is unambiguous (single date among donors)', () => {
      const events = [
        makeTestEvent({ eventDate: '2024-03-15', sourcePages: [7], title: 'Visita' }),
        makeTestEvent({ eventDate: '2024-03-15', sourcePages: [7], title: 'Esame stesso giorno' }),
        makeTestEvent({ eventDate: '1900-01-01', sourcePages: [7], title: 'Referto senza data' }),
      ];
      const result = inferMissingDates(events);
      const undated = result.find((e) => e.title.includes('senza data'))!;
      expect(undated.eventDate).toBe('2024-03-15'); // pagina mono-data → eredita
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
      // Arrange — text exceeding MAX_CHUNK_CHARS (8_000)
      const longText = 'Dato clinico importante. '.repeat(500);

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
        expect(chunk.length).toBeLessThanOrEqual(12_000);
      }
    });
  });
});

// ── Ondata 2 (audit): normalizeDateFormat valida la data reale, non solo il formato ──
describe('Audit Ondata 2 — normalizeDateFormat', () => {
  it('passes through a valid ISO date', () => {
    expect(normalizeDateFormat('2024-03-15')).toBe('2024-03-15');
  });

  it('converts a valid European date to ISO', () => {
    expect(normalizeDateFormat('15.03.2024')).toBe('2024-03-15');
    expect(normalizeDateFormat('5/3/2024')).toBe('2024-03-05');
  });

  it('rejects a format-valid but NON-existent ISO date (no silent rollover)', () => {
    // 2024-02-31 would roll over to 2024-03-02 via new Date(); must become null→sentinel.
    expect(normalizeDateFormat('2024-02-31')).toBeNull();
    expect(normalizeDateFormat('2024-13-01')).toBeNull(); // invalid month
    expect(normalizeDateFormat('2024-00-10')).toBeNull(); // month 0
    expect(normalizeDateFormat('2023-02-29')).toBeNull(); // non-leap year
  });

  it('accepts Feb 29 on a leap year', () => {
    expect(normalizeDateFormat('2024-02-29')).toBe('2024-02-29');
  });

  it('rejects an impossible European date (31.02)', () => {
    expect(normalizeDateFormat('31.02.2024')).toBeNull();
  });

  it('returns null for unrecognizable input', () => {
    expect(normalizeDateFormat('not a date')).toBeNull();
    expect(normalizeDateFormat('2024')).toBeNull();
  });
});

describe('GDPR Art.9 — i log NON espongono il body LLM grezzo (nomi/diagnosi)', () => {
  const SECRET = 'PazienteSegretoXYZ';
  const DIAG = 'neoplasiamalignaSEGRETA';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function allLoggedStrings(): string {
    const calls = [
      ...(logger.error as Mock).mock.calls,
      ...(logger.warn as Mock).mock.calls,
      ...(logger.info as Mock).mock.calls,
    ];
    return calls.flat().filter((a): a is string => typeof a === 'string').join(' || ');
  }

  it('JSON LLM irrecuperabile: non logga il body grezzo (solo lunghezza)', async () => {
    mockStreamChat.mockResolvedValue({
      content: `garbage non-json ${SECRET} ${DIAG} <<< ][ }{ %%%`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    // Può throware (irrecuperabile) o tornare {events:[]} (jsonrepair): in
    // ENTRAMBI i casi il body grezzo NON deve finire nei log.
    try {
      await extractEventsFromChunk({ chunkText: 'x', chunkLabel: 'doc-secret.pdf', documentType: 'altro', caseType: 'generica' });
    } catch { /* irrecuperabile → ok */ }
    const logged = allLoggedStrings();
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(DIAG);
  });

  it('JSON valido ma senza eventi: non logga il content grezzo', async () => {
    mockStreamChat.mockResolvedValue({
      content: JSON.stringify({ foo: `${SECRET} ${DIAG}`, note: 'referto clinico riservato' }),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    const result = await extractEventsFromChunk({ chunkText: 'x', chunkLabel: 'doc-secret2.pdf', documentType: 'altro', caseType: 'generica' });
    expect(result.events).toHaveLength(0);
    const logged = allLoggedStrings();
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(DIAG);
  });
});

describe('recupero JSON parziale — eventi flaggati, non silenzioso (mai perdere un fatto)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('JSON troncato/riparato -> partialRecovery=true e OGNI evento requiresVerification + nota', async () => {
    // 1 evento completo + 1 troncato: Level 1 fallisce, jsonrepair recupera scartando
    // la coda incompleta (perdita silenziosa che ora viene segnalata).
    const ev = '{"eventDate":"2024-03-15","datePrecision":"giorno","eventType":"visita","title":"Visita ortopedica","description":"controllo","sourceType":"referto_controllo","diagnosis":null,"doctor":null,"facility":null,"confidence":80,"requiresVerification":false,"reliabilityNotes":null,"sourceText":"Visita ortopedica del 15/03/2024","sourcePages":[1]}';
    mockStreamChat.mockResolvedValue({
      content: `{"events": [${ev},{"eventDate":"2024-04-01","title":"Secondo evento tronc`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    const result = await extractEventsFromChunk({
      chunkText: 'Visita ortopedica del 15/03/2024 di controllo.',
      chunkLabel: 'doc-trunc.pdf', documentType: 'referto_controllo', caseType: 'ortopedica',
    });
    expect(result.partialRecovery).toBe(true);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
    for (const e of result.events) {
      expect(e.requiresVerification).toBe(true);
      expect(e.reliabilityNotes ?? '').toContain('verificare la completezza');
    }
  });

  it('JSON valido pulito -> partialRecovery falsy, nessun flag aggiuntivo', async () => {
    const ev = { eventDate: '2024-03-15', datePrecision: 'giorno', eventType: 'visita', title: 'Visita ortopedica', description: 'controllo', sourceType: 'referto_controllo', diagnosis: null, doctor: null, facility: null, confidence: 80, requiresVerification: false, reliabilityNotes: null, sourceText: 'Visita ortopedica del 15/03/2024', sourcePages: [1] };
    mockStreamChat.mockResolvedValue({
      content: JSON.stringify({ events: [ev] }),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    const result = await extractEventsFromChunk({
      chunkText: 'Visita ortopedica del 15/03/2024 di controllo.',
      chunkLabel: 'doc-clean.pdf', documentType: 'referto_controllo', caseType: 'ortopedica',
    });
    expect(result.partialRecovery).toBeFalsy();
    expect(result.events[0].requiresVerification).toBe(false);
    expect(result.events[0].reliabilityNotes ?? '').not.toContain('verificare la completezza');
  });
});

describe('normalizeDateFormat — bound di plausibilità anni (audit 2026-07-16)', () => {
  it('accetta anni plausibili (1900..anno+1)', () => {
    expect(normalizeDateFormat('2024-03-15')).toBe('2024-03-15');
    expect(normalizeDateFormat('15.03.2024')).toBe('2024-03-15');
    expect(normalizeDateFormat('1950-01-01')).toBe('1950-01-01');
  });
  it('rifiuta anni impossibili da OCR-misread (troppo nel futuro o troppo antichi)', () => {
    expect(normalizeDateFormat('2074-03-15')).toBeNull(); // 2014→2074 misread
    expect(normalizeDateFormat('1014-03-15')).toBeNull(); // 2014→1014 misread
    expect(normalizeDateFormat('1899-12-31')).toBeNull();
  });
});
