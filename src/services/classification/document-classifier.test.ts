import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  streamMistralChat: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  DETERMINISTIC_SEED: 42,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { classifyDocument } from './document-classifier';
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
      const result = await classifyDocument('Testo qualsiasi', 'file.pdf');

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
      const result = await classifyDocument('Testo qualsiasi', 'file.pdf');

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
      await classifyDocument('Testo', longName);

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
      const result = await classifyDocument('Testo', 'file.pdf');

      // Assert
      expect(result.documentType).toBe('altro');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toBe('');
    });

    it('should handle response that is a JSON array (not object)', async () => {
      // Arrange
      mockChat('[1, 2, 3]');

      // Act
      const result = await classifyDocument('Testo', 'file.pdf');

      // Assert — array is a valid object but not the expected format
      // Our code does String(undefined) -> 'undefined' which is not in valid types
      expect(result.documentType).toBe('altro');
    });

    it('should use MISTRAL_LARGE model', async () => {
      // Arrange
      mockChat(JSON.stringify({ documentType: 'altro', confidence: 50, reasoning: 'generic' }));

      // Act
      await classifyDocument('Testo', 'file.pdf');

      // Assert
      const callArgs = mockStreamChat.mock.calls[0][0];
      expect(callArgs.model).toBe('mistral-large-latest');
    });

    it('should request json_object response format', async () => {
      // Arrange
      mockChat(JSON.stringify({ documentType: 'altro', confidence: 50, reasoning: 'generic' }));

      // Act
      await classifyDocument('Testo', 'file.pdf');

      // Assert
      const callArgs = mockStreamChat.mock.calls[0][0];
      expect(callArgs.responseFormat).toEqual({ type: 'json_object' });
    });
  });
});
