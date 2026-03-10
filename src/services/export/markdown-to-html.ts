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

function convertMarkdownTable(lines: string[]): string {
  // Filter out separator rows (|---|---|)
  const dataRows = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
  if (dataRows.length === 0) return '';

  let html = '<table class="ocr-table">\n';
  dataRows.forEach((row, idx) => {
    const cells = row
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const tag = idx === 0 ? 'th' : 'td';
    if (idx === 0) html += '<thead>\n';
    if (idx === 1) html += '<tbody>\n';
    html += '<tr>';
    for (const cell of cells) {
      html += `<${tag}>${escapeHtml(cell)}</${tag}>`;
    }
    html += '</tr>\n';
    if (idx === 0) html += '</thead>\n';
  });
  html += '</tbody>\n</table>';
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

    // Regular paragraph
    closeList();
    output.push(`<p>${convertInlineFormatting(line)}</p>`);
    i++;
  }

  closeList();
  return output.join('\n');
}
