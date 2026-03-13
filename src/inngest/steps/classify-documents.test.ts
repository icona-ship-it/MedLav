import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/services/classification/document-classifier', () => ({
  classifyDocument: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { classifyDocumentsStep, applyClassifications } from './classify-documents';
import { classifyDocument } from '@/services/classification/document-classifier';
import { logger } from '@/lib/logger';
import type { OcrResult } from './types';

const mockClassify = classifyDocument as Mock;

function makeOcrResult(overrides?: Partial<OcrResult>): OcrResult {
  return {
    documentId: 'doc-1',
    fileName: 'documento.pdf',
    documentType: 'altro',
    fullText: 'Referto di risonanza magnetica del ginocchio destro.',
    pageCount: 3,
    averageConfidence: 90,
    ...overrides,
  };
}

describe('classify-documents step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classifyDocumentsStep', () => {
    it('should return empty array when no documents have type "altro"', async () => {
      // Arrange
      const ocrResults = [
        makeOcrResult({ documentId: 'doc-1', documentType: 'cartella_clinica' }),
        makeOcrResult({ documentId: 'doc-2', documentType: 'esame_strumentale' }),
      ];
      mockClassify.mockResolvedValue({
        documentType: 'cartella_clinica',
        confidence: 85,
        reasoning: 'Matches user type',
      });

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert — all docs classified for metadata, but none reclassified
      expect(result).toEqual([]);
      expect(mockClassify).toHaveBeenCalledTimes(2);
    });

    it('should skip documents with empty OCR text', async () => {
      // Arrange
      const ocrResults = [
        makeOcrResult({ documentId: 'doc-1', fullText: '' }),
        makeOcrResult({ documentId: 'doc-2', fullText: '   ' }),
      ];

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert
      expect(result).toEqual([]);
      expect(mockClassify).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'pipeline',
        expect.stringContaining('No documents with OCR text'),
      );
    });

    it('should accept classification with confidence >= 50', async () => {
      // Arrange
      const ocrResults = [makeOcrResult()];
      mockClassify.mockResolvedValue({
        documentType: 'esame_strumentale',
        confidence: 75,
        reasoning: 'RM ginocchio',
      });

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].documentId).toBe('doc-1');
      expect(result[0].oldType).toBe('altro');
      expect(result[0].newType).toBe('esame_strumentale');
      expect(result[0].confidence).toBe(75);
    });

    it('should reject classification with confidence < 50', async () => {
      // Arrange
      const ocrResults = [makeOcrResult()];
      mockClassify.mockResolvedValue({
        documentType: 'esame_strumentale',
        confidence: 30,
        reasoning: 'Not sure',
      });

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert
      expect(result).toEqual([]);
      expect(logger.info).toHaveBeenCalledWith(
        'pipeline',
        expect.stringContaining('kept as "altro"'),
      );
    });

    it('should reject classification that returned "altro"', async () => {
      // Arrange
      const ocrResults = [makeOcrResult()];
      mockClassify.mockResolvedValue({
        documentType: 'altro',
        confidence: 90,
        reasoning: 'Generic document',
      });

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert
      expect(result).toEqual([]);
    });

    it('should handle Mistral API error gracefully without blocking pipeline', async () => {
      // Arrange
      const ocrResults = [
        makeOcrResult({ documentId: 'doc-1' }),
        makeOcrResult({ documentId: 'doc-2', fullText: 'Cartella clinica completa.' }),
      ];
      mockClassify
        .mockRejectedValueOnce(new Error('Mistral timeout'))
        .mockResolvedValueOnce({
          documentType: 'cartella_clinica',
          confidence: 85,
          reasoning: 'ok',
        });

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].documentId).toBe('doc-2');
      expect(logger.warn).toHaveBeenCalledWith(
        'pipeline',
        expect.stringContaining('Classification failed for doc doc-1'),
      );
    });

    it('should classify all documents but only reclassify "altro" ones', async () => {
      // Arrange
      const ocrResults = [
        makeOcrResult({ documentId: 'doc-1', documentType: 'cartella_clinica' }),
        makeOcrResult({ documentId: 'doc-2', documentType: 'altro' }),
      ];
      mockClassify.mockResolvedValue({
        documentType: 'lettera_dimissione',
        confidence: 80,
        reasoning: 'Dimissione ospedaliera',
      });

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert — both classified for metadata, only "altro" one reclassified
      expect(mockClassify).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].documentId).toBe('doc-2');
    });

    it('should accept classification at exactly 50% confidence', async () => {
      // Arrange
      const ocrResults = [makeOcrResult()];
      mockClassify.mockResolvedValue({
        documentType: 'certificato',
        confidence: 50,
        reasoning: 'Borderline',
      });

      // Act
      const result = await classifyDocumentsStep(ocrResults);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].newType).toBe('certificato');
    });
  });

  describe('applyClassifications', () => {
    it('should update documentType in ocrResults for classified documents', () => {
      // Arrange
      const ocrResults = [
        makeOcrResult({ documentId: 'doc-1', documentType: 'altro' }),
        makeOcrResult({ documentId: 'doc-2', documentType: 'altro' }),
        makeOcrResult({ documentId: 'doc-3', documentType: 'cartella_clinica' }),
      ];
      const classifications = [
        { documentId: 'doc-1', oldType: 'altro', newType: 'esame_strumentale', confidence: 80, reasoning: 'RM' },
        { documentId: 'doc-2', oldType: 'altro', newType: 'certificato', confidence: 60, reasoning: 'cert' },
      ];

      // Act
      applyClassifications(ocrResults, classifications);

      // Assert
      expect(ocrResults[0].documentType).toBe('esame_strumentale');
      expect(ocrResults[1].documentType).toBe('certificato');
      expect(ocrResults[2].documentType).toBe('cartella_clinica'); // unchanged
    });

    it('should handle empty classifications array', () => {
      // Arrange
      const ocrResults = [makeOcrResult({ documentId: 'doc-1', documentType: 'altro' })];

      // Act
      applyClassifications(ocrResults, []);

      // Assert
      expect(ocrResults[0].documentType).toBe('altro'); // unchanged
    });

    it('should handle classifications for documents not in ocrResults', () => {
      // Arrange
      const ocrResults = [makeOcrResult({ documentId: 'doc-1', documentType: 'altro' })];
      const classifications = [
        { documentId: 'doc-999', oldType: 'altro', newType: 'esame_strumentale', confidence: 80, reasoning: 'ok' },
      ];

      // Act — should not throw
      applyClassifications(ocrResults, classifications);

      // Assert
      expect(ocrResults[0].documentType).toBe('altro'); // unchanged
    });
  });
});
