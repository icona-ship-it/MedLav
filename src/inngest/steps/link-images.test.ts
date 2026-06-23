import { describe, it, expect } from 'vitest';
import { expandFigureRefs } from './link-images';

describe('expandFigureRefs — multi-figura per pagina (no perdita immagini diagnostiche)', () => {
  it('espande TUTTE le figure di una pagina (image_path separato da ";")', () => {
    const refs = expandFigureRefs(
      [{ page_number: 1, image_path: 'ocr-images/docA/p1-f0.png;ocr-images/docA/p1-f1.png', document_id: 'docA' }],
      15,
    );
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.path)).toEqual(['ocr-images/docA/p1-f0.png', 'ocr-images/docA/p1-f1.png']);
    // documentId/pageNumber propagati su ogni figura (identità per il fix collisione).
    expect(refs.every((r) => r.documentId === 'docA' && r.pageNumber === 1)).toBe(true);
  });

  it('pagina a figura singola → 1 ref (comportamento invariato)', () => {
    const refs = expandFigureRefs([{ page_number: 3, image_path: 'ocr-images/docB/p3-f0.png', document_id: 'docB' }], 15);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ path: 'ocr-images/docB/p3-f0.png', pageNumber: 3, documentId: 'docB' });
  });

  it('rispetta il cap MAX (budget Pixtral) anche con molte figure', () => {
    const pages = Array.from({ length: 5 }, (_, p) => ({
      page_number: p + 1,
      image_path: `a-${p}.png;b-${p}.png;c-${p}.png`, // 3 figure/pagina = 15 totali
      document_id: 'd',
    }));
    expect(expandFigureRefs(pages, 4)).toHaveLength(4); // cap a 4
    expect(expandFigureRefs(pages, 15)).toHaveLength(15);
  });

  it('ignora i segmenti vuoti / spazi (";;" o trailing ";")', () => {
    const refs = expandFigureRefs([{ page_number: 1, image_path: 'x.png; ;y.png;', document_id: 'd' }], 15);
    expect(refs.map((r) => r.path)).toEqual(['x.png', 'y.png']);
  });

  it('lista vuota → []', () => {
    expect(expandFigureRefs([], 15)).toEqual([]);
  });
});
