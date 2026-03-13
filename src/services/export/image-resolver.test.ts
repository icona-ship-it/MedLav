import { describe, it, expect } from 'vitest';
import { extractOcrImagePaths, replaceWithDataUris, replaceWithProxyUrls } from './image-resolver';

describe('image-resolver', () => {
  describe('extractOcrImagePaths', () => {
    it('should extract ocr-image paths from text', () => {
      const text = `
## Documentazione Sanitaria

In data 15.03.2024 il paziente si presentava presso il P.S.

![RX ginocchio destro](ocr-image:ocr-images/doc1/p5-f0.png)

In data 16.03.2024 veniva eseguita TAC.

![TAC encefalo](ocr-image:ocr-images/doc1/p10-f0.png)
`;
      const paths = extractOcrImagePaths(text);
      expect(paths).toHaveLength(2);
      expect(paths).toContain('ocr-images/doc1/p5-f0.png');
      expect(paths).toContain('ocr-images/doc1/p10-f0.png');
    });

    it('should return empty array for text without images', () => {
      const text = 'No images here. Just text.';
      expect(extractOcrImagePaths(text)).toHaveLength(0);
    });

    it('should deduplicate repeated paths', () => {
      const text = `
![img1](ocr-image:ocr-images/doc1/p5-f0.png)
![img2](ocr-image:ocr-images/doc1/p5-f0.png)
`;
      expect(extractOcrImagePaths(text)).toHaveLength(1);
    });
  });

  describe('replaceWithDataUris', () => {
    it('should replace ocr-image paths with base64 data URIs', () => {
      const text = '![RX](ocr-image:ocr-images/doc1/p5-f0.png)';
      const images = new Map([
        ['ocr-images/doc1/p5-f0.png', {
          storagePath: 'ocr-images/doc1/p5-f0.png',
          base64: 'iVBORw0KGgoAAAANS',
          mimeType: 'image/png',
          buffer: Buffer.from('test'),
        }],
      ]);

      const result = replaceWithDataUris(text, images);
      expect(result).toBe('![RX](data:image/png;base64,iVBORw0KGgoAAAANS)');
    });

    it('should show placeholder for missing images', () => {
      const text = '![RX](ocr-image:ocr-images/missing.png)';
      const images = new Map();

      const result = replaceWithDataUris(text, images);
      expect(result).toBe('[Immagine non disponibile: RX]');
    });
  });

  describe('replaceWithProxyUrls', () => {
    it('should replace ocr-image paths with API proxy URLs', () => {
      const text = '![RX ginocchio](ocr-image:ocr-images/doc1/p5-f0.png)';
      const result = replaceWithProxyUrls(text, 'case-123');
      expect(result).toContain('/api/cases/case-123/images?path=');
      expect(result).toContain('ocr-images%2Fdoc1%2Fp5-f0.png');
      expect(result).toContain('![RX ginocchio]');
    });
  });
});
