import { describe, it, expect } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/pipeline-diagnostics', () => ({
  recordDiagnostic: vi.fn(),
  classifyPipelineError: vi.fn(() => 'ocr_failed'),
  sanitizeErrorForDetail: vi.fn((s: string) => s),
}));
vi.mock('./ocr-document', () => ({ fetchOcrRawResult: vi.fn(), saveOcrImagesToStorage: vi.fn() }));

import { vi } from 'vitest';
import { combineOcrResultsForGroup } from './ocr-merged-group';
import type { OcrPageResult } from '@/services/ocr/ocr-types';

/** Dati FITTIZI. */
function makePage(pageNumber: number, text: string, confidence = 90): OcrPageResult {
  return { pageNumber, text, confidence, hasHandwriting: null, handwritingConfidence: null, images: [] };
}

describe('combineOcrResultsForGroup', () => {
  it('renumbers pages progressively across files (pag. 1/2/3 del referto fotografato)', () => {
    const combined = combineOcrResultsForGroup([
      { pages: [makePage(1, 'prima pagina')], images: [], averageConfidence: 90, pageCount: 1 },
      { pages: [makePage(1, 'seconda pagina')], images: [], averageConfidence: 80, pageCount: 1 },
      { pages: [makePage(1, 'terza pagina')], images: [], averageConfidence: 70, pageCount: 1 },
    ]);

    expect(combined.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(combined.pages.map((p) => p.text)).toEqual(['prima pagina', 'seconda pagina', 'terza pagina']);
    expect(combined.averageConfidence).toBeCloseTo(80);
    expect(combined.totalChars).toBe('prima pagina'.length + 'seconda pagina'.length + 'terza pagina'.length);
  });

  it('offsets multi-page files and remaps image page numbers', () => {
    const combined = combineOcrResultsForGroup([
      { pages: [makePage(1, 'a'), makePage(2, 'b')], images: [{ imageId: 'i1', imageBase64: 'x', pageNumber: 2, figureIndex: 1 }], averageConfidence: 90, pageCount: 2 },
      { pages: [makePage(1, 'c')], images: [{ imageId: 'i2', imageBase64: 'y', pageNumber: 1, figureIndex: 1 }], averageConfidence: 90, pageCount: 1 },
    ]);

    expect(combined.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(combined.images.map((i) => i.pageNumber)).toEqual([2, 3]);
  });

  it('drops images whose source page is missing (never crashes)', () => {
    const combined = combineOcrResultsForGroup([
      { pages: [makePage(1, 'a')], images: [{ imageId: 'i1', imageBase64: 'x', pageNumber: 99, figureIndex: 1 }], averageConfidence: 90, pageCount: 1 },
    ]);
    expect(combined.images).toHaveLength(0);
  });

  it('handles empty input', () => {
    const combined = combineOcrResultsForGroup([]);
    expect(combined.pages).toHaveLength(0);
    expect(combined.averageConfidence).toBe(0);
  });
});
