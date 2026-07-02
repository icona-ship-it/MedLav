import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchPubMed, fetchArticleDetails } from './pubmed-client';

describe('pubmed-client', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('searchPubMed', () => {
    it('should return empty array for empty query', async () => {
      const result = await searchPubMed('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only query', async () => {
      const result = await searchPubMed('   ');
      expect(result).toEqual([]);
    });

    it('should return articles when PubMed returns results', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            esearchresult: { idlist: ['12345', '67890'] },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              '12345': {
                title: 'Test Article One.',
                authors: [{ name: 'Smith J' }, { name: 'Doe A' }],
                fulljournalname: 'Journal of Testing',
                pubdate: '2024 Jan',
                elocationid: 'doi: 10.1234/test.2024',
              },
              '67890': {
                title: 'Test Article Two',
                authors: [{ name: 'Brown B' }],
                source: 'J Test',
                pubdate: '2023',
              },
            },
          }),
        });

      const result = await searchPubMed('fracture treatment', 5);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        pmid: '12345',
        title: 'Test Article One',
        authors: 'Smith J, Doe A',
        journal: 'Journal of Testing',
        year: '2024',
        doi: '10.1234/test.2024',
      });
      expect(result[1]).toEqual({
        pmid: '67890',
        title: 'Test Article Two',
        authors: 'Brown B',
        journal: 'J Test',
        year: '2023',
        doi: undefined,
      });
    });

    it('should return empty array when search returns no PMIDs', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          esearchresult: { idlist: [] },
        }),
      });

      const result = await searchPubMed('nonexistent-term-xyz');
      expect(result).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await searchPubMed('fracture');
      expect(result).toEqual([]);
    });

    it('should return empty array on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await searchPubMed('fracture');
      expect(result).toEqual([]);
    });
  });

  describe('fetchArticleDetails', () => {
    it('should return empty array for empty PMIDs', async () => {
      const result = await fetchArticleDetails([]);
      expect(result).toEqual([]);
    });

    it('should handle authors with more than 3 names using et al', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            '11111': {
              title: 'Multi Author Study',
              authors: [
                { name: 'Alpha A' },
                { name: 'Beta B' },
                { name: 'Gamma C' },
                { name: 'Delta D' },
              ],
              fulljournalname: 'Big Journal',
              pubdate: '2025 Mar 15',
            },
          },
        }),
      });

      const result = await fetchArticleDetails(['11111']);
      expect(result).toHaveLength(1);
      expect(result[0].authors).toBe('Alpha A, Beta B, Gamma C, et al.');
    });

    it('should handle articles with no authors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            '22222': {
              title: 'Guidelines Document',
              authors: [],
              fulljournalname: 'Guidelines Org',
              pubdate: '2024',
            },
          },
        }),
      });

      const result = await fetchArticleDetails(['22222']);
      expect(result).toHaveLength(1);
      expect(result[0].authors).toBe('');
    });

    it('should skip articles with no title', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            '33333': { authors: [{ name: 'Test' }] },
          },
        }),
      });

      const result = await fetchArticleDetails(['33333']);
      expect(result).toEqual([]);
    });

    it('should return empty array on fetch error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('timeout'));

      const result = await fetchArticleDetails(['12345']);
      expect(result).toEqual([]);
    });
  });
});
