/**
 * Lightweight markdown-to-HTML converter for OCR text in reports.
 * Handles: tables (pipe), bold, italic, headings, lists, horizontal rules.
 * No external dependencies.
 */

/** Escaping HTML condiviso (testo E attributi: &<>" coperti). Esportato per
 * riuso — il codebase ne aveva già 4 copie locali (review 2026-07-04). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Split a markdown table row into trimmed cells, respecting escaped pipes
 * (`\|` is a literal pipe inside a cell, not a column separator) and
 * un-escaping them in the output. */
function splitTableRow(row: string): string[] {
  // Via il vuoto iniziale (pipe di apertura). Il vuoto FINALE si toglie SOLO se
  // c'è la pipe di chiusura: una riga GFM valida può ometterla e slice(1,-1)
  // perdeva l'ultima cella — es. la durata di una riga ITT (audit 2026-08-11, H-1).
  const parts = row.split(/(?<!\\)\|/).slice(1);
  if (parts.length > 0 && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map((c) => c.trim().replace(/\\\|/g, '|'));
}

function convertMarkdownTable(lines: string[]): string {
  // Filter out separator rows (|---|---|) — pipe di chiusura opzionale, richiede
  // almeno un trattino così una riga-dati non viene mai scambiata per separatore.
  const dataRows = lines.filter((l) => !/^\|[\s\-:|]*-[\s\-:|]*\|?$/.test(l));
  if (dataRows.length === 0) return '';

  const headerCells = splitTableRow(dataRows[0]);
  const bodyRows = dataRows.slice(1);

  let html = '<table class="ocr-table">\n<thead>\n<tr>';
  for (const cell of headerCells) html += `<th>${convertInlineFormatting(cell)}</th>`;
  html += '</tr>\n</thead>\n';

  // Only emit <tbody> when there are body rows — a header-only table previously
  // produced an unbalanced </tbody> (malformed HTML).
  if (bodyRows.length > 0) {
    html += '<tbody>\n';
    for (const row of bodyRows) {
      html += '<tr>';
      for (const cell of splitTableRow(row)) html += `<td>${convertInlineFormatting(cell)}</td>`;
      html += '</tr>\n';
    }
    html += '</tbody>\n';
  }
  html += '</table>';
  return html;
}

/** Riga che apre un blocco-placeholder del perito (`*[...]*` o `[da compilare/inserire...]`).
 * Vive qui (modulo leggero, zero dipendenze) ed è ri-esportata da docx-export:
 * DOCX e HTML devono riconoscere gli stessi blocchi. */
export function isPlaceholderBlockStart(line: string): boolean {
  const t = line.trim();
  if (t.startsWith('*[')) return true;
  return t.startsWith('[') && /(da compilare|inserire qui|il perito compil|il perito ricostru|il perito inseri|da verificare)/i.test(t);
}

function convertInlineFormatting(text: string): string {
  let result = escapeHtml(text);
  // Immagini INLINE nel paragrafo (audit 2026-07-16): il blocco-immagine a riga
  // intera è gestito in markdownToHtml, ma un'immagine in mezzo al testo finiva
  // come markdown letterale "![alt](url)" nell'atto esportato. Stessa whitelist
  // di schemi del blocco; URL non sicuro → resta solo l'alt. PRIMA di bold/italic
  // (che altrimenti potrebbero mangiare i delimitatori dentro l'URL).
  result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) =>
    /^(https?:\/\/|data:image\/|\/api\/|ocr-image:)/.test(src)
      ? `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto">`
      : alt);
  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');
  return result;
}

/**
 * Convert markdown text to HTML.
 * Handles headings, bold/italic, pipe tables, lists, and horizontal rules.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let i = 0;
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  const closeList = () => {
    if (inList) {
      output.push(`</${listType}>`);
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      closeList();
      output.push('<hr>');
      i++;
      continue;
    }

    // Table: detect block of pipe lines
    if (/^\|/.test(line.trim())) {
      closeList();
      const tableLines: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tableLines.push(lines[i]);
        i++;
      }
      output.push(convertMarkdownTable(tableLines));
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${convertInlineFormatting(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list item
    if (/^[\s]*[-*+]\s+/.test(line)) {
      if (!inList || listType !== 'ul') {
        closeList();
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      const content = line.replace(/^[\s]*[-*+]\s+/, '');
      output.push(`<li>${convertInlineFormatting(content)}</li>`);
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^[\s]*(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${convertInlineFormatting(olMatch[2])}</li>`);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // Image: ![alt](url) — only allow safe URL schemes
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      closeList();
      const alt = escapeHtml(imgMatch[1]);
      const rawSrc = imgMatch[2];
      const isSafeUrl = /^(https?:\/\/|data:image\/|\/api\/|ocr-image:)/.test(rawSrc);
      const src = isSafeUrl ? escapeHtml(rawSrc) : '#';
      output.push(`<figure class="report-image"><img src="${src}" alt="${alt}" style="max-width:100%;height:auto"><figcaption>${alt}</figcaption></figure>`);
      i++;
      continue;
    }

    // Blocco-placeholder del perito (*[...]* anche multi-riga): evidenziato in
    // giallo come nel DOCX (audit 2026-07-16: prima solo il Word lo mostrava,
    // nell'anteprima HTML i placeholder si mimetizzavano nel testo). Stile
    // inline così il blocco resta evidenziato in qualunque consumatore.
    if (isPlaceholderBlockStart(line)) {
      closeList();
      const blockLines: string[] = [];
      while (i < lines.length && blockLines.length < 40) {
        blockLines.push(lines[i]);
        const closes = /\]\*?[.\s]*$/.test(lines[i].trim());
        i++;
        if (closes) break;
      }
      const inner = blockLines.join('\n').trim().replace(/^\*?\[/, '').replace(/\]\*?\.?$/, '').trim();
      const innerHtml = inner.split('\n')
        .map((pl) => `<p style="margin:0.25em 0">${convertInlineFormatting(pl.replace(/^\*|\*$/g, ''))}</p>`)
        .join('');
      output.push(`<div class="perito-placeholder" style="background:#fff3a0;font-style:italic;padding:0.5em 0.75em;border-radius:3px;margin:0.75em 0">${innerHtml}</div>`);
      continue;
    }

    // Blockquote: consecutive lines starting with `>` (OCR can carry quoted
    // passages). Rendered as <blockquote> to match the live preview, instead of
    // leaving a literal `>` in the deposited document.
    if (/^\s*>\s?/.test(line)) {
      closeList();
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      output.push(`<blockquote>${convertInlineFormatting(quoteLines.join(' '))}</blockquote>`);
      continue;
    }

    // Regular paragraph
    closeList();
    output.push(`<p>${convertInlineFormatting(line)}</p>`);
    i++;
  }

  closeList();
  return output.join('\n');
}
