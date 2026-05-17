-- Verifica idempotente che la migration 0025_perizie_benchmark.sql
-- sia stata applicata correttamente su Supabase.
--
-- USO: incolla nell'editor SQL Supabase. 7 check + sanity count.

WITH checks AS (
  SELECT
    1 AS check_num,
    'tabella perizie_benchmark esiste con colonne corrette' AS check_name,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'perizie_benchmark' AND column_name = 'case_type'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'perizie_benchmark' AND column_name = 'peritan_id'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'perizie_benchmark' AND column_name = 'lesion_type' AND data_type = 'jsonb'
      ) THEN 'OK'
      ELSE 'FAIL: tabella perizie_benchmark mancante o colonne errate'
    END AS result

  UNION ALL

  SELECT
    2,
    'tabella perizie_benchmark_chunks esiste con colonne corrette',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'perizie_benchmark_chunks' AND column_name = 'section_type'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'perizie_benchmark_chunks' AND column_name = 'embedding'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'perizie_benchmark_chunks' AND column_name = 'tsvector_content'
      ) THEN 'OK'
      ELSE 'FAIL: tabella perizie_benchmark_chunks mancante o colonne errate'
    END

  UNION ALL

  SELECT
    3,
    'embedding e vector(1024)',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'perizie_benchmark_chunks' AND column_name = 'embedding'
          AND udt_name = 'vector'
      ) THEN 'OK'
      ELSE 'FAIL: column embedding non e vector — pgvector extension installata?'
    END

  UNION ALL

  SELECT
    4,
    'tsvector_content usa analyzer simple (multilingua)',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE c.relname = 'perizie_benchmark_chunks'
          AND a.attname = 'tsvector_content'
          AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%''simple''%'
      ) THEN 'OK'
      ELSE 'FAIL: tsvector non usa simple analyzer'
    END

  UNION ALL

  SELECT
    5,
    'indice GIN idx_perizie_benchmark_chunks_tsvector esiste',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_perizie_benchmark_chunks_tsvector'
          AND indexdef LIKE '%USING gin%'
          AND indexdef LIKE '%tsvector_content%'
      ) THEN 'OK'
      ELSE 'FAIL: indice GIN mancante'
    END

  UNION ALL

  SELECT
    6,
    'funzione match_perizie_chunks_hybrid esiste con 8 parametri',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'match_perizie_chunks_hybrid'
          AND pg_get_functiondef(p.oid) LIKE '%match_section_type%'
          AND pg_get_functiondef(p.oid) LIKE '%match_case_type%'
          AND pg_get_functiondef(p.oid) LIKE '%websearch_to_tsquery(''simple''%'
      ) THEN 'OK'
      ELSE 'FAIL: RPC mancante o usa analyzer sbagliato'
    END

  UNION ALL

  SELECT
    7,
    'authenticated ha EXECUTE su match_perizie_chunks_hybrid + RLS attiva',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'match_perizie_chunks_hybrid'
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ) AND EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = 'perizie_benchmark'
          AND rowsecurity = true
      ) THEN 'OK'
      ELSE 'FAIL: privilegi/RLS non configurati correttamente'
    END
)
SELECT
  check_num,
  check_name,
  result,
  CASE WHEN result = 'OK' THEN '✓' ELSE '✗' END AS status
FROM checks
ORDER BY check_num;

-- Sanity count tabelle (saranno 0 finche' non si ingestano perizie)
SELECT
  (SELECT COUNT(*) FROM perizie_benchmark) AS total_perizie,
  (SELECT COUNT(*) FROM perizie_benchmark_chunks) AS total_chunks,
  (SELECT COUNT(DISTINCT case_type) FROM perizie_benchmark) AS case_types_distinct;
