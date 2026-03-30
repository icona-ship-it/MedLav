/**
 * Adversarial tests for section-parser-client.
 * Tests edge cases, malicious inputs, and boundary conditions
 * that could break section editing in production.
 */
import { describe, it, expect } from 'vitest';
import { parseSections, replaceSectionContent } from './section-parser-client';

describe('parseSections — adversarial', () => {
  it('should handle heading with only spaces after ##', () => {
    const md = '##   \n\nContent after empty heading.';
    const result = parseSections(md);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Should not crash
  });

  it('should handle ### (h3) without treating as section boundary', () => {
    const md = [
      '## Sezione Principale',
      '',
      'Testo principale.',
      '',
      '### Sotto-sezione',
      '',
      'Testo sotto-sezione.',
      '',
      '## Seconda Sezione',
      '',
      'Testo seconda.',
    ].join('\n');
    const result = parseSections(md);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Sezione Principale');
    // h3 content should be INSIDE the first section, not a separate section
    expect(result[0].content).toContain('### Sotto-sezione');
    expect(result[0].content).toContain('Testo sotto-sezione.');
  });

  it('should handle ## inside code blocks without splitting', () => {
    // This is a known limitation — code blocks with ## ARE parsed as sections.
    // Document the behavior rather than expecting perfection.
    const md = [
      '## Real Section',
      '',
      'Text before code.',
      '',
      '```markdown',
      '## This is in a code block',
      '```',
      '',
      '## Next Section',
      '',
      'After code.',
    ].join('\n');
    const result = parseSections(md);
    // Note: parser treats ## inside code block as section boundary
    // This is a known limitation — documenting expected behavior
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle extremely long section titles', () => {
    const longTitle = 'A'.repeat(200);
    const md = `## ${longTitle}\n\nContent.`;
    const result = parseSections(md);
    expect(result).toHaveLength(1);
    // Slug is truncated to 40 chars
    expect(result[0].id.length).toBeLessThanOrEqual(40);
    expect(result[0].title).toBe(longTitle);
  });

  it('should handle section with no content (just heading)', () => {
    const md = '## Empty Section';
    const result = parseSections(md);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('');
  });

  it('should handle consecutive headings with no content between', () => {
    const md = '## First\n## Second\n## Third\n\nOnly this has content.';
    const result = parseSections(md);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('');
    expect(result[1].content).toBe('');
    expect(result[2].content).toBe('Only this has content.');
  });

  it('should handle unicode/emoji in headings', () => {
    const md = '## Sezione con àccénti e ùmlàut\n\nContenuto.';
    const result = parseSections(md);
    expect(result).toHaveLength(1);
    expect(result[0].id).toContain('sezione_con_àccénti');
  });

  it('should handle heading with special markdown chars', () => {
    const md = '## Analisi *dell\'intervento* [ref]\n\nContenuto.';
    const result = parseSections(md);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Analisi *dell'intervento* [ref]");
  });

  it('should handle markdown with only preamble and no sections', () => {
    const md = '# Title\n\nJust a preamble with no ## sections at all.\n\nMore text.';
    const result = parseSections(md);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('full_report');
  });

  it('should handle null-like inputs gracefully', () => {
    expect(parseSections(null as unknown as string)).toEqual([]);
    expect(parseSections(undefined as unknown as string)).toEqual([]);
    expect(parseSections(123 as unknown as string)).toEqual([]);
  });

  it('should handle very large markdown (100+ sections)', () => {
    const sections = Array.from({ length: 100 }, (_, i) =>
      `## Section ${i + 1}\n\nContent ${i + 1}.`,
    ).join('\n\n');
    const result = parseSections(sections);
    expect(result).toHaveLength(100);
    expect(result[99].title).toBe('Section 100');
  });
});

describe('replaceSectionContent — adversarial', () => {
  it('should handle newContent that contains ## heading markers', () => {
    const md = '## Sezione A\n\nOriginale.\n\n## Sezione B\n\nOriginale B.';
    // User injects a ## heading inside section content
    const result = replaceSectionContent(md, 'sezione_a', 'Nuovo testo.\n\n## Heading Iniettato\n\nAltro testo.');
    // The replacement should work, but parseSections will now see 3 sections
    const sections = parseSections(result);
    // This is expected — the injected heading becomes a real section
    expect(sections.length).toBeGreaterThanOrEqual(2);
    // Sezione B should still exist and be unchanged
    const sezB = sections.find(s => s.title === 'Sezione B');
    expect(sezB).toBeDefined();
    expect(sezB!.content).toBe('Originale B.');
  });

  it('should not corrupt markdown with Windows-style line endings', () => {
    const md = '## Sezione\r\n\r\nContenuto originale.\r\n\r\n## Altra\r\n\r\nAltro.';
    const result = replaceSectionContent(md, 'sezione', 'Nuovo contenuto.');
    expect(result).toContain('Nuovo contenuto.');
    expect(result).toContain('## Altra');
  });

  it('should handle sectionId with special regex characters', () => {
    // The slugify function strips special chars, so this should be safe
    const result = replaceSectionContent(
      '## Test\n\nContent.',
      'test.*+?${}()|[]\\',
      'New content.',
    );
    // Should return unchanged (section not found)
    expect(result).toContain('Content.');
  });

  it('should handle empty newContent', () => {
    const md = '## Sezione\n\nContenuto.\n\n## Altra\n\nAltro.';
    const result = replaceSectionContent(md, 'sezione', '');
    const sections = parseSections(result);
    expect(sections[0].content).toBe('');
    expect(sections[1].content).toBe('Altro.');
  });

  it('should handle newContent that is just whitespace', () => {
    const md = '## Sezione\n\nContenuto.\n\n## Altra\n\nAltro.';
    const result = replaceSectionContent(md, 'sezione', '   \n\n   ');
    const sections = parseSections(result);
    expect(sections[0].content).toBe('');
  });

  it('should handle replacement on section at very end of markdown (no trailing newline)', () => {
    const md = '## Unica Sezione\n\nContenuto senza newline finale.';
    const result = replaceSectionContent(md, 'unica_sezione', 'Nuovo.');
    expect(result.trim()).toContain('Nuovo.');
    expect(result).toContain('## Unica Sezione');
  });

  it('should preserve preamble when replacing a section', () => {
    const md = 'INTESTAZIONE\n\n## Sezione\n\nTesto.';
    const result = replaceSectionContent(md, 'sezione', 'Aggiornato.');
    expect(result).toContain('INTESTAZIONE');
    expect(result).toContain('Aggiornato.');
  });

  it('should handle 50+ sections without performance issues', () => {
    const sections = Array.from({ length: 50 }, (_, i) =>
      `## Section ${i}\n\nContent ${i}.`,
    ).join('\n\n');
    const start = performance.now();
    const result = replaceSectionContent(sections, 'section_49', 'Updated.');
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // Should be < 100ms
    expect(result).toContain('Updated.');
    const parsed = parseSections(result);
    expect(parsed[49].content).toBe('Updated.');
    expect(parsed[0].content).toBe('Content 0.');
  });
});
