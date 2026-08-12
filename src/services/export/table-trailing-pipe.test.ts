/**
 * Invariante H-1 (audit 2026-08-11): una riga di tabella markdown SENZA pipe
 * finale (GFM valida) non deve perdere l'ultima cella né in HTML né in DOCX —
 * era il caso di una riga ITT che usciva senza la durata, mentre la preview la
 * mostrava.
 */
import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown-to-html';
import { parseMarkdownTable } from './docx-export';

const TABLE_NO_TRAILING = [
  '| Periodo | Tipo | Durata',
  '|---|---|---',
  '| 12/03/2024 - 26/03/2024 | ITT | 15 giorni',
].join('\n');

const TABLE_WITH_TRAILING = [
  '| Periodo | Tipo | Durata |',
  '|---|---|---|',
  '| 12/03/2024 - 26/03/2024 | ITT | 15 giorni |',
].join('\n');

describe('H-1 — tabella markdown senza pipe finale', () => {
  it('HTML: conserva l\'ultima cella (15 giorni) anche senza pipe finale', () => {
    const html = markdownToHtml(TABLE_NO_TRAILING);
    expect(html).toContain('15 giorni');
    expect(html).toContain('<th>Durata</th>');
    // la riga separatore non deve diventare una riga-dati
    expect(html).not.toContain('<td>---</td>');
  });

  it('DOCX parseMarkdownTable: 3 celle per riga anche senza pipe finale', () => {
    const rows = parseMarkdownTable(TABLE_NO_TRAILING);
    expect(rows).not.toBeNull();
    expect(rows).toEqual([
      ['Periodo', 'Tipo', 'Durata'],
      ['12/03/2024 - 26/03/2024', 'ITT', '15 giorni'],
    ]);
  });

  it('parità: con e senza pipe finale producono le stesse celle', () => {
    expect(parseMarkdownTable(TABLE_NO_TRAILING)).toEqual(parseMarkdownTable(TABLE_WITH_TRAILING));
  });

  it('non rompe le tabelle normali con pipe finale', () => {
    const html = markdownToHtml(TABLE_WITH_TRAILING);
    expect(html).toContain('15 giorni');
    expect(html).toContain('<th>Durata</th>');
  });
});
