import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  getAiActDisclosureHtml,
  getAiActHtmlMetaTags,
  getAiActDocxMetadata,
  applyAiActPdfMetadata,
} from './ai-act-disclosure';
import { generateHtmlReport, generateProfessionalHtmlReport } from './html-export';

describe('ai-act-disclosure — marcatura machine-readable (art. 50(2) AI Act)', () => {
  describe('getAiActHtmlMetaTags', () => {
    it('should emit an ai-generated=true meta tag', () => {
      const tags = getAiActHtmlMetaTags();
      expect(tags).toContain('name="ai-generated" content="true"');
    });

    it('should emit a generator meta tag naming LegMed', () => {
      const tags = getAiActHtmlMetaTags();
      expect(tags).toMatch(/name="generator" content="[^"]*LegMed[^"]*"/);
    });

    it('should embed the full disclosure text in a meta tag', () => {
      const tags = getAiActHtmlMetaTags();
      expect(tags).toContain('name="ai-disclosure"');
      expect(tags).toContain('Regolamento UE 2024/1689');
    });

    it('should not contain unescaped double quotes inside attribute values', () => {
      // Ogni content="..." deve chiudersi senza doppi apici interni non-escapati
      const tags = getAiActHtmlMetaTags();
      for (const match of tags.matchAll(/content="([^"]*)"/g)) {
        expect(match[1]).not.toContain('"');
      }
    });
  });

  describe('getAiActDocxMetadata', () => {
    it('should return custom properties marking the document as AI-generated', () => {
      const meta = getAiActDocxMetadata();
      const names = (meta.customProperties ?? []).map((p) => p.name);
      expect(names).toContain('AIGenerated');
      const aiGen = (meta.customProperties ?? []).find((p) => p.name === 'AIGenerated');
      expect(aiGen?.value).toBe('true');
    });

    it('should carry the disclosure in the description core property', () => {
      const meta = getAiActDocxMetadata();
      expect(meta.description).toContain('intelligenza artificiale');
      expect(meta.description).toContain('2024/1689');
    });

    it('should name LegMed as creator', () => {
      const meta = getAiActDocxMetadata();
      expect(meta.creator).toContain('LegMed');
    });
  });

  describe('applyAiActPdfMetadata', () => {
    it('should stamp producer/subject/keywords into an existing PDF buffer', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      const original = Buffer.from(await doc.save());

      const marked = await applyAiActPdfMetadata(original);

      // updateMetadata:false — altrimenti pdf-lib sovrascrive il Producer al load
      const reloaded = await PDFDocument.load(marked, { updateMetadata: false });
      expect(reloaded.getProducer()).toContain('LegMed');
      expect(reloaded.getSubject()).toContain('intelligenza artificiale');
      expect(reloaded.getKeywords()).toContain('ai-generated');
    });
  });

  describe('wiring negli export HTML', () => {
    const baseParams = {
      caseCode: 'CASO-TEST-001',
      caseType: 'rc_auto',
      caseRole: 'stragiudiziale',
      patientInitials: null,
      synthesis: null,
      events: [],
      anomalies: [],
      missingDocs: [],
    };

    it('generateHtmlReport should include the machine-readable meta tags in <head>', () => {
      const html = generateHtmlReport(baseParams);
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head).toContain('name="ai-generated" content="true"');
      expect(head).toContain('name="ai-disclosure"');
    });

    it('generateProfessionalHtmlReport should include the machine-readable meta tags in <head>', () => {
      const html = generateProfessionalHtmlReport({
        ...baseParams,
        periziaMetadata: { ctuName: 'Dott. Test' },
        documentsWithPages: [],
      });
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head).toContain('name="ai-generated" content="true"');
    });
  });

  describe('dicitura visibile (regressione)', () => {
    it('should keep citing both L. 132/2025 and Reg. UE 2024/1689', () => {
      const html = getAiActDisclosureHtml();
      expect(html).toContain('132/2025');
      expect(html).toContain('2024/1689');
    });
  });
});
