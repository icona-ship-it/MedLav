import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  streamMistralChat: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest', MISTRAL_MEDIUM: 'mistral-medium-latest' },
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

import { classifyDocument, classifyDocumentWithRetry } from './document-classifier';
import { streamMistralChat } from '@/lib/mistral/client';
import { logger } from '@/lib/logger';

const mockStreamChat = streamMistralChat as Mock;
const emptyUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function mockChat(content: string) {
  mockStreamChat.mockResolvedValue({ content, usage: emptyUsage });
}

describe('document-classifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classifyDocument — guard OCR illeggibile/vuoto', () => {
    it('OCR vuoto/whitespace → motivo esplicito, SENZA chiamare l\'LLM', async () => {
      const r = await classifyDocument('   \n\t  ', 'Manoscritto_illeggibile.pdf');
      expect(r.documentType).toBe('altro');
      expect(r.confidence).toBe(0);
      expect(r.reasoning).toMatch(/illeggibil|manoscritt|non.*leggibil/i);
      expect(mockStreamChat).not.toHaveBeenCalled();
    });

    it('OCR sotto soglia (frammento minimo) → guard, niente LLM', async () => {
      const r = await classifyDocument('xq z9', 'scan.pdf');
      expect(r.confidence).toBe(0);
      expect(mockStreamChat).not.toHaveBeenCalled();
    });

    it('OCR sufficiente → procede e chiama l\'LLM', async () => {
      mockChat(JSON.stringify({ documentType: 'referto_specialistico', confidence: 90, reasoning: 'referto' }));
      const r = await classifyDocument('REFERTO DI VISITA ORTOPEDICA. Il paziente presenta...', 'referto.pdf');
      expect(mockStreamChat).toHaveBeenCalledTimes(1);
      expect(r.documentType).toBe('referto_specialistico');
    });
  });

  describe('classifyDocument', () => {
    it('should return correct type for valid JSON response with high confidence', async () => {
      // Arrange
      mockChat(JSON.stringify({ documentType: 'cartella_clinica', confidence: 85, reasoning: 'Contiene diario clinico' }));

      // Act
      const result = await classifyDocument('Diario clinico del paziente...', 'cartella.pdf');

      // Assert
      expect(result.documentType).toBe('cartella_clinica');
      expect(result.confidence).toBe(85);
      expect(result.reasoning).toBe('Contiene diario clinico');
    });

    it('should fall back to "altro" for invalid document type', async () => {
      // Arrange
      mockChat(JSON.stringify({ documentType: 'tipo_inventato', confidence: 90, reasoning: 'Unknown type' }));

      // Act
      const result = await classifyDocument('Documento medico con testo sufficiente per la classificazione', 'file.pdf');

      // Assert
      expect(result.documentType).toBe('altro');
      expect(result.confidence).toBe(90);
      expect(logger.warn).toHaveBeenCalledWith(
        'classification',
        expect.stringContaining('Invalid type "tipo_inventato"'),
      );
    });

    it('should fall back to "altro" with confidence 0 for malformed JSON', async () => {
      // Arrange
      mockChat('This is not JSON at all');

      // Act
      const result = await classifyDocument('Documento medico con testo sufficiente per la classificazione', 'file.pdf');

      // Assert
      expect(result.documentType).toBe('altro');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toBe('Classification parse error');
      expect(logger.error).toHaveBeenCalledWith(
        'classification',
        expect.stringContaining('Failed to parse'),
      );
    });

    it('should sanitize newlines from fileName and truncate to 100 chars', async () => {
      // Arrange
      const longName = 'a'.repeat(150) + '\ninjected';
      mockChat(JSON.stringify({ documentType: 'certificato', confidence: 70, reasoning: 'ok' }));

      // Act
      await classifyDocument('Documento medico con testo sufficiente per la classificazione', longName);

      // Assert
      const callArgs = mockStreamChat.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      // fileName should not contain newlines
      expect(userMsg.content).not.toContain('\n' + 'injected');
      // fileName should be truncated to 100 chars max in the label area
      expect(callArgs.label.length).toBeLessThanOrEqual(39); // 'classify-' + 30 chars
    });

    it('should truncate OCR text to 8000 chars (audit P1-CLASS-001)', async () => {
      // Arrange
      const longText = 'x'.repeat(15000);
      mockChat(JSON.stringify({ documentType: 'esame_laboratorio', confidence: 80, reasoning: 'ok' }));

      // Act
      await classifyDocument(longText, 'esami.pdf');

      // Assert
      const callArgs = mockStreamChat.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMsg.content).toContain('prime 8000 caratteri');
      expect(userMsg.content).not.toContain('x'.repeat(8001));
    });

    it('should handle response with null fields gracefully', async () => {
      // Arrange
      mockChat(JSON.stringify({ documentType: null, confidence: null, reasoning: null }));

      // Act
      const result = await classifyDocument('Documento medico con testo sufficiente per la classificazione', 'file.pdf');

      // Assert
      expect(result.documentType).toBe('altro');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toBe('');
    });

    it('should handle response that is a JSON array (not object)', async () => {
      // Arrange
      mockChat('[1, 2, 3]');

      // Act
      const result = await classifyDocument('Documento medico con testo sufficiente per la classificazione', 'file.pdf');

      // Assert — array is a valid object but not the expected format
      // Our code does String(undefined) -> 'undefined' which is not in valid types
      expect(result.documentType).toBe('altro');
    });

    it('should use MISTRAL_MEDIUM model (RPS ~50 vs 1,25 di large → niente 429 sul batch)', async () => {
      // Arrange
      mockChat(JSON.stringify({ documentType: 'altro', confidence: 50, reasoning: 'generic' }));

      // Act
      await classifyDocument('Documento medico con testo sufficiente per la classificazione', 'file.pdf');

      // Assert
      const callArgs = mockStreamChat.mock.calls[0][0];
      expect(callArgs.model).toBe('mistral-medium-latest');
    });

    it('should request json_schema response format with the documentType enum', async () => {
      // Arrange
      mockChat(JSON.stringify({ documentType: 'altro', confidence: 50, reasoning: 'generic' }));

      // Act
      await classifyDocument('Documento medico con testo sufficiente per la classificazione', 'file.pdf');

      // Assert: json_schema enforces the shape + the documentType enum at the provider.
      const callArgs = mockStreamChat.mock.calls[0][0];
      expect(callArgs.responseFormat.type).toBe('json_schema');
      const schema = callArgs.responseFormat.jsonSchema.schemaDefinition as {
        properties: { documentType: { enum: string[] } };
      };
      expect(schema.properties.documentType.enum).toContain('altro');
      expect(schema.properties.documentType.enum).toContain('referto_specialistico');
    });
  });

  describe('classifyDocumentWithRetry — riprova i fallimenti transitori', () => {
    const goodText = 'Documento medico con testo sufficiente per la classificazione';

    it('riprova quando la chiamata LANCIA e riesce a un tentativo successivo', async () => {
      vi.useFakeTimers();
      mockStreamChat
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValueOnce({
          content: JSON.stringify({ documentType: 'referto_specialistico', confidence: 80, reasoning: 'ok' }),
          usage: emptyUsage,
        });

      const p = classifyDocumentWithRetry(goodText, 'file.pdf');
      await vi.runAllTimersAsync();
      const r = await p;

      expect(r.documentType).toBe('referto_specialistico');
      expect(mockStreamChat).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('lancia dopo aver esaurito i tentativi (1 + 2 retry)', async () => {
      vi.useFakeTimers();
      mockStreamChat.mockRejectedValue(new Error('circuit breaker OPEN'));

      const p = classifyDocumentWithRetry(goodText, 'file.pdf');
      p.catch(() => {}); // evita unhandled rejection durante l'avanzamento timer
      await vi.runAllTimersAsync();

      await expect(p).rejects.toThrow(/circuit breaker/i);
      expect(mockStreamChat).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('NON riprova i casi non-eccezionali (OCR vuoto → altro, nessuna chiamata)', async () => {
      const r = await classifyDocumentWithRetry('   \n  ', 'vuoto.pdf');
      expect(r.documentType).toBe('altro');
      expect(mockStreamChat).not.toHaveBeenCalled();
    });
  });
});
