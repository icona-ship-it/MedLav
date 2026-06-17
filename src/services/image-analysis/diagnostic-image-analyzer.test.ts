import { describe, it, expect, vi } from 'vitest';

// Mock Mistral client before importing the module
vi.mock('@/lib/mistral/client', () => ({
  getMistralClient: vi.fn(() => ({
    chat: {
      complete: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              imageType: 'radiografia',
              description: 'Si osserva opacità polmonare basale sinistra compatibile con versamento pleurico.',
              confidence: 0.85,
            }),
          },
        }],
      }),
    },
  })),
  withMistralRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  MISTRAL_MODELS: { PIXTRAL_LARGE: 'pixtral-large-latest' },
  TIMEOUT_DEFAULT: 120000,
  DETERMINISTIC_SEED: 42,
}));

import { analyzeDocumentImages } from './diagnostic-image-analyzer';

describe('diagnostic-image-analyzer', () => {
  describe('analyzeDocumentImages', () => {
    it('should return empty array for no images', async () => {
      const results = await analyzeDocumentImages({
        images: [],
        caseType: 'ortopedica',
      });
      expect(results).toHaveLength(0);
    });

    it('should analyze images and return results', async () => {
      const results = await analyzeDocumentImages({
        images: [{ base64: 'dGVzdA==', pageNumber: 3 }],
        caseType: 'ortopedica',
      });

      expect(results).toHaveLength(1);
      expect(results[0].pageNumber).toBe(3);
      expect(results[0].imageType).toBe('radiografia');
      expect(results[0].description).toContain('opacità');
      expect(results[0].confidence).toBe(0.85);
    });

    it('should limit images to maxImages', async () => {
      const images = Array.from({ length: 10 }, (_, i) => ({
        base64: 'dGVzdA==',
        pageNumber: i + 1,
      }));

      const results = await analyzeDocumentImages({
        images,
        caseType: 'oncologica',
        maxImages: 3,
      });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should default maxImages to 15 (audit P1-IMG-002)', async () => {
      const images = Array.from({ length: 20 }, (_, i) => ({
        base64: 'dGVzdA==',
        pageNumber: i + 1,
      }));

      const results = await analyzeDocumentImages({
        images,
        caseType: 'ortopedica',
      });

      expect(results.length).toBeLessThanOrEqual(15);
    });

    // Regressione audit: due documenti con un'immagine sullo STESSO page_number
    // (comunissimo: ogni doc riparte da pag.1) non devono scambiarsi lo
    // storagePath. L'identità viaggia col payload, niente re-attach per pageNumber.
    it('keeps each result’s own storagePath/documentId when two docs share a pageNumber', async () => {
      const results = await analyzeDocumentImages({
        images: [
          { base64: 'dGVzdA==', pageNumber: 3, storagePath: 'ocr-images/docA/p3-f0.png', documentId: 'doc-a' },
          { base64: 'dGVzdA==', pageNumber: 3, storagePath: 'ocr-images/docB/p3-f0.png', documentId: 'doc-b' },
        ],
        caseType: 'ortopedica',
      });

      expect(results).toHaveLength(2);
      const a = results.find((r) => r.documentId === 'doc-a');
      const b = results.find((r) => r.documentId === 'doc-b');
      expect(a?.storagePath).toBe('ocr-images/docA/p3-f0.png');
      expect(b?.storagePath).toBe('ocr-images/docB/p3-f0.png');
    });
  });
});
