/**
 * Sanitizer for the VERBATIM doc-sanitaria reproduction (QA Tedesco 2026-06-11):
 * the raw Mistral OCR markdown carries artifacts that must never reach a
 * depositable perizia — broken image refs (92-114 per report), raw HTML tables
 * wrapped in [TABLE_HTML_START] markers, literal `null` tokens from hospital
 * systems, stray HTML tags/entities.
 *
 * Pure functions, no I/O. The content itself is NEVER summarized or dropped:
 * tables are converted to readable pipe-text, images removed (they are
 * unrenderable references, not content), entities decoded.
 */

const TABLE_BLOCK_RE = /\[TABLE_HTML_START\]([\s\S]*?)\[TABLE_HTML_END\]/g;
const RAW_TABLE_RE = /<table[^>]*>[\s\S]*?<\/table>/gi;
const MD_IMAGE_RE = /!\[[^\]]*\]\([^)]*\.(?:jpe?g|png|webp|gif|tiff?)\)/gi;

/** Convert an HTML <table> fragment to readable pipe-table text. Returns null
 * when no rows are parseable (caller falls back to tag-stripping). */
export function htmlTableToPipeText(html: string): string | null {
  const rows = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  if (rows.length === 0) return null;

  const lines: string[] = [];
  let headerDone = false;
  for (const row of rows) {
    const cells = Array.from(row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((c) => stripTagsAndEntities(c[1]).replace(/\s+/g, ' ').trim());
    if (cells.length === 0) continue;
    lines.push(`| ${cells.join(' | ')} |`);
    if (!headerDone) {
      lines.push(`|${cells.map(() => ' --- ').join('|')}|`);
      headerDone = true;
    }
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 31 ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&amp;/gi, '&');
}

function stripTagsAndEntities(s: string): string {
  return decodeEntities(s.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ''));
}

/**
 * Clean one page of verbatim OCR text for reproduction in the perizia.
 * Content-preserving: tables become readable text, junk markers disappear.
 */
export function sanitizeVerbatimOcr(text: string): string {
  let s = text;

  // 1. Marker-wrapped HTML tables → pipe-table text (readable in DOCX/HTML/UI)
  s = s.replace(TABLE_BLOCK_RE, (_m, inner: string) => {
    const pipe = htmlTableToPipeText(inner);
    return pipe ?? stripTagsAndEntities(inner);
  });

  // 2. Residual bare <table> blocks (same treatment, no markers)
  s = s.replace(RAW_TABLE_RE, (m) => htmlTableToPipeText(m) ?? stripTagsAndEntities(m));

  // 3. Broken markdown image references — unrenderable, never content
  s = s.replace(MD_IMAGE_RE, '');

  // 4. Stray HTML tags/entities outside tables (e.g. <br/>, &amp;)
  if (/<br\s*\/?\s*>|<\/?(?:p|span|div|b|i|strong|em|img|hr)\b|&[a-z]+;|&#\d+;/i.test(s)) {
    s = stripTagsAndEntities(s);
  }

  // 5. Literal `null` leaks from source systems — ONLY unambiguous patterns.
  //    NEVER bare `null` and NOT EVEN `: null`: in German clinical docs (Alto
  //    Adige) "Schmerzen: null" legitimately means "pain: zero". Only the
  //    repeated token and the parenthesized form are certain junk.
  // Same-line only ([ \t], not \s): "null\nnull" across lines can be two
  // legitimate German zeros in adjacent fields.
  s = s.replace(/\bnull([ \t]+null)+\b/gi, '—');
  s = s.replace(/\(null\)/gi, '');

  // 6. Collapse whitespace noise introduced by the removals
  s = s.replace(/[ \t]+$/gm, '');
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}
