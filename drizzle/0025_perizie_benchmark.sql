-- Sprint 3 (Lavini quality piano 2026-05-17): perizie reali anonimizzate
-- usate come FEW-SHOT EXAMPLES nei prompt LLM.
--
-- Per ogni nuovo caso, il sistema retrieve la perizia benchmark piu simile
-- (case_type + lesion_type + section_type) e inietta il chunk corrispondente
-- come "esempio buono" nel prompt — il LLM impara stile/struttura del perito
-- reale (es. Dott. Lavini).
--
-- Architettura parallela a guidelines/guideline_chunks. Hybrid retrieval
-- (dense pgvector + sparse BM25 + RRF) come migration 0022/0023, MA con
-- filtro aggiuntivo `section_type` per pescare la sezione specifica.
--
-- Migration idempotente (IF NOT EXISTS ovunque). DA APPLICARE su Supabase
-- SQL editor dopo che Sprint 3 ingestion service e' pronto e si hanno
-- almeno 2-3 perizie benchmark da ingestare.

-- ── 1. Tabelle ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS perizie_benchmark (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peritan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  case_code_anonymized TEXT NOT NULL,
  case_type TEXT NOT NULL,
  case_role TEXT NOT NULL,
  lesion_type JSONB NOT NULL DEFAULT '[]'::jsonb,
  esito TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perizie_benchmark_peritan_id ON perizie_benchmark(peritan_id);
CREATE INDEX IF NOT EXISTS idx_perizie_benchmark_case_type ON perizie_benchmark(case_type);

CREATE TABLE IF NOT EXISTS perizie_benchmark_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perizia_id UUID NOT NULL REFERENCES perizie_benchmark(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  token_count INTEGER,
  -- GENERATED tsvector — multilingua (simple analyzer, allineato a migration 0023)
  tsvector_content tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perizie_benchmark_chunks_perizia_id ON perizie_benchmark_chunks(perizia_id);
CREATE INDEX IF NOT EXISTS idx_perizie_benchmark_chunks_section_type ON perizie_benchmark_chunks(section_type);

-- GIN index per BM25 sparse retrieval
CREATE INDEX IF NOT EXISTS idx_perizie_benchmark_chunks_tsvector
  ON perizie_benchmark_chunks USING GIN (tsvector_content);

-- ── 2. RLS policies ─────────────────────────────────────────────────

ALTER TABLE perizie_benchmark ENABLE ROW LEVEL SECURITY;
ALTER TABLE perizie_benchmark_chunks ENABLE ROW LEVEL SECURITY;

-- Solo service role manage (ingestion da admin)
DROP POLICY IF EXISTS "Service role manages perizie_benchmark" ON perizie_benchmark;
CREATE POLICY "Service role manages perizie_benchmark" ON perizie_benchmark
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages perizie_benchmark_chunks" ON perizie_benchmark_chunks;
CREATE POLICY "Service role manages perizie_benchmark_chunks" ON perizie_benchmark_chunks
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users possono READ (per few-shot injection nel prompt)
-- ma SOLO il content/section_type/embedding, NIENTE peritan_id o case_code
-- (privacy — peritan altri non devono sapere chi ha prodotto la perizia)
DROP POLICY IF EXISTS "Authenticated read perizie_benchmark_chunks" ON perizie_benchmark_chunks;
CREATE POLICY "Authenticated read perizie_benchmark_chunks" ON perizie_benchmark_chunks
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated read perizie_benchmark metadata" ON perizie_benchmark;
CREATE POLICY "Authenticated read perizie_benchmark metadata" ON perizie_benchmark
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = 1);

-- ── 3. RPC hybrid retrieval (clone match_guideline_chunks_hybrid + filtro section_type) ──

DROP FUNCTION IF EXISTS match_perizie_chunks_hybrid(vector, text, text, text, text, float, int, int);

CREATE OR REPLACE FUNCTION match_perizie_chunks_hybrid(
  query_embedding vector(1024),
  query_text text,
  match_section_type text,   -- e.g. 'documentazione_sanitaria', 'il_fatto_e_storia_clinica'
  match_case_type text,      -- e.g. 'ortopedica', 'rc_auto'
  match_case_role text,      -- e.g. 'ctu', 'stragiudiziale'
  match_threshold float DEFAULT 0.25,
  match_count int DEFAULT 1,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  content text,
  section_type text,
  case_code_anonymized text,
  case_type text,
  lesion_type jsonb,
  similarity float,
  retrieval_method text
)
LANGUAGE sql STABLE
AS $$
  WITH dense AS (
    SELECT
      pbc.id,
      1 - (pbc.embedding <=> query_embedding) AS similarity,
      ROW_NUMBER() OVER (ORDER BY pbc.embedding <=> query_embedding) AS rank
    FROM perizie_benchmark_chunks pbc
    JOIN perizie_benchmark pb ON pb.id = pbc.perizia_id
    WHERE pb.is_active = 1
      AND pbc.section_type = match_section_type
      AND pb.case_type = match_case_type
      AND pb.case_role = match_case_role
      AND 1 - (pbc.embedding <=> query_embedding) > match_threshold
    ORDER BY pbc.embedding <=> query_embedding
    LIMIT match_count * 3
  ),
  sparse AS (
    SELECT
      pbc.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(pbc.tsvector_content, websearch_to_tsquery('simple', query_text)) DESC
      ) AS rank
    FROM perizie_benchmark_chunks pbc
    JOIN perizie_benchmark pb ON pb.id = pbc.perizia_id
    WHERE pb.is_active = 1
      AND pbc.section_type = match_section_type
      AND pb.case_type = match_case_type
      AND pb.case_role = match_case_role
      AND pbc.tsvector_content @@ websearch_to_tsquery('simple', query_text)
    ORDER BY ts_rank_cd(pbc.tsvector_content, websearch_to_tsquery('simple', query_text)) DESC
    LIMIT match_count * 3
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
    pbc.content,
    pbc.section_type,
    pb.case_code_anonymized,
    pb.case_type,
    pb.lesion_type,
    COALESCE(c.dense_similarity, 0) AS similarity,
    c.retrieval_method
  FROM combined c
  JOIN perizie_benchmark_chunks pbc ON pbc.id = c.id
  JOIN perizie_benchmark pb ON pb.id = pbc.perizia_id
  ORDER BY c.rrf_score DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION match_perizie_chunks_hybrid(vector, text, text, text, text, float, int, int)
  TO authenticated, service_role;
