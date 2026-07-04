import { describe, it, expect } from 'vitest';

import { sectionPartPath, resolveSectionContents, SECTION_PARTS_BUCKET } from './section-part-store';

describe('sectionPartPath', () => {
  it('should build a deterministic path (idempotente sui retry Inngest)', () => {
    expect(sectionPartPath('case-1', 'documentazione_sanitaria', 'batch-3'))
      .toBe('case-1/documentazione_sanitaria/batch-3.md');
    // Stesso input → stesso path (upsert riscrive, non duplica).
    expect(sectionPartPath('case-1', 'documentazione_sanitaria', 'batch-3'))
      .toBe(sectionPartPath('case-1', 'documentazione_sanitaria', 'batch-3'));
  });

  it('should namespace by bucket costant (private, EU)', () => {
    expect(SECTION_PARTS_BUCKET).toBe('section-parts');
  });
});

describe('resolveSectionContents', () => {
  it('should load content from the path when content is empty and contentPath is set', async () => {
    const sections = [
      { id: 'documentazione_sanitaria', content: '', contentPath: 'case-1/documentazione_sanitaria/combined.md' },
      { id: 'epicrisi', content: 'testo inline' },
    ];
    const loader = async (path: string) => `CONTENUTO(${path})`;
    const resolved = await resolveSectionContents(sections, loader);
    expect(resolved[0].content).toBe('CONTENUTO(case-1/documentazione_sanitaria/combined.md)');
    expect(resolved[1].content).toBe('testo inline');
  });

  it('should NOT overwrite inline content even when a contentPath is present', async () => {
    const sections = [{ id: 'x', content: 'gia risolto', contentPath: 'a/b/c.md' }];
    const loader = async () => 'NON deve essere usato';
    const resolved = await resolveSectionContents(sections, loader);
    expect(resolved[0].content).toBe('gia risolto');
  });

  it('should propagate loader errors (lo step chiamante decide il fallback)', async () => {
    const sections = [{ id: 'x', content: '', contentPath: 'manca.md' }];
    const loader = async () => { throw new Error('download fallito'); };
    await expect(resolveSectionContents(sections, loader)).rejects.toThrow('download fallito');
  });

  it('should return new objects (immutabilità) and preserve extra fields', async () => {
    const original = { id: 'x', content: '', contentPath: 'a.md', wordCount: 42 };
    const resolved = await resolveSectionContents([original], async () => 'testo');
    expect(resolved[0]).not.toBe(original);
    expect(original.content).toBe('');
    expect(resolved[0].wordCount).toBe(42);
  });
});
