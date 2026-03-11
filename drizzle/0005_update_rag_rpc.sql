-- Update match_guideline_chunks RPC to also return guideline_year
-- Must DROP first because RETURNS TABLE signature changed (added guideline_year)
DROP FUNCTION IF EXISTS match_guideline_chunks(vector, text, float, int);
DROP FUNCTION IF EXISTS match_guideline_chunks(vector, text, double precision, integer);

CREATE OR REPLACE FUNCTION match_guideline_chunks(
  query_embedding vector(1024),
  match_case_type text,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  content text,
  section_title text,
  guideline_title text,
  guideline_source text,
  guideline_year integer,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    gc.content,
    gc.section_title,
    g.title AS guideline_title,
    g.source AS guideline_source,
    g.year AS guideline_year,
    1 - (gc.embedding <=> query_embedding) AS similarity
  FROM guideline_chunks gc
  JOIN guidelines g ON g.id = gc.guideline_id
  WHERE g.is_active = 1
    AND g.case_types ? match_case_type
    AND 1 - (gc.embedding <=> query_embedding) > match_threshold
  ORDER BY gc.embedding <=> query_embedding
  LIMIT match_count;
$$;
