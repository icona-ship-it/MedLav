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
  MISTRAL_MODELS: { PIXTRAL_LARGE: 'pixtral-large-2411' },
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

    it('should default maxImages to 5', async () => {
      const images = Array.from({ length: 8 }, (_, i) => ({
        base64: 'dGVzdA==',
        pageNumber: i + 1,
      }));

      const results = await analyzeDocumentImages({
        images,
        caseType: 'ortopedica',
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });
});
