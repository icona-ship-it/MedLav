/**
 * AI Act / Legge 132/2025 transparency disclosure for exported reports.
 *
 * Italian Law 132/2025 (in force since 2025-10-10) and EU AI Act Art. 50 require
 * professionals using AI to inform clients clearly when AI was used in producing
 * a document. For LegMed (forensic medico-legal reports), this disclosure must
 * appear visibly on every exported HTML/DOCX so the perito and any downstream
 * recipient (giudice, parties, paziente) can see that AI assisted the redaction.
 *
 * Centralised so the wording stays consistent across all export formats and
 * can be updated in a single place if regulation changes.
 */

import { Paragraph, TextRun, AlignmentType } from 'docx';

/** Single source of truth for the disclosure wording. */
const DISCLOSURE_TEXT =
  'Il presente documento è stato redatto con l\'ausilio di un sistema di intelligenza artificiale ' +
  '(LegMed, basato su Mistral AI EU). L\'analisi clinica, la valutazione medico-legale e la sottoscrizione ' +
  'sono attribuibili esclusivamente al medico legale firmatario, che ha verificato e validato ' +
  'integralmente il contenuto. Ai sensi della Legge 132/2025 e del Regolamento UE 2024/1689 (AI Act).';

/**
 * HTML markup — italics, justified, muted color. Designed to render correctly
 * both inline (Cmd+P preview) and on print/PDF. Uses inline styles only to
 * avoid stylesheet conflicts in standalone exports.
 */
export function getAiActDisclosureHtml(): string {
  return `<div class="ai-act-disclosure" style="margin-top:30px;padding:14px 18px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;font-style:italic;line-height:1.55;text-align:justify">${DISCLOSURE_TEXT}</div>`;
}

/**
 * docx.js paragraph blocks — italics, 9pt, muted grey, justified.
 * Returns an array so callers can spread it into the children list.
 */
export function getAiActDisclosureDocxParagraphs(): Paragraph[] {
  return [
    new Paragraph({ text: '', spacing: { before: 200 } }),
    new Paragraph({
      children: [
        new TextRun({
          text: DISCLOSURE_TEXT,
          italics: true,
          color: '6B7280',
          size: 18, // 9pt (size in half-points)
        }),
      ],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 100, after: 200, line: 280 },
    }),
  ];
}
