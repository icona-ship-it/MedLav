import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildDemoPdf } from './demo-pdf';
import { DEMO_DOCUMENTS } from './demo-case-data';

describe('buildDemoPdf', () => {
  it('produce un PDF valido con una pagina per pagina di testo, anche con accenti', async () => {
    const doc = DEMO_DOCUMENTS[0]!;
    const bytes = await buildDemoPdf(doc.pages);
    expect(bytes.byteLength).toBeGreaterThan(500);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(doc.pages.length);
  });

  it('non fallisce su caratteri fuori Latin-1 (sostituiti)', async () => {
    const bytes = await buildDemoPdf([{ pageNumber: 1, text: 'Flessione ≥ 90° → ok — Cittàdemo' }]);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });
});
