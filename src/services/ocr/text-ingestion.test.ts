import { describe, it, expect } from 'vitest';
import {
  extractTextFromXml,
  paginatePlainText,
  isTextIngestType,
  textMimeFromExtension,
  buildTextIngestResult,
  TEXT_PAGE_CHARS,
} from './text-ingestion';

describe('text-ingestion', () => {
  describe('extractTextFromXml', () => {
    it('should keep text nodes and strip tags (CDA-style referto)', () => {
      const xml = `<?xml version="1.0"?>
<ClinicalDocument>
  <title>Referto di laboratorio</title>
  <text>Emocromo: Hb 13.2 g/dL. Glicemia 98 mg/dL.</text>
</ClinicalDocument>`;
      const out = extractTextFromXml(xml);
      expect(out).toContain('Referto di laboratorio');
      expect(out).toContain('Emocromo: Hb 13.2 g/dL. Glicemia 98 mg/dL.');
      expect(out).not.toContain('<');
      expect(out).not.toContain('ClinicalDocument');
    });

    it('should preserve attribute VALUES (DatiAtto-style case data)', () => {
      const xml = '<DatiAtto><Parte cognome="ROSSI" nome="MARIO" cf="RSSMRA80A01H501U"/><Ufficio descrizione="Tribunale di Verona"/></DatiAtto>';
      const out = extractTextFromXml(xml);
      expect(out).toContain('ROSSI');
      expect(out).toContain('MARIO');
      expect(out).toContain('RSSMRA80A01H501U');
      expect(out).toContain('Tribunale di Verona');
    });

    it('should remove base64 payloads (PEC receipts) with an explicit marker', () => {
      const base64Block = Array.from({ length: 6 }, () => 'QWxhZGRpbjpvcGVuIHNlc2FtZQ=='.repeat(3)).join('\n');
      const xml = `<Ricevuta><Consegna data="2026-04-28T10:31:00"/><Allegato>${base64Block}</Allegato></Ricevuta>`;
      const out = extractTextFromXml(xml);
      expect(out).toContain('2026-04-28T10:31:00');
      expect(out).toContain('[contenuto binario omesso]');
      expect(out).not.toContain('QWxhZGRpbjpvcGVuIHNlc2FtZQ==');
    });

    it('should keep CDATA content and decode entities', () => {
      const xml = '<nota><![CDATA[Paziente &amp; figlio]]></nota><voce>Visita &#232; urgente &lt;subito&gt;</voce>';
      const out = extractTextFromXml(xml);
      expect(out).toContain('Paziente & figlio');
      expect(out).toContain('Visita è urgente <subito>');
    });

    it('should never throw on malformed input', () => {
      expect(() => extractTextFromXml('<a><b attr="x">testo')).not.toThrow();
      expect(extractTextFromXml('<a><b attr="x">testo')).toContain('testo');
      expect(extractTextFromXml('')).toBe('');
    });
  });

  describe('paginatePlainText', () => {
    it('should return one page for short text and split long text at line boundaries', () => {
      expect(paginatePlainText('breve')).toEqual(['breve']);
      const lines = Array.from({ length: 200 }, (_, i) => `Riga numero ${i} con contenuto clinico di esempio.`);
      const pages = paginatePlainText(lines.join('\n'));
      expect(pages.length).toBeGreaterThan(1);
      for (const p of pages) expect(p.length).toBeLessThanOrEqual(TEXT_PAGE_CHARS);
      // No content lost
      expect(pages.join('\n')).toBe(lines.join('\n'));
    });

    it('should return zero pages for empty content', () => {
      expect(paginatePlainText('   \n  ')).toEqual([]);
    });
  });

  describe('isTextIngestType / textMimeFromExtension', () => {
    it('should detect xml/txt by MIME or extension, and not claim pdf', () => {
      expect(isTextIngestType('text/xml', 'DatiAtto.xml')).toBe(true);
      expect(isTextIngestType('', 'DatiAtto.xml')).toBe(true); // empty browser MIME
      expect(isTextIngestType('text/plain', 'note.txt')).toBe(true);
      expect(isTextIngestType('application/pdf', 'doc.pdf')).toBe(false);
      expect(textMimeFromExtension('a.xml')).toBe('text/xml');
      expect(textMimeFromExtension('a.txt')).toBe('text/plain');
      expect(textMimeFromExtension('a.pdf')).toBeNull();
    });
  });

  describe('buildTextIngestResult', () => {
    it('should produce an OCR-shaped result with ocrPages 0 (no OCR cost)', () => {
      const result = buildTextIngestResult({
        documentId: 'doc-1',
        fileName: 'DatiAtto.xml',
        fileType: 'text/xml',
        rawText: '<DatiAtto><Ufficio descrizione="Tribunale di Verona"/></DatiAtto>',
      });
      expect(result.pageCount).toBe(1);
      expect(result.pages[0].text).toContain('Tribunale di Verona');
      expect(result.pages[0].confidence).toBe(100);
      expect(result.ocrPages).toBe(0);
      expect(result.images).toEqual([]);
    });

    it('should produce zero pages for an XML with no extractable content (fail-loud upstream)', () => {
      const result = buildTextIngestResult({
        documentId: 'doc-2',
        fileName: 'vuoto.xml',
        fileType: 'text/xml',
        rawText: '<root></root>',
      });
      expect(result.pageCount).toBe(0);
      expect(result.averageConfidence).toBe(0);
    });
  });
});
