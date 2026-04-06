/**
 * Extracts key medical terms from consolidated events and searches PubMed
 * for relevant scientific evidence.
 *
 * Non-blocking: all errors are caught and result in empty arrays.
 * Budget: max 3 PubMed searches per case (~9 seconds worst case).
 */

import { searchPubMed } from './pubmed-client';
import type { PubMedArticle } from './pubmed-client';
import { logger } from '@/lib/logger';

export interface PubMedSearchResult {
  query: string;
  articles: PubMedArticle[];
}

const MAX_SEARCHES = 3;

/**
 * Enrich a case with PubMed evidence based on diagnoses found in events.
 *
 * 1. Extracts unique non-null diagnoses from events
 * 2. Ranks by frequency (most mentioned first)
 * 3. Searches PubMed for top 3 diagnoses
 * 4. Returns results grouped by query
 */
export async function enrichWithPubMedEvidence(
  events: Array<{ title: string; description: string; diagnosis: string | null }>,
  caseType: string,
): Promise<PubMedSearchResult[]> {
  // Extract unique diagnoses, count frequency
  const diagnosisCounts = new Map<string, number>();
  for (const event of events) {
    if (!event.diagnosis || typeof event.diagnosis !== 'string') continue;
    const normalized = event.diagnosis.trim().toLowerCase();
    if (normalized.length < 3) continue;
    diagnosisCounts.set(normalized, (diagnosisCounts.get(normalized) ?? 0) + 1);
  }

  if (diagnosisCounts.size === 0) {
    logger.info('pubmed', 'No diagnoses found in events — skipping PubMed search');
    return [];
  }

  // Sort by frequency (most mentioned first), take top MAX_SEARCHES
  const topDiagnoses = [...diagnosisCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SEARCHES)
    .map(([diagnosis]) => diagnosis);

  logger.info('pubmed', `Searching PubMed for ${topDiagnoses.length} diagnoses (from ${diagnosisCounts.size} unique)`);

  // Search sequentially to respect NCBI rate limit (<3 req/sec)
  const results: PubMedSearchResult[] = [];
  for (const diagnosis of topDiagnoses) {
    const query = buildSearchQuery(diagnosis, caseType);
    try {
      const articles = await searchPubMed(query, 5);
      if (articles.length > 0) {
        results.push({ query: diagnosis, articles });
        logger.info('pubmed', `Found ${articles.length} articles for "${diagnosis}"`);
      }
    } catch (error) {
      logger.warn('pubmed', `Search failed for "${diagnosis}": ${error instanceof Error ? error.message : 'unknown'}`);
      // Continue with next diagnosis — non-blocking
    }
  }

  logger.info('pubmed', `PubMed enrichment complete: ${results.length} queries returned results, ${results.reduce((s, r) => s + r.articles.length, 0)} total articles`);
  return results;
}

/**
 * Build a PubMed search query optimized for medico-legal context.
 */
function buildSearchQuery(diagnosis: string, caseType: string): string {
  // Base: diagnosis + clinical/medico-legal context
  const caseContext = CASE_TYPE_SEARCH_TERMS[caseType] ?? 'medico-legal';
  return `"${diagnosis}" AND ("clinical guidelines" OR "treatment" OR "${caseContext}")`;
}

/**
 * Map case types to relevant PubMed search context terms.
 */
const CASE_TYPE_SEARCH_TERMS: Record<string, string> = {
  ortopedica: 'orthopedic outcome',
  oncologica: 'oncology prognosis',
  ostetrica: 'obstetric malpractice',
  rc_auto: 'road traffic injury',
  previdenziale: 'disability assessment',
  infortuni: 'occupational injury',
  cardiologica: 'cardiac outcome',
  neurologica: 'neurological outcome',
  psichiatrica: 'psychiatric evaluation',
  oculistica: 'ophthalmologic outcome',
  odontoiatrica: 'dental malpractice',
  chirurgica: 'surgical outcome',
  generica: 'medico-legal',
};
