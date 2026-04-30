-- Wave 3.1: Hybrid RAG retrieval (dense pgvector + sparse BM25 via tsvector)
-- Adds Italian-language full-text search alongside existing pgvector cosine search,
-- combined via Reciprocal Rank Fusion (RRF) for best-of-both-worlds recall.
-- Background: dense embeddings catch semantic similarity but miss rare medical terms.
-- BM25 sparse retrieval catches exact-term matches. Hybrid wins on both axes.
-- Reference: best-practice 2026 RAG architecture for medical knowledge bases.

-- 1. Add the tsvector column. GENERATED STORED auto-populates for existing rows
--    during ALTER TABLE and stays in sync on every INSERT/UPDATE without app code changes.
ALTER TABLE guideline_chunks
  ADD COLUMN IF NOT EXISTS tsvector_content tsvector
  GENERATED ALWAYS AS (to_tsvector('italian', content)) STORED;

-- 2. GIN index for fast full-text queries.
CREATE INDEX IF NOT EXISTS idx_guideline_chunks_tsvector
  ON guideline_chunks USING GIN (tsvector_content);

-- 3. Hybrid retrieval RPC: dense + sparse + Reciprocal Rank Fusion.
--    Drops if exists to allow re-deploys.
DROP FUNCTION IF EXISTS match_guideline_chunks_hybrid(vector, text, text, float, int, int);

CREATE OR REPLACE FUNCTION match_guideline_chunks_hybrid(
  query_embedding vector(1024),
  query_text text,
  match_case_type text,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  content text,
  section_title text,
  guideline_title text,
  guideline_source text,
  guideline_year integer,
  similarity float,
  retrieval_method text
)
LANGUAGE sql STABLE
AS $$
  WITH dense AS (
    SELECT
      gc.id,
      1 - (gc.embedding <=> query_embedding) AS similarity,
      ROW_NUMBER() OVER (ORDER BY gc.embedding <=> query_embedding) AS rank
    FROM guideline_chunks gc
    JOIN guidelines g ON g.id = gc.guideline_id
    WHERE g.is_active = 1
      AND g.case_types ? match_case_type
      AND 1 - (gc.embedding <=> query_embedding) > match_threshold
    ORDER BY gc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  sparse AS (
    SELECT
      gc.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(gc.tsvector_content, websearch_to_tsquery('italian', query_text)) DESC
      ) AS rank
    FROM guideline_chunks gc
    JOIN guidelines g ON g.id = gc.guideline_id
    WHERE g.is_active = 1
      AND g.case_types ? match_case_type
      AND gc.tsvector_content @@ websearch_to_tsquery('italian', query_text)
    ORDER BY ts_rank_cd(gc.tsvector_content, websearch_to_tsquery('italian', query_text)) DESC
    LIMIT match_count * 2
  ),
  combined AS (
    SELECT
      COALESCE(d.id, s.id) AS id,
      COALESCE(1.0 / (rrf_k + d.rank), 0) + COALESCE(1.0 / (rrf_k + s.rank), 0) AS rrf_score,
      d.similarity AS dense_similarity,
      CASE
        WHEN d.id IS NOT NULL AND s.id IS NOT NULL THEN 'both'
        WHEN d.id IS NOT NULL THEN 'dense'
        ELSE 'sparse'
      END AS retrieval_method
    FROM dense d
    FULL OUTER JOIN sparse s ON d.id = s.id
  )
  SELECT
    gc.content,
    gc.section_title,
    g.title AS guideline_title,
    g.source AS guideline_source,
    g.year AS guideline_year,
    COALESCE(c.dense_similarity, 0) AS similarity,
    c.retrieval_method
  FROM combined c
  JOIN guideline_chunks gc ON gc.id = c.id
  JOIN guidelines g ON g.id = gc.guideline_id
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
$$;

-- 4. Grant execute on the function to the authenticated and service roles
--    (mirror existing match_guideline_chunks permissions).
GRANT EXECUTE ON FUNCTION match_guideline_chunks_hybrid(vector, text, text, float, int, int)
  TO authenticated, service_role;
