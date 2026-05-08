-- Wave C.2 (post-Schönweger): make BM25 retrieval language-agnostic.
-- Migration 0022 hardcoded `to_tsvector('italian', ...)` which only stems
-- Italian content. For German/English documents the BM25 lane was effectively
-- dead — only the dense pgvector lane was returning hits, halving recall on
-- multilingual cases (e.g. cartelle cliniche di Bolzano).
--
-- Fix: switch to the 'simple' tokenizer. It's language-agnostic (no stemming,
-- no stop-word removal) and works for any Latin-script language. We accept a
-- mild loss of Italian stemming because:
--   1. clinical chunks are short — partial matches still surface via the dense
--      lane and RRF fusion;
--   2. medical terminology is largely language-invariant (Latin/Greek roots);
--   3. multilingual robustness > 5% Italian-recall loss.
--
-- Both the column and the index are recreated to ensure the new analyzer is
-- applied to ALL existing rows (GENERATED columns can be reseeded by drop +
-- add). This is safe because the column has no foreign keys and is rebuilt
-- in a single statement; the GIN index follows.

-- 1. Drop existing index + column (must drop index first because it depends
--    on the column).
DROP INDEX IF EXISTS idx_guideline_chunks_tsvector;
ALTER TABLE guideline_chunks DROP COLUMN IF EXISTS tsvector_content;

-- 2. Re-add the tsvector column with the language-agnostic 'simple' analyzer.
ALTER TABLE guideline_chunks
  ADD COLUMN tsvector_content tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

-- 3. Recreate the GIN index.
CREATE INDEX idx_guideline_chunks_tsvector
  ON guideline_chunks USING GIN (tsvector_content);

-- 4. Recreate the hybrid retrieval RPC, swapping 'italian' → 'simple' in both
--    the WHERE clause and the ORDER BY ts_rank_cd. Drops first to allow the
--    signature to be replaced cleanly.
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
        ORDER BY ts_rank_cd(gc.tsvector_content, websearch_to_tsquery('simple', query_text)) DESC
      ) AS rank
    FROM guideline_chunks gc
    JOIN guidelines g ON g.id = gc.guideline_id
    WHERE g.is_active = 1
      AND g.case_types ? match_case_type
      AND gc.tsvector_content @@ websearch_to_tsquery('simple', query_text)
    ORDER BY ts_rank_cd(gc.tsvector_content, websearch_to_tsquery('simple', query_text)) DESC
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

GRANT EXECUTE ON FUNCTION match_guideline_chunks_hybrid(vector, text, text, float, int, int)
  TO authenticated, service_role;
