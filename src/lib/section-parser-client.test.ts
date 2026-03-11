import { describe, it, expect } from 'vitest';
import { parseSections } from './section-parser-client';

describe('parseSections', () => {
  it('should return empty array for empty input', () => {
    expect(parseSections('')).toEqual([]);
    expect(parseSections('  ')).toEqual([]);
  });

  it('should return full_report section when no headings', () => {
    const result = parseSections('Some text without headings');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('full_report');
    expect(result[0].content).toBe('Some text without headings');
  });

  it('should parse a single section', () => {
    const md = '## Riassunto del Caso\n\nTesto del riassunto.';
    const result = parseSections(md);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('riassunto_del_caso');
    expect(result[0].title).toBe('Riassunto del Caso');
    expect(result[0].content).toBe('Testo del riassunto.');
  });

  it('should parse multiple sections', () => {
    const md = [
      '## Riassunto del Caso',
      '',
      'Testo riassunto.',
      '',
      '## Cronologia Medica',
      '',
      'Testo cronologia.',
      '',
      '## Nesso Causale',
      '',
      'Testo nesso.',
    ].join('\n');

    const result = parseSections(md);
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('Riassunto del Caso');
    expect(result[1].title).toBe('Cronologia Medica');
    expect(result[2].title).toBe('Nesso Causale');
    expect(result[2].content).toBe('Testo nesso.');
  });

  it('should handle preamble before first heading', () => {
    const md = '# Report\n\nPreamble text\n\n## Sezione 1\n\nContenuto.';
    const result = parseSections(md);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('preamble');
    expect(result[0].title).toBe('Intestazione');
    expect(result[0].content).toBe('# Report\n\nPreamble text');
    expect(result[1].title).toBe('Sezione 1');
  });

  it('should handle sections with empty content', () => {
    const md = '## Sezione Vuota\n\n## Sezione Con Contenuto\n\nTesto.';
    const result = parseSections(md);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('');
    expect(result[1].content).toBe('Testo.');
  });

  it('should slugify headings with special characters', () => {
    const md = '## Analisi dell\'Intervento Chirurgico\n\nTesto.';
    const result = parseSections(md);
    expect(result[0].id).toBe('analisi_dellintervento_chirurgico');
  });

  it('should handle 8+ sections (typical report)', () => {
    const sectionNames = [
      'Riassunto del Caso',
      'Cronologia Medico-Legale',
      'Analisi del Nesso Causale',
      'Danno Biologico',
      'Complicanze',
      'Profili di Responsabilità',
      'Valutazione di Merito',
      'Conclusioni',
    ];
    const md = sectionNames.map((s) => `## ${s}\n\nContenuto di ${s}.`).join('\n\n');
    const result = parseSections(md);
    expect(result).toHaveLength(8);
    expect(result.map((s) => s.title)).toEqual(sectionNames);
  });
});
