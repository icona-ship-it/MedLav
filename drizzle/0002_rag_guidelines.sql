-- RAG: Clinical Guidelines with pgvector embeddings
-- Prerequisites: enable pgvector extension in Supabase Dashboard → Database → Extensions → vector

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "guidelines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "source" text NOT NULL,
  "year" integer,
  "case_types" jsonb NOT NULL DEFAULT '[]',
  "chunk_count" integer NOT NULL DEFAULT 0,
  "is_active" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "guideline_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guideline_id" uuid NOT NULL REFERENCES "guidelines"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "section_title" text,
  "embedding" vector(1024),
  "token_count" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_guideline_chunks_guideline_id" ON "guideline_chunks" ("guideline_id");

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS "idx_guideline_chunks_embedding" ON "guideline_chunks"
  USING hnsw ("embedding" vector_cosine_ops);

-- RLS: guidelines are readable by all authenticated users (reference data)
ALTER TABLE "guidelines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guideline_chunks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guidelines_read" ON "guidelines"
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "guideline_chunks_read" ON "guideline_chunks"
  FOR SELECT TO authenticated USING (true);

-- Only service_role (admin) can insert/update/delete guidelines
CREATE POLICY "guidelines_admin_write" ON "guidelines"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "guideline_chunks_admin_write" ON "guideline_chunks"
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC function for semantic search with case type filtering
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
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    gc.content,
    gc.section_title,
    g.title AS guideline_title,
    g.source AS guideline_source,
    1 - (gc.embedding <=> query_embedding) AS similarity
  FROM guideline_chunks gc
  JOIN guidelines g ON g.id = gc.guideline_id
  WHERE g.is_active = 1
    AND g.case_types ? match_case_type
    AND 1 - (gc.embedding <=> query_embedding) > match_threshold
  ORDER BY gc.embedding <=> query_embedding
  LIMIT match_count;
$$;
