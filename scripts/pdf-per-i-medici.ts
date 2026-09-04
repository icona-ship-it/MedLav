/**
 * PDF per i medici (2026-09-04): dai markdown di docs/per-i-medici/<data>/ genera
 *  - PDF di sola lettura (specifica, guida, esempio, messaggio) via Chrome (markdownToHtml + CSS);
 *  - PDF COMPILABILI (domande per il perito, modulo di feedback) via pdf-lib con campi modulo
 *    veri (caselle e testo), compilabili in Anteprima/Acrobat e rimandabili via email.
 * Uso: node --env-file=.env.local --import tsx scripts/pdf-per-i-medici.ts docs/per-i-medici/2026-09-04
 * Nessun dato reale: i sorgenti sono già senza dati di pazienti.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import puppeteer from 'puppeteer-core';
import { markdownToHtml } from '@/services/export/markdown-to-html';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const A4 = { w: 595.28, h: 841.89 };
const M = 50;
const BODY = 10.5;
const LH = 14;

// ── Sola lettura: markdown → HTML → PDF ─────────────────────────────────────
const CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 8pt; } h2 { font-size: 13.5pt; margin: 16pt 0 6pt; border-bottom: 1px solid #bbb; padding-bottom: 2pt; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 6pt 0; }
  th, td { border: 1px solid #999; padding: 4pt 5pt; vertical-align: top; }
  th { background: #f0f0f0; text-align: left; }
  blockquote { border-left: 3px solid #999; margin: 6pt 0; padding: 2pt 10pt; color: #333; }
  code { font-family: Menlo, monospace; font-size: 9.5pt; background: #f4f4f4; padding: 0 3px; }
  hr { border: 0; border-top: 1px solid #bbb; margin: 12pt 0; }
  ul, ol { padding-left: 20pt; } li { margin: 2pt 0; }
  p { margin: 5pt 0; }
`;

async function markdownToPdf(mdPath: string, outPath: string): Promise<void> {
  const md = readFileSync(mdPath, 'utf8').replace(/☐/g, '▢');
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${markdownToHtml(md)}</body></html>`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outPath, format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } });
  } finally {
    await browser.close();
  }
}

// ── Compilabili: pdf-lib con campi modulo ───────────────────────────────────
function ansi(s: string): string {
  return Array.from(s).map((ch) => (ch.charCodeAt(0) <= 0xff ? ch : ch === '–' || ch === '—' ? '-' : ch === '’' ? "'" : ch === '…' ? '...' : ch === '•' ? '-' : ch === '«' ? '"' : ch === '»' ? '"' : '?')).join('');
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of ansi(text).split('\n')) {
    const words = para.split(' ');
    let cur = '';
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(cand, size) <= width || !cur) cur = cand;
      else { out.push(cur); cur = w; }
    }
    out.push(cur);
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(readonly pdf: PDFDocument, readonly font: PDFFont, readonly bold: PDFFont, readonly title: string) {}
  newPage(): void {
    this.page = this.pdf.addPage([A4.w, A4.h]);
    this.pageNo++;
    this.y = A4.h - M;
    this.page.drawText(ansi(`${this.title} · pag. ${this.pageNo}`), { x: M, y: M / 2, size: 8, font: this.font, color: rgb(0.4, 0.4, 0.4) });
  }
  ensure(h: number): void { if (this.y - h < M + 10) this.newPage(); }
  text(t: string, opts: { size?: number; bold?: boolean; indent?: number; gap?: number } = {}): void {
    const size = opts.size ?? BODY; const font = opts.bold ? this.bold : this.font; const indent = opts.indent ?? 0;
    const lines = wrap(t, font, size, A4.w - 2 * M - indent);
    for (const l of lines) {
      this.ensure(LH);
      this.page.drawText(l, { x: M + indent, y: this.y - size, size, font });
      this.y -= LH * (size / BODY);
    }
    this.y -= opts.gap ?? 3;
  }
  checkbox(name: string, label: string, x: number): number {
    const box = this.pdf.getForm().createCheckBox(name);
    box.addToPage(this.page, { x, y: this.y - 12, width: 12, height: 12, borderWidth: 1, borderColor: rgb(0.2, 0.2, 0.2) });
    this.page.drawText(ansi(label), { x: x + 16, y: this.y - 10, size: BODY, font: this.bold });
    return x + 16 + this.bold.widthOfTextAtSize(ansi(label), BODY) + 14;
  }
  textField(name: string, x: number, width: number, height: number, multiline = true, y?: number): void {
    const f = this.pdf.getForm().createTextField(name);
    if (multiline) f.enableMultiline();
    f.addToPage(this.page, { x, y: (y ?? this.y) - height, width, height, borderWidth: 1, borderColor: rgb(0.45, 0.45, 0.45), backgroundColor: rgb(0.985, 0.985, 0.94), font: this.font });
    f.setFontSize(9.5);
  }
}

interface Question { n: number; title: string; body: string[]; }

function parseQuestions(md: string): { intro: string[]; sections: Array<{ title: string; questions: Question[] }> } {
  const lines = md.split('\n');
  const intro: string[] = []; const sections: Array<{ title: string; questions: Question[] }> = [];
  let cur: { title: string; questions: Question[] } | null = null; let q: Question | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^# /.test(line)) continue;
    if (/^## /.test(line)) { cur = { title: line.replace(/^## /, ''), questions: [] }; sections.push(cur); q = null; continue; }
    if (/^Data: _/.test(line)) continue;
    const qm = /^\s*(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/.exec(line);
    if (qm && cur) { q = { n: Number(qm[1]), title: qm[2]!, body: qm[3] ? [qm[3]] : [] }; cur.questions.push(q); continue; }
    if (/☐ OK/.test(line)) { q = null; continue; }
    if (!cur) { if (line.trim()) intro.push(line.replace(/\*\*/g, '')); continue; }
    if (q && line.trim()) q.body.push(line.replace(/^\s*-\s+/, '• ').replace(/^\s+/, '').replace(/\*\*/g, ''));
  }
  return { intro, sections };
}

async function buildQuestionnaire(mdPath: string, outPath: string): Promise<number> {
  const md = readFileSync(mdPath, 'utf8');
  const { intro, sections } = parseQuestions(md);
  const pdf = await PDFDocument.create();
  pdf.setTitle('Domande per il perito - LegMed');
  const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold, 'LegMed - Domande per il perito');
  w.newPage();
  w.text('Domande per il perito', { size: 18, bold: true, gap: 6 });
  for (const p of intro) w.text(p, { gap: 4 });
  w.text('Per ogni domanda barri OK oppure Modifica e scriva la correzione nel riquadro. Il modulo si compila direttamente nel PDF (Anteprima o Acrobat) e si rimanda via email.', { gap: 8 });
  let fields = 0;
  for (const s of sections) {
    w.ensure(40); w.text(s.title, { size: 13, bold: true, gap: 6 });
    for (const q of s.questions) {
      w.ensure(110);
      w.text(`${q.n}. ${q.title}`, { bold: true, gap: 2 });
      for (const b of q.body) w.text(b, { indent: b.startsWith('•') ? 10 : 0, gap: 1 });
      w.y -= 4; w.ensure(60);
      let x = M;
      x = w.checkbox(`q${q.n}_ok`, 'OK', x);
      w.checkbox(`q${q.n}_modifica`, 'Modifica:', x);
      w.y -= 18;
      w.textField(`q${q.n}_testo`, M, A4.w - 2 * M, 38);
      w.y -= 46; fields += 3;
    }
  }
  w.ensure(70);
  w.text('Data e firma', { bold: true, gap: 4 });
  w.textField('data', M, 140, 22, false);
  w.page.drawText('Firma', { x: M + 160, y: w.y - 14, size: BODY, font: bold });
  w.textField('firma', M + 200, 220, 22, false);
  fields += 2;
  pdf.getForm().updateFieldAppearances(font);
  writeFileSync(outPath, await pdf.save());
  return fields;
}

async function buildFeedbackForm(mdPath: string, outPath: string): Promise<number> {
  const md = readFileSync(mdPath, 'utf8');
  const pdf = await PDFDocument.create();
  pdf.setTitle('Modulo di feedback - LegMed');
  const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold, 'LegMed - Modulo di feedback');
  w.newPage();
  w.text('Modulo di feedback - un rigo per difetto', { size: 18, bold: true, gap: 6 });
  const paras = md.split('\n').filter((l) => l.trim() && !/^#|^\||^- `/.test(l)).map((l) => l.replace(/\*\*/g, '').replace(/`/g, ''));
  for (const p of paras.slice(0, 2)) w.text(p, { gap: 4 });
  w.text('Esempi di righe utili (fittizi):', { bold: true, gap: 2 });
  for (const ex of md.split('\n').filter((l) => /^- `/.test(l))) w.text(ex.replace(/^- `/, '').replace(/`$/, ''), { indent: 10, gap: 1 });
  w.text('Gravità: 1 = da correggere subito, 2 = importante, 3 = estetico. Codice del caso, mai il nome del paziente.', { gap: 8 });
  w.text('Nome e cognome di chi segnala', { bold: true, gap: 2 }); w.textField('segnalante', M, 260, 22, false); w.y -= 30;
  const cols = [{ k: 'n', t: '#', w: 22 }, { k: 'caso', t: 'Codice caso', w: 78 }, { k: 'dove', t: 'Dove (sezione / documento / evento)', w: 115 }, { k: 'atteso', t: 'Cosa si aspettava', w: 110 }, { k: 'trovato', t: 'Cosa ha trovato', w: 110 }, { k: 'gravita', t: 'Gravità', w: 40 }];
  const rowH = 44; let fields = 1;
  const drawHeader = (): void => {
    let x = M;
    for (const c of cols) {
      w.page.drawRectangle({ x, y: w.y - 24, width: c.w, height: 24, borderWidth: 1, borderColor: rgb(0.3, 0.3, 0.3), color: rgb(0.93, 0.93, 0.93) });
      for (const [i, l] of wrap(c.t, bold, 8, c.w - 6).slice(0, 2).entries()) w.page.drawText(l, { x: x + 3, y: w.y - 10 - i * 9, size: 8, font: bold });
      x += c.w;
    }
    w.y -= 24;
  };
  drawHeader();
  for (let r = 1; r <= 14; r++) {
    if (w.y - rowH < M + 10) { w.newPage(); drawHeader(); }
    let x = M;
    for (const c of cols) {
      if (c.k === 'n') {
        w.page.drawRectangle({ x, y: w.y - rowH, width: c.w, height: rowH, borderWidth: 1, borderColor: rgb(0.45, 0.45, 0.45) });
        w.page.drawText(String(r), { x: x + 6, y: w.y - rowH / 2 - 3, size: 9, font });
      } else {
        w.textField(`r${r}_${c.k}`, x, c.w, rowH, c.k !== 'gravita' && c.k !== 'caso');
        fields++;
      }
      x += c.w;
    }
    w.y -= rowH;
  }
  pdf.getForm().updateFieldAppearances(font);
  writeFileSync(outPath, await pdf.save());
  return fields;
}

async function main() {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) { console.error('Uso: pdf-per-i-medici.ts <cartella con i .md>'); process.exit(1); }
  const out = join(dir, 'pdf'); mkdirSync(out, { recursive: true });
  const readonly = ['01-specifica-documentazione-sanitaria.md', '03-guida-al-collaudo.md', '05-messaggio-per-giovanna.md', '06-esempio-documentazione-per-rubriche.md', '00-LEGGIMI.md'];
  for (const f of readonly) {
    const src = join(dir, f); if (!existsSync(src)) continue;
    const dst = join(out, `${basename(f, '.md')}.pdf`);
    await markdownToPdf(src, dst);
    console.log(`sola lettura  → ${dst}`);
  }
  const q = await buildQuestionnaire(join(dir, '02-domande-per-il-perito.md'), join(out, '02-domande-per-il-perito-COMPILABILE.pdf'));
  console.log(`compilabile   → ${join(out, '02-domande-per-il-perito-COMPILABILE.pdf')} (${q} campi)`);
  const fb = await buildFeedbackForm(join(dir, '04-modulo-feedback.md'), join(out, '04-modulo-feedback-COMPILABILE.pdf'));
  console.log(`compilabile   → ${join(out, '04-modulo-feedback-COMPILABILE.pdf')} (${fb} campi)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
