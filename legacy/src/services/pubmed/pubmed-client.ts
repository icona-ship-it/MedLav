/**
 * PubMed/NCBI E-utilities client for scientific evidence retrieval.
 * Uses free NCBI API (no key needed for <3 req/sec).
 *
 * All calls are non-blocking: errors return empty arrays.
 */

import { logger } from '@/lib/logger';

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi?: string;
}

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Search PubMed for articles matching a query string.
 * Returns article details for the top results.
 */
export async function searchPubMed(query: string, maxResults = 5): Promise<PubMedArticle[]> {
  if (!query || query.trim().length === 0) return [];

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${maxResults}&term=${encodedQuery}`;

    const searchResponse = await fetch(searchUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!searchResponse.ok) {
      logger.warn('pubmed', `Search request failed: ${searchResponse.status} ${searchResponse.statusText}`);
      return [];
    }

    const searchData = await searchResponse.json() as {
      esearchresult?: { idlist?: string[] };
    };

    const pmids = searchData.esearchresult?.idlist ?? [];
    if (pmids.length === 0) return [];

    return fetchArticleDetails(pmids);
  } catch (error) {
    logger.warn('pubmed', `Search failed for query "${query}": ${error instanceof Error ? error.message : 'unknown'}`);
    return [];
  }
}

/**
 * Fetch article details (title, authors, journal, year, DOI) for given PMIDs.
 */
export async function fetchArticleDetails(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  try {
    const idsParam = pmids.join(',');
    const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${idsParam}`;

    const summaryResponse = await fetch(summaryUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!summaryResponse.ok) {
      logger.warn('pubmed', `Summary request failed: ${summaryResponse.status} ${summaryResponse.statusText}`);
      return [];
    }

    const summaryData = await summaryResponse.json() as {
      result?: Record<string, PubMedSummaryDoc>;
    };

    if (!summaryData.result) return [];

    const articles: PubMedArticle[] = [];
    for (const pmid of pmids) {
      const doc = summaryData.result[pmid];
      if (!doc || !doc.title) continue;

      articles.push({
        pmid,
        title: cleanTitle(doc.title),
        authors: formatAuthors(doc.authors),
        journal: doc.fulljournalname ?? doc.source ?? '',
        year: extractYear(doc.pubdate ?? doc.epubdate ?? ''),
        doi: extractDoi(doc.elocationid ?? ''),
      });
    }

    return articles;
  } catch (error) {
    logger.warn('pubmed', `Detail fetch failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return [];
  }
}

// ── Internal types ─────────────────────────────────────────────────

interface PubMedAuthor {
  name?: string;
}

interface PubMedSummaryDoc {
  title?: string;
  authors?: PubMedAuthor[];
  source?: string;
  fulljournalname?: string;
  pubdate?: string;
  epubdate?: string;
  elocationid?: string;
}

// ── Formatting helpers ─────────────────────────────────────────────

function cleanTitle(raw: string): string {
  // NCBI sometimes includes trailing period
  return raw.replace(/\.\s*$/, '').trim();
}

function formatAuthors(authors?: PubMedAuthor[]): string {
  if (!authors || authors.length === 0) return '';
  const names = authors
    .map((a) => a.name ?? '')
    .filter((n) => n.length > 0);
  if (names.length === 0) return '';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')}, et al.`;
}

function extractYear(pubdate: string): string {
  const match = pubdate.match(/\d{4}/);
  return match ? match[0] : '';
}

function extractDoi(elocationid: string): string | undefined {
  // elocationid format: "doi: 10.1234/..." or just "10.1234/..."
  const match = elocationid.match(/10\.\d{4,}\/\S+/);
  return match ? match[0] : undefined;
}
