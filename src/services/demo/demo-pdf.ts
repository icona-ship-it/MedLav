/**
 * PDF del documento dimostrativo: una pagina PDF per pagina di testo, con le
 * stesse parole del "testo OCR" in DB. Così "apri documento" mostra un file
 * vero e la trascrizione coincide con ciò che il medico vede.
 */

import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import type { DemoPage } from './demo-case-data';

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const FONT_SIZE = 10.5;
const LINE_HEIGHT = 15;

/** Helvetica (WinAnsi) non codifica oltre Latin-1: i rari caratteri fuori range diventano '?'. */
function toWinAnsi(text: string): string {
  return Array.from(text).map((ch) => (ch.charCodeAt(0) <= 0xff ? ch : '?')).join('');
}

function wrapLine(line: string, font: PDFFont, maxWidth: number): string[] {
  const words = line.split(' ');
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) <= maxWidth || !current) {
      current = candidate;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}

export async function buildDemoPdf(pages: ReadonlyArray<DemoPage>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Documento dimostrativo LegMed - dati fittizi');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  for (const page of pages) {
    const pdfPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    const lines = toWinAnsi(page.text).split('\n').flatMap((l) => (l.trim() ? wrapLine(l, font, maxWidth) : ['']));
    for (const line of lines) {
      if (y < MARGIN) break;
      if (line) pdfPage.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font });
      y -= LINE_HEIGHT;
    }
    pdfPage.drawText(`Documento dimostrativo - dati fittizi - pagina ${page.pageNumber} di ${pages.length}`, {
      x: MARGIN, y: MARGIN / 2, size: 8, font,
    });
  }
  return pdf.save();
}
