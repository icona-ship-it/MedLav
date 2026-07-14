import { describe, it, expect } from 'vitest';
import { imageAnalysisForMetadata, stripHallucinatedImageRefs, applyDeterministicImageCaptions, type ImageCaptionMeta } from './generate-report';

describe('applyDeterministicImageCaptions — didascalia tracciabile con fonte (fronte E)', () => {
  const imgs: ImageCaptionMeta[] = [
    { storagePath: 'ocr-images/d1/p3-f1.jpg', imageType: 'radiografia', description: 'Frattura del femore distale. Altri dettagli.', pageNumber: 3, documentId: 'd1' },
    { storagePath: 'ocr-images/d2/p1-f1.jpg', imageType: 'tac', description: 'Emorragia subaracnoidea.', pageNumber: 1, documentId: 'd2' },
  ];
  const names = new Map([['d1', 'RX_femore.pdf'], ['d2', 'TAC_cranio.pdf']]);

  it('riscrive alt-text con Fig progressiva, tipo, descrizione e fonte (doc + pagina)', () => {
    const md = 'Testo ![vecchio](ocr-image:ocr-images/d1/p3-f1.jpg) e ![altro](ocr-image:ocr-images/d2/p1-f1.jpg).';
    const out = applyDeterministicImageCaptions(md, imgs, names);
    expect(out).toContain('![Fig. 1 — radiografia (Frattura del femore distale.) — fonte: RX_femore.pdf, pag. 3](ocr-image:ocr-images/d1/p3-f1.jpg)');
    expect(out).toContain('![Fig. 2 — tac (Emorragia subaracnoidea.) — fonte: TAC_cranio.pdf, pag. 1](ocr-image:ocr-images/d2/p1-f1.jpg)');
  });

  it('numerazione progressiva per apparizione → niente "Fig. 1" duplicate', () => {
    const md = '![a](ocr-image:ocr-images/d2/p1-f1.jpg)\n![b](ocr-image:ocr-images/d1/p3-f1.jpg)';
    const out = applyDeterministicImageCaptions(md, imgs, names);
    expect((out.match(/Fig\. 1/g) ?? [])).toHaveLength(1);
    expect((out.match(/Fig\. 2/g) ?? [])).toHaveLength(1);
  });

  it('fonte senza nome documento → mostra solo la pagina', () => {
    const md = '![x](ocr-image:ocr-images/d1/p3-f1.jpg)';
    const out = applyDeterministicImageCaptions(md, imgs, new Map());
    expect(out).toContain('— pag. 3]');
    expect(out).not.toContain('fonte:');
  });

  it('immagine non nota → lasciata invariata', () => {
    const md = '![x](ocr-image:sconosciuta.jpg)';
    expect(applyDeterministicImageCaptions(md, imgs, names)).toBe(md);
  });

  it('imageType "altro" → etichetta generica', () => {
    const other: ImageCaptionMeta[] = [{ storagePath: 'p.jpg', imageType: 'altro', description: '', pageNumber: 2 }];
    const out = applyDeterministicImageCaptions('![x](ocr-image:p.jpg)', other, new Map());
    expect(out).toContain('Immagine diagnostica');
  });
});

describe('imageAnalysisForMetadata', () => {
  it('keeps the re-embed fields and drops token usage', () => {
    const out = imageAnalysisForMetadata([
      {
        pageNumber: 3,
        imageType: 'radiografia',
        description: 'RX ginocchio dx',
        confidence: 0.9,
        storagePath: 'ocr-images/doc-a/p3-f0.png',
        documentId: 'doc-a',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      },
    ]);
    expect(out).toEqual([
      {
        pageNumber: 3,
        imageType: 'radiografia',
        description: 'RX ginocchio dx',
        confidence: 0.9,
        storagePath: 'ocr-images/doc-a/p3-f0.png',
        documentId: 'doc-a',
      },
    ]);
    expect('usage' in out[0]).toBe(false);
  });

  it('returns an empty array for undefined input', () => {
    expect(imageAnalysisForMetadata(undefined)).toEqual([]);
  });

  // FIX 4: la chiave imageAnalysis viene SEMPRE persistita (anche []) così la
  // rigenerazione distingue "pre-fix senza chiave" da "post-fix senza immagini".
  it('returns an empty array for empty input (key persisted even with no images)', () => {
    expect(imageAnalysisForMetadata([])).toEqual([]);
  });
});

describe('stripHallucinatedImageRefs', () => {
  const real = 'ocr-images/doc-a/p3-f0.png';

  // Regressione audit (blocker-1): un'immagine reale (whitelist popolata dal
  // reload su regenerate) NON deve essere strippata.
  it('keeps a real image ref present in the whitelist', () => {
    const report = `Premessa.\n\n![Fig. 1 — radiografia](ocr-image:${real})\n\nSeguito.`;
    const out = stripHallucinatedImageRefs(report, new Set([real]));
    expect(out).toContain(`ocr-image:${real}`);
  });

  it('strips an invented image ref absent from the whitelist', () => {
    const report = 'Premessa.\n\n![Fig. 1](ocr-image:ocr-images/fake/p9-f0.png)\n\nSeguito.';
    const out = stripHallucinatedImageRefs(report, new Set([real]));
    expect(out).not.toContain('ocr-image:');
    expect(out).toContain('Premessa.');
    expect(out).toContain('Seguito.');
  });

  it('keeps the real and strips the fake within the same report', () => {
    const report = `![reale](ocr-image:${real})\n![finta](ocr-image:fake/x.png)`;
    const out = stripHallucinatedImageRefs(report, new Set([real]));
    expect(out).toContain(real);
    expect(out).not.toContain('fake/x.png');
  });

  it('with an empty whitelist strips everything (the pre-fix regenerate bug, now guarded by reload)', () => {
    const report = `![a](ocr-image:${real})`;
    const out = stripHallucinatedImageRefs(report, new Set());
    expect(out).not.toContain('ocr-image:');
  });
});
