import { createAdminClient } from '@/lib/supabase/admin';
import { generateQueryEmbedding } from './embedding-service';
import type { CaseType } from '@/types';
import { logger } from '@/lib/logger';

const DEFAULT_TOP_K = 5;
const MIN_SIMILARITY = 0.3; // cosine similarity threshold
const RRF_K = 60; // Reciprocal Rank Fusion constant (standard value, balances rank vs score)

export interface RetrievedChunk {
  content: string;
  sectionTitle: string | null;
  guidelineTitle: string;
  guidelineSource: string;
  guidelineYear: number | null;
  similarity: number;
  /** When using hybrid retrieval: 'dense' (semantic only), 'sparse' (BM25 only), or 'both'. */
  retrievalMethod?: 'dense' | 'sparse' | 'both';
}

/**
 * Retrieve the most relevant guideline chunks for a query.
 * Uses pgvector cosine similarity search, filtered by case type.
 *
 * NOTE: For new code prefer retrieveRelevantGuidelinesHybrid which combines
 * dense + sparse retrieval for better recall on rare medical terms. This
 * dense-only function is kept for backward compat and as a fallback when
 * the hybrid RPC is not yet deployed (pre-migration 0022).
 */
export async function retrieveRelevantGuidelines(params: {
  query: string;
  caseType: CaseType;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const { query, caseType, topK = DEFAULT_TOP_K } = params;

  // 1. Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // 2. Run semantic search via Supabase RPC
  // This requires a SQL function created in the migration
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('match_guideline_chunks', {
    query_embedding: embeddingStr,
    match_case_type: caseType,
    match_threshold: MIN_SIMILARITY,
    match_count: topK,
  });

  if (error) {
    logger.error('rag:retrieval', `Search failed: ${error.message}`);
    return [];
  }

  const results = (data ?? []) as Array<{
    content: string;
    section_title: string | null;
    guideline_title: string;
    guideline_source: string;
    guideline_year: number | null;
    similarity: number;
  }>;

  logger.info('rag:retrieval', `Found ${results.length} relevant chunks (query: "${query.slice(0, 60)}...")`);

  return results.map((r) => ({
    content: r.content,
    sectionTitle: r.section_title,
    guidelineTitle: r.guideline_title,
    guidelineSource: r.guideline_source,
    guidelineYear: r.guideline_year ?? null,
    similarity: r.similarity,
  }));
}

/**
 * Hybrid retrieval: combines dense (pgvector cosine) and sparse (BM25 via
 * Postgres tsvector with italian config) using Reciprocal Rank Fusion.
 *
 * Why hybrid: dense embeddings catch semantic meaning ("dolore lombare" ≈
 * "lombalgia"), sparse catches exact-term matches that semantics miss
 * ("spondilite anchilosante" with rare technical name). RRF fuses both
 * ranked lists into a single score, giving the best of both axes.
 *
 * Falls back to dense-only via retrieveRelevantGuidelines() if the hybrid
 * RPC is missing — useful during the migration window.
 *
 * Requires migration 0022_hybrid_rag_bm25.sql to be applied (creates
 * tsvector_content column + GIN index + match_guideline_chunks_hybrid RPC).
 */
export async function retrieveRelevantGuidelinesHybrid(params: {
  query: string;
  caseType: CaseType;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const { query, caseType, topK = DEFAULT_TOP_K } = params;

  const queryEmbedding = await generateQueryEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('match_guideline_chunks_hybrid', {
    query_embedding: embeddingStr,
    query_text: query,
    match_case_type: caseType,
    match_threshold: MIN_SIMILARITY,
    match_count: topK,
    rrf_k: RRF_K,
  });

  // Fallback: hybrid RPC not deployed yet → use dense-only.
  // Detected by Postgres error code 42883 (function does not exist).
  if (error) {
    if (error.code === '42883' || /does not exist/i.test(error.message ?? '')) {
      logger.warn('rag:retrieval', 'Hybrid RPC not found, falling back to dense-only. Apply migration 0022.');
      return retrieveRelevantGuidelines({ query, caseType, topK });
    }
    logger.error('rag:retrieval', `Hybrid search failed: ${error.message}`);
    return [];
  }

  const results = (data ?? []) as Array<{
    content: string;
    section_title: string | null;
    guideline_title: string;
    guideline_source: string;
    guideline_year: number | null;
    similarity: number;
    retrieval_method: 'dense' | 'sparse' | 'both';
  }>;

  logger.info(
    'rag:retrieval',
    `Hybrid: ${results.length} chunks (${results.filter((r) => r.retrieval_method === 'both').length} both, ${results.filter((r) => r.retrieval_method === 'dense').length} dense-only, ${results.filter((r) => r.retrieval_method === 'sparse').length} sparse-only)`,
  );

  return results.map((r) => ({
    content: r.content,
    sectionTitle: r.section_title,
    guidelineTitle: r.guideline_title,
    guidelineSource: r.guideline_source,
    guidelineYear: r.guideline_year ?? null,
    similarity: r.similarity,
    retrievalMethod: r.retrieval_method,
  }));
}

/**
 * Build a context string from retrieved chunks for prompt injection.
 * Returns empty string if no relevant chunks found.
 * Supports caseTypes array: searches guidelines for all selected types.
 */
export async function buildGuidelineContext(params: {
  events: Array<{ title: string; description: string; eventType: string }>;
  caseType: CaseType;
  caseTypes?: CaseType[];
  maxChunks?: number;
}): Promise<string> {
  const { events, caseType, caseTypes, maxChunks = 5 } = params;

  // Build a query from the key clinical events
  const keyEvents = events
    .filter((e) => ['diagnosi', 'intervento', 'complicanza', 'terapia'].includes(e.eventType))
    .slice(0, 10);

  if (keyEvents.length === 0) return '';

  const query = keyEvents
    .map((e) => `${e.title}: ${e.description.slice(0, 150)}`)
    .join('\n');

  // For multi-type: search across all types, deduplicate results
  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const allChunks: RetrievedChunk[] = [];
  const seenContent = new Set<string>();

  for (const ct of effectiveTypes) {
    // Prefer hybrid retrieval (dense + BM25). Falls back to dense-only if
    // migration 0022_hybrid_rag_bm25.sql has not been applied yet.
    const chunks = await retrieveRelevantGuidelinesHybrid({
      query,
      caseType: ct,
      topK: maxChunks,
    });

    for (const chunk of chunks) {
      // Deduplicate by content hash (first 100 chars)
      const contentKey = chunk.content.slice(0, 100);
      if (!seenContent.has(contentKey)) {
        seenContent.add(contentKey);
        allChunks.push(chunk);
      }
    }
  }

  // Sort by similarity and take top N
  const topChunks = allChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxChunks);

  if (topChunks.length === 0) return '';

  const contextLines = topChunks.map((c) => {
    const yearLabel = c.guidelineYear ? `, ${c.guidelineYear}` : ', n.d.';
    return `### ${c.guidelineTitle} [${c.guidelineSource}${yearLabel}]${c.sectionTitle ? ` — ${c.sectionTitle}` : ''}\n${c.content}`;
  });

  return `## LINEE GUIDA CLINICHE RILEVANTI (recuperate automaticamente)

Le seguenti linee guida sono state identificate come rilevanti per questo caso.
OBBLIGO: Quando utilizzi informazioni da queste linee guida, cita SEMPRE con formato:
"Secondo le Linee Guida [Fonte, Anno], ..."
NON utilizzare linee guida senza citazione esplicita della fonte e dell'anno.

${contextLines.join('\n\n')}`;
}
