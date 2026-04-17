/**
 * Extracts key medical terms from consolidated events and searches PubMed
 * for relevant scientific evidence.
 *
 * Non-blocking: all errors are caught and result in empty arrays.
 * Budget: max 5 PubMed searches per case (~15 seconds worst case).
 *
 * Categories:
 * - diagnosis (max 2): top diagnoses by frequency
 * - treatment (max 2): procedures from intervention/therapy events
 * - causal_nexus (max 1): only when anomalies exist
 */

import { searchPubMed } from './pubmed-client';
import type { PubMedArticle } from './pubmed-client';
import { logger } from '@/lib/logger';

export type EvidenceCategory = 'diagnosis' | 'treatment' | 'causal_nexus';

export interface PubMedSearchResult {
  query: string;
  category: EvidenceCategory;
  articles: PubMedArticle[];
}

// Raised for comprehensive PubMed evidence coverage. Each search is cheap
// (API calls are KB-scale) — 8 total searches give better bibliographic breadth
// across multiple diagnoses / treatments in complex cases.
const MAX_DIAGNOSIS_SEARCHES = 4;
const MAX_TREATMENT_SEARCHES = 3;
const MAX_TOTAL_SEARCHES = 8;

/**
 * Common Italian→English medical term translations for PubMed search.
 * PubMed indexes articles in English — Italian terms won't match.
 */
const MEDICAL_TERM_TRANSLATIONS: Record<string, string> = {
  'frattura': 'fracture',
  'frattura periprotesica': 'periprosthetic fracture',
  'protesi ginocchio': 'knee prosthesis',
  'protesi anca': 'hip prosthesis',
  'artroprotesi': 'arthroplasty',
  'osteosintesi': 'osteosynthesis',
  'intervento chirurgico': 'surgery',
  'ricovero': 'hospitalization',
  'ritardo diagnostico': 'delayed diagnosis',
  'errore diagnostico': 'diagnostic error',
  'responsabilità professionale': 'medical malpractice',
  'danno biologico': 'biological damage',
  'nesso causale': 'causal relationship',
  'infezione nosocomiale': 'nosocomial infection',
  'complicanza': 'complication',
  'complicanza post-operatoria': 'postoperative complication',
  'lesione': 'injury',
  'trauma': 'trauma',
  'sinistro stradale': 'road accident',
  'incidente stradale': 'traffic accident',
  'colpo di frusta': 'whiplash',
  'ernia': 'hernia',
  'ernia del disco': 'disc herniation',
  'lombosciatalgia': 'lumbosciatalgia',
  'cervicalgia': 'cervicalgia',
  'contusione': 'contusion',
  'distorsione': 'sprain',
  'lussazione': 'dislocation',
  'neoplasia': 'neoplasm',
  'tumore': 'tumor',
  'chemioterapia': 'chemotherapy',
  'radioterapia': 'radiotherapy',
  'fisioterapia': 'physiotherapy',
  'riabilitazione': 'rehabilitation',
  'invalidità': 'disability',
  'inabilità temporanea': 'temporary disability',
  'malattia professionale': 'occupational disease',
  'infortunio sul lavoro': 'work injury',
  'parto': 'delivery',
  'taglio cesareo': 'cesarean section',
  'asfissia neonatale': 'neonatal asphyxia',
  'paralisi cerebrale': 'cerebral palsy',
  'consenso informato': 'informed consent',
};

/**
 * Translate Italian medical terms to English for PubMed search.
 * Tries exact match first, then individual word translations.
 */
function translateForPubMed(italianTerm: string): string {
  const lower = italianTerm.toLowerCase().trim();

  // Try exact match
  if (MEDICAL_TERM_TRANSLATIONS[lower]) {
    return MEDICAL_TERM_TRANSLATIONS[lower];
  }

  // Try longest substring match
  for (const [it, en] of Object.entries(MEDICAL_TERM_TRANSLATIONS).sort((a, b) => b[0].length - a[0].length)) {
    if (lower.includes(it)) {
      return lower.replace(it, en);
    }
  }

  // Return original (some Italian medical terms like "frattura" are close to English)
  return italianTerm;
}

/**
 * Enrich a case with full PubMed evidence across 3 categories.
 *
 * 1. Diagnosis (max 2): top diagnoses by frequency
 * 2. Treatment (max 2): procedures from intervento/terapia events
 * 3. Causal nexus (max 1): only if anomalies present, combines primary diagnosis + anomaly
 */
export async function enrichWithFullEvidence(
  events: Array<{ title: string; description: string; diagnosis: string | null; event_type?: string }>,
  anomalies: Array<{ anomalyType: string; description: string }>,
  caseType: string,
): Promise<PubMedSearchResult[]> {
  const results: PubMedSearchResult[] = [];
  let searchCount = 0;

  // --- 1. Diagnosis searches (max 2) ---
  const diagnosisCounts = new Map<string, number>();
  for (const event of events) {
    if (!event.diagnosis || typeof event.diagnosis !== 'string') continue;
    const normalized = event.diagnosis.trim().toLowerCase();
    if (normalized.length < 3) continue;
    diagnosisCounts.set(normalized, (diagnosisCounts.get(normalized) ?? 0) + 1);
  }

  const topDiagnoses = [...diagnosisCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DIAGNOSIS_SEARCHES)
    .map(([diagnosis]) => diagnosis);

  if (topDiagnoses.length > 0) {
    logger.info('pubmed', `Searching PubMed for ${topDiagnoses.length} diagnoses (from ${diagnosisCounts.size} unique)`);
  }

  for (const diagnosis of topDiagnoses) {
    if (searchCount >= MAX_TOTAL_SEARCHES) break;
    const translatedDiagnosis = translateForPubMed(diagnosis);
    const query = buildSearchQuery(translatedDiagnosis, caseType);
    try {
      const articles = await searchPubMed(query, 5);
      searchCount++;
      if (articles.length > 0) {
        results.push({ query: diagnosis, category: 'diagnosis', articles });
        logger.info('pubmed', `Found ${articles.length} articles for diagnosis query`, { resultCount: articles.length });
      }
    } catch (error) {
      logger.warn('pubmed', 'Search failed for diagnosis query', { error: error instanceof Error ? error.message : 'unknown' });
    }
  }

  // --- 2. Treatment searches (max 2) ---
  const procedureCounts = new Map<string, number>();
  for (const event of events) {
    if (event.event_type !== 'intervento' && event.event_type !== 'terapia') continue;
    const normalized = event.title.trim().toLowerCase();
    if (normalized.length < 3) continue;
    procedureCounts.set(normalized, (procedureCounts.get(normalized) ?? 0) + 1);
  }

  const topProcedures = [...procedureCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TREATMENT_SEARCHES)
    .map(([procedure]) => procedure);

  for (const procedure of topProcedures) {
    if (searchCount >= MAX_TOTAL_SEARCHES) break;
    const translatedProcedure = translateForPubMed(procedure);
    const query = `"${translatedProcedure}" AND (outcomes OR complications OR "evidence based")`;
    try {
      const articles = await searchPubMed(query, 5);
      searchCount++;
      if (articles.length > 0) {
        results.push({ query: procedure, category: 'treatment', articles });
        logger.info('pubmed', `Found ${articles.length} articles for treatment query`, { resultCount: articles.length });
      }
    } catch (error) {
      logger.warn('pubmed', 'Search failed for treatment query', { error: error instanceof Error ? error.message : 'unknown' });
    }
  }

  // --- 3. Causal nexus search (max 1, only if anomalies exist) ---
  if (anomalies.length > 0 && topDiagnoses.length > 0 && searchCount < MAX_TOTAL_SEARCHES) {
    const primaryDiagnosis = translateForPubMed(topDiagnoses[0]);
    const anomalyDescription = anomalies[0].description;
    const query = `"${primaryDiagnosis}" AND ("delayed diagnosis" OR "medical malpractice" OR "causal relationship" OR prognosis)`;
    try {
      const articles = await searchPubMed(query, 5);
      searchCount++;
      if (articles.length > 0) {
        results.push({ query: `${primaryDiagnosis} — ${anomalyDescription}`, category: 'causal_nexus', articles });
        logger.info('pubmed', `Found ${articles.length} articles for causal nexus`);
      }
    } catch (error) {
      logger.warn('pubmed', `Search failed for causal nexus: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  logger.info('pubmed', `PubMed enrichment complete: ${results.length} queries returned results, ${results.reduce((s, r) => s + r.articles.length, 0)} total articles`);
  return results;
}

/**
 * @deprecated Use enrichWithFullEvidence() instead. Kept for backward compatibility.
 *
 * Enrich a case with PubMed evidence based on diagnoses found in events.
 */
export async function enrichWithPubMedEvidence(
  events: Array<{ title: string; description: string; diagnosis: string | null }>,
  caseType: string,
): Promise<PubMedSearchResult[]> {
  return enrichWithFullEvidence(events, [], caseType);
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
