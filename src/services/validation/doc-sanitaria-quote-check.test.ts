import { describe, it, expect } from 'vitest';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import { concatOcrText, annotateDocSanitariaQuotes, annotateDocSanitariaQuotesGated } from './doc-sanitaria-quote-check';

function doc(partial: Partial<DocumentOcrContext>): DocumentOcrContext {
  return {
    documentId: 'd1',
    fileName: 'referto.pdf',
    documentType: 'cartella_clinica',
    pages: [],
    totalChars: 0,
    ...partial,
  };
}

const DOCS: DocumentOcrContext[] = [
  doc({
    documentId: 'a',
    pages: [
      { pageNumber: 1, ocrText: 'Diagnosi: frattura composta del radio distale destro.' },
      { pageNumber: 2, ocrText: '' },
    ],
  }),
  doc({
    documentId: 'b',
    pages: [{ pageNumber: 1, ocrText: 'Prognosi: giorni 30 salvo complicanze.' }],
  }),
];

describe('concatOcrText', () => {
  it('should return empty string for undefined/empty input', () => {
    expect(concatOcrText(undefined)).toBe('');
    expect(concatOcrText([])).toBe('');
  });

  it('should join all non-empty page texts across documents', () => {
    const joined = concatOcrText(DOCS);
    expect(joined).toContain('frattura composta del radio distale destro');
    expect(joined).toContain('giorni 30 salvo complicanze');
  });
});

describe('annotateDocSanitariaQuotes', () => {
  it('should leave a grounded quote untouched', () => {
    const content = 'Il referto descrive una «frattura composta del radio distale destro».';
    const res = annotateDocSanitariaQuotes(content, DOCS);
    expect(res.ungroundedCount).toBe(0);
    expect(res.annotatedMarkdown).toBe(content);
  });

  it('should flag a fabricated quote against the concatenated OCR', () => {
    const content = 'Diagnosi «rottura del tendine di Achille sinistro» riferita.';
    const res = annotateDocSanitariaQuotes(content, DOCS);
    expect(res.ungroundedCount).toBe(1);
    expect(res.annotatedMarkdown).toContain('da verificare sul documento originale');
  });

  it('should treat all meaningful quotes as ungrounded when no OCR is available', () => {
    const content = 'Diagnosi «frattura composta del radio distale destro».';
    const res = annotateDocSanitariaQuotes(content, undefined);
    expect(res.ungroundedCount).toBe(1);
  });
});

describe('annotateDocSanitariaQuotesGated — RC non renderizza i marker ⚠️ (decisione Lavini 2026-06-28)', () => {
  const fabricated = 'Diagnosi «rottura del tendine di Achille sinistro» riferita.';

  it('RC (excludeLabTests): contenuto INVARIATO ma conteggio preservato per audit', () => {
    const res = annotateDocSanitariaQuotesGated(fabricated, DOCS, { excludeLabTests: true });
    // niente marker inline nel testo della perizia firmata...
    expect(res.annotatedMarkdown).toBe(fabricated);
    expect(res.annotatedMarkdown).not.toContain('da verificare');
    // ...ma il conteggio resta per il logger di audit
    expect(res.ungroundedCount).toBe(1);
  });

  it('non-RC (default): annota in place come annotateDocSanitariaQuotes', () => {
    const res = annotateDocSanitariaQuotesGated(fabricated, DOCS, { excludeLabTests: false });
    expect(res.annotatedMarkdown).toContain('da verificare sul documento originale');
    expect(res.ungroundedCount).toBe(1);
  });

  it('RC: una citazione fondata resta invariata (come prima)', () => {
    const grounded = 'Il referto descrive una «frattura composta del radio distale destro».';
    const res = annotateDocSanitariaQuotesGated(grounded, DOCS, { excludeLabTests: true });
    expect(res.annotatedMarkdown).toBe(grounded);
    expect(res.ungroundedCount).toBe(0);
  });
});
