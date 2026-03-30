import { describe, it, expect } from 'vitest';
import { parseSections, replaceSectionContent } from './section-parser-client';

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

  it('should deduplicate slugs for sections with same title', () => {
    const md = [
      '## Analisi',
      '',
      'Prima analisi.',
      '',
      '## Analisi',
      '',
      'Seconda analisi.',
      '',
      '## Analisi',
      '',
      'Terza analisi.',
    ].join('\n');
    const result = parseSections(md);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('analisi');
    expect(result[1].id).toBe('analisi_2');
    expect(result[2].id).toBe('analisi_3');
    expect(result[0].content).toBe('Prima analisi.');
    expect(result[1].content).toBe('Seconda analisi.');
    expect(result[2].content).toBe('Terza analisi.');
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

describe('replaceSectionContent', () => {
  const multiSectionMd = [
    'Preamble text',
    '',
    '## Riassunto del Caso',
    '',
    'Testo riassunto originale.',
    '',
    '## Cronologia Medica',
    '',
    'Testo cronologia originale.',
    '',
    '## Conclusioni',
    '',
    'Testo conclusioni originale.',
  ].join('\n');

  it('should replace content of a middle section', () => {
    const result = replaceSectionContent(multiSectionMd, 'cronologia_medica', 'Nuovo testo cronologia.');
    const sections = parseSections(result);
    expect(sections).toHaveLength(4); // preamble + 3
    expect(sections[2].title).toBe('Cronologia Medica');
    expect(sections[2].content).toBe('Nuovo testo cronologia.');
    // Other sections unchanged
    expect(sections[1].content).toBe('Testo riassunto originale.');
    expect(sections[3].content).toBe('Testo conclusioni originale.');
  });

  it('should replace content of the first section', () => {
    const result = replaceSectionContent(multiSectionMd, 'riassunto_del_caso', 'Nuovo riassunto.');
    const sections = parseSections(result);
    expect(sections[1].content).toBe('Nuovo riassunto.');
    expect(sections[0].id).toBe('preamble');
  });

  it('should replace content of the last section', () => {
    const result = replaceSectionContent(multiSectionMd, 'conclusioni', 'Nuove conclusioni.');
    const sections = parseSections(result);
    expect(sections[3].content).toBe('Nuove conclusioni.');
  });

  it('should replace preamble', () => {
    const result = replaceSectionContent(multiSectionMd, 'preamble', 'Nuovo preamble');
    const sections = parseSections(result);
    expect(sections[0].id).toBe('preamble');
    expect(sections[0].content).toBe('Nuovo preamble');
  });

  it('should handle full_report (no headings)', () => {
    const md = 'Solo testo senza sezioni.';
    const result = replaceSectionContent(md, 'full_report', 'Testo completamente nuovo.');
    expect(result).toBe('Testo completamente nuovo.');
  });

  it('should return unchanged markdown when section not found', () => {
    const result = replaceSectionContent(multiSectionMd, 'sezione_inesistente', 'Nuovo contenuto.');
    expect(result).toBe(multiSectionMd);
  });

  it('should return unchanged on empty input', () => {
    expect(replaceSectionContent('', 'any', 'content')).toBe('');
    expect(replaceSectionContent('text', '', 'content')).toBe('text');
  });

  it('should preserve heading title when replacing content', () => {
    const result = replaceSectionContent(multiSectionMd, 'cronologia_medica', 'Contenuto aggiornato.');
    expect(result).toContain('## Cronologia Medica');
    expect(result).toContain('Contenuto aggiornato.');
    expect(result).not.toContain('Testo cronologia originale.');
  });

  it('should correctly replace the second of two sections with same slug', () => {
    const md = [
      '## Analisi',
      '',
      'Prima analisi.',
      '',
      '## Analisi',
      '',
      'Seconda analisi.',
    ].join('\n');

    // Replace the second occurrence (analisi_2)
    const result = replaceSectionContent(md, 'analisi_2', 'Seconda aggiornata.');
    const sections = parseSections(result);
    expect(sections).toHaveLength(2);
    expect(sections[0].content).toBe('Prima analisi.');
    expect(sections[1].content).toBe('Seconda aggiornata.');
  });

  it('should correctly replace the first of two sections with same slug', () => {
    const md = [
      '## Analisi',
      '',
      'Prima analisi.',
      '',
      '## Analisi',
      '',
      'Seconda analisi.',
    ].join('\n');

    // Replace the first occurrence (analisi)
    const result = replaceSectionContent(md, 'analisi', 'Prima aggiornata.');
    const sections = parseSections(result);
    expect(sections).toHaveLength(2);
    expect(sections[0].content).toBe('Prima aggiornata.');
    expect(sections[1].content).toBe('Seconda analisi.');
  });
});
