import { describe, it, expect } from 'vitest';
import { imageAnalysisForMetadata, stripHallucinatedImageRefs } from './generate-report';

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
