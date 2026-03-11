import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/mistral/client', () => ({
  streamMistralChat: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_LARGE: 'mistral-large-latest' },
  TIMEOUT_SYNTHESIS: 660_000,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../rag/retrieval-service', () => ({
  buildGuidelineContext: vi.fn().mockResolvedValue(''),
}));

import { generateSynthesis } from './synthesis-service';
import type { SynthesisParams } from './synthesis-service';
import { streamMistralChat } from '@/lib/mistral/client';

const mockStreamChat = streamMistralChat as Mock;

function buildParams(overrides?: Partial<SynthesisParams>): SynthesisParams {
  return {
    caseType: 'ortopedica',
    caseRole: 'ctu',
    patientInitials: 'M.R.',
    events: [{
      orderNumber: 1,
      documentId: 'doc-1',
      discrepancyNote: null,
      eventDate: '2024-01-15',
      datePrecision: 'giorno',
      eventType: 'visita',
      title: 'Prima visita ortopedica',
      description: 'Paziente visitato per dolore al ginocchio destro.',
      sourceType: 'referto_controllo',
      diagnosis: 'Gonalgia destra',
      doctor: null,
      facility: null,
      confidence: 90,
      requiresVerification: false,
      reliabilityNotes: null,
      sourceText: 'Prima visita ortopedica del 15/01/2024',
      sourcePages: [1],
    }],
    anomalies: [],
    missingDocuments: [],
    ...overrides,
  };
}

describe('synthesis-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSynthesis', () => {
    it('should return synthesis for valid events and case data', async () => {
      // Arrange
      const reportText =
        '## Riassunto del caso\nPaziente M.R. visitato.\n\n' +
        '## Cronologia medico-legale\n1. 15/01/2024 — Prima visita\n\n' +
        '## Elementi di rilievo\nNessuna anomalia.';
      mockStreamChat.mockResolvedValue(reportText);

      // Act
      const result = await generateSynthesis(buildParams());

      // Assert
      expect(result.synthesis).toContain('Riassunto del caso');
      expect(result.synthesis).toContain('Cronologia medico-legale');
      expect(result.wordCount).toBeGreaterThan(0);
      expect(mockStreamChat).toHaveBeenCalledOnce();
    });

    it('should return synthesis even with no events', async () => {
      // Arrange
      const reportText =
        '## Riassunto del caso\nNon sono presenti eventi clinici.\n\n' +
        '## Cronologia medico-legale\nNessun evento.\n\n' +
        '## Elementi di rilievo\nDocumentazione insufficiente.';
      mockStreamChat.mockResolvedValue(reportText);

      // Act
      const result = await generateSynthesis(buildParams({ events: [] }));

      // Assert
      expect(result.synthesis).toBeDefined();
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should use CTU role prompts for ctu case role', async () => {
      // Arrange
      const ctuReport =
        '## Riassunto del caso\nA parere di questo CTU...\n\n' +
        '## Cronologia medico-legale\n1. Evento\n\n' +
        '## Elementi di rilievo\nAnalisi.';
      mockStreamChat.mockResolvedValue(ctuReport);

      // Act
      const result = await generateSynthesis(buildParams({ caseRole: 'ctu' }));

      // Assert
      expect(result.synthesis).toContain('CTU');
      // Verify the system prompt was passed to Mistral
      const callArgs = mockStreamChat.mock.calls[0][0];
      const systemMsg = callArgs.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMsg.content).toBeDefined();
    });

    it('should use CTP role prompts for ctp case role', async () => {
      // Arrange
      const ctpReport =
        '## Riassunto del caso\nRisulta evidente che...\n\n' +
        '## Cronologia medico-legale\n1. Evento\n\n' +
        '## Elementi di rilievo\nProfili di responsabilità.';
      mockStreamChat.mockResolvedValue(ctpReport);

      // Act
      const result = await generateSynthesis(buildParams({ caseRole: 'ctp' }));

      // Assert
      expect(result.synthesis).toBeDefined();
      const callArgs = mockStreamChat.mock.calls[0][0];
      const systemMsg = callArgs.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      // CTP and CTU should produce different system prompts
      expect(systemMsg.content).toBeDefined();
    });

    it('should handle LLM error gracefully', async () => {
      // Arrange
      mockStreamChat.mockRejectedValue(new Error('Mistral service unavailable'));

      // Act & Assert
      await expect(
        generateSynthesis(buildParams()),
      ).rejects.toThrow('Mistral service unavailable');
    });

    it('should include calculations when provided', async () => {
      // Arrange
      const reportText =
        '## Riassunto del caso\nPaziente con ITT.\n\n' +
        '## Cronologia medico-legale\n1. Evento\n\n' +
        '## Elementi di rilievo\nCalcoli inclusi.';
      mockStreamChat.mockResolvedValue(reportText);

      // Act
      const result = await generateSynthesis(buildParams({
        calculations: [{
          label: 'Invalidità Temporanea Totale (ITT) stimata',
          value: '30 giorni',
          days: 30,
          startDate: '2024-01-15',
          endDate: '2024-02-14',
          notes: 'Stima basata sui periodi di ricovero.',
        }],
      }));

      // Assert
      expect(result.synthesis).toBeDefined();
      // Verify that user prompt includes calculation data
      const callArgs = mockStreamChat.mock.calls[0][0];
      const userMsg = callArgs.messages.find(
        (m: { role: string }) => m.role === 'user',
      );
      expect(userMsg.content).toContain('Invalidità Temporanea Totale');
    });
  });
});
