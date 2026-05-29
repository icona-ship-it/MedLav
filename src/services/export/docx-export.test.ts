import { describe, it, expect } from 'vitest';
import { parseMarkdownTable, markdownToDocxParagraphs } from './docx-export';

describe('docx-export — parseMarkdownTable', () => {
  it('parses a standard pipe table, filtering the separator row', () => {
    const md = ['| A | B |', '|---|---|', '| 1 | 2 |'].join('\n');
    expect(parseMarkdownTable(md)).toEqual([['A', 'B'], ['1', '2']]);
  });

  it('treats an escaped pipe as a literal cell character (not a column split)', () => {
    const md = ['| Periodo | Val |', '|---|---|', '| ITT \\| 100 | x |'].join('\n');
    const rows = parseMarkdownTable(md);
    expect(rows).not.toBeNull();
    // The body row must have exactly 2 cells, with the pipe un-escaped.
    expect(rows![1]).toEqual(['ITT | 100', 'x']);
  });

  it('returns null for a single non-table pipe line', () => {
    expect(parseMarkdownTable('| nota sciolta |')).toBeNull();
  });
});

describe('docx-export — markdownToDocxParagraphs', () => {
  it('does NOT drop a stray pipe line that is not a real table', () => {
    // Regression: a lone "| nota |" was collected as a table, parsed to null, and
    // silently dropped. It must now be preserved as a paragraph.
    const out = markdownToDocxParagraphs('| nota sciolta importante |');
    expect(out.length).toBeGreaterThan(0);
  });

  it('renders the A2 ITT/ITP table without dropping content', () => {
    const md = [
      '| Periodo | Dal | Al | Giorni | Invalidità |',
      '|---|---|---|---|---|',
      '| ITT al 100% | 10.01.2024 | 20.01.2024 | 10 | 100% |',
    ].join('\n');
    const out = markdownToDocxParagraphs(md);
    expect(out.length).toBeGreaterThan(0); // a Table is emitted
  });

  it('produces a paragraph for every non-empty content line (no silent loss)', () => {
    const md = '## Titolo\n\nPrimo paragrafo.\n\nSecondo paragrafo.';
    const out = markdownToDocxParagraphs(md);
    // heading + 2 paragraphs = 3 blocks (empty lines skipped)
    expect(out.length).toBe(3);
  });
});
