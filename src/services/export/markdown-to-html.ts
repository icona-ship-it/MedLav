/**
 * Lightweight markdown-to-HTML converter for OCR text in reports.
 * Handles: tables (pipe), bold, italic, headings, lists, horizontal rules.
 * No external dependencies.
 */

function escapeHtml(text: string): string {
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
  return row
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

function convertMarkdownTable(lines: string[]): string {
  // Filter out separator rows (|---|---|)
  const dataRows = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
  if (dataRows.length === 0) return '';

  const headerCells = splitTableRow(dataRows[0]);
  const bodyRows = dataRows.slice(1);

  let html = '<table class="ocr-table">\n<thead>\n<tr>';
  for (const cell of headerCells) html += `<th>${escapeHtml(cell)}</th>`;
  html += '</tr>\n</thead>\n';

  // Only emit <tbody> when there are body rows — a header-only table previously
  // produced an unbalanced </tbody> (malformed HTML).
  if (bodyRows.length > 0) {
    html += '<tbody>\n';
    for (const row of bodyRows) {
      html += '<tr>';
      for (const cell of splitTableRow(row)) html += `<td>${escapeHtml(cell)}</td>`;
      html += '</tr>\n';
    }
    html += '</tbody>\n';
  }
  html += '</table>';
  return html;
}

function convertInlineFormatting(text: string): string {
  let result = escapeHtml(text);
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

    // Regular paragraph
    closeList();
    output.push(`<p>${convertInlineFormatting(line)}</p>`);
    i++;
  }

  closeList();
  return output.join('\n');
}
