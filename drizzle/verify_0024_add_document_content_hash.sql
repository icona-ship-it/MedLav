-- Verifica idempotente che la migration 0024_add_document_content_hash.sql
-- sia stata applicata correttamente al database Supabase.
--
-- USO: incolla l'intero file nel Supabase SQL editor ed esegui.

WITH checks AS (
  -- Check 1: column exists with correct type
  SELECT
    1 AS check_num,
    'colonna documents.content_hash esiste come text' AS check_name,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents'
          AND column_name = 'content_hash'
          AND data_type = 'text'
      ) THEN 'OK'
      ELSE 'FAIL: colonna mancante o tipo errato'
    END AS result

  UNION ALL

  -- Check 2: partial UNIQUE index exists
  SELECT
    2,
    'indice UNIQUE parziale idx_documents_case_content_hash_unique esiste',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_documents_case_content_hash_unique'
          AND indexdef LIKE '%UNIQUE%'
          AND indexdef LIKE '%case_id%'
          AND indexdef LIKE '%content_hash%'
          AND indexdef LIKE '%WHERE (content_hash IS NOT NULL)%'
      ) THEN 'OK'
      ELSE 'FAIL: indice UNIQUE parziale mancante o errato'
    END
)
SELECT
  check_num,
  check_name,
  result,
  CASE WHEN result = 'OK' THEN '✓' ELSE '✗' END AS status
FROM checks
ORDER BY check_num;

-- Sanity: numero di documenti senza hash (legacy pre-0024 vs nuovi)
SELECT
  COUNT(*) FILTER (WHERE content_hash IS NULL) AS legacy_no_hash,
  COUNT(*) FILTER (WHERE content_hash IS NOT NULL) AS with_hash,
  COUNT(*) AS total
FROM documents;
