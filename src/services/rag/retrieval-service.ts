import { createAdminClient } from '@/lib/supabase/admin';
import { generateQueryEmbedding } from './embedding-service';
import type { CaseType } from '@/types';

const DEFAULT_TOP_K = 5;
const MIN_SIMILARITY = 0.3; // cosine similarity threshold

export interface RetrievedChunk {
  content: string;
  sectionTitle: string | null;
  guidelineTitle: string;
  guidelineSource: string;
  similarity: number;
}

/**
 * Retrieve the most relevant guideline chunks for a query.
 * Uses pgvector cosine similarity search, filtered by case type.
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
    console.error(`[rag:retrieval] Search failed: ${error.message}`);
    return [];
  }

  const results = (data ?? []) as Array<{
    content: string;
    section_title: string | null;
    guideline_title: string;
    guideline_source: string;
    similarity: number;
  }>;

  console.log(`[rag:retrieval] Found ${results.length} relevant chunks (query: "${query.slice(0, 60)}...")`);

  return results.map((r) => ({
    content: r.content,
    sectionTitle: r.section_title,
    guidelineTitle: r.guideline_title,
    guidelineSource: r.guideline_source,
    similarity: r.similarity,
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
    const chunks = await retrieveRelevantGuidelines({
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

  const contextLines = topChunks.map((c) =>
    `### ${c.guidelineTitle} (${c.guidelineSource})${c.sectionTitle ? ` — ${c.sectionTitle}` : ''}\n${c.content}`,
  );

  return `## LINEE GUIDA CLINICHE RILEVANTI (recuperate automaticamente)

Le seguenti linee guida sono state identificate come rilevanti per questo caso.
Citale nel report quando pertinenti, indicando fonte e anno.

${contextLines.join('\n\n')}`;
}
