-- Verifica idempotente che la migration 0023_hybrid_rag_multilingua.sql
-- sia stata applicata correttamente al database Supabase.
--
-- USO: incolla l'intero file nel Supabase SQL editor ed esegui.
--      Tutti i check restituiscono 'OK' o 'FAIL: <motivo>'.
--      Se anche un solo check torna FAIL, riapplicare la migration 0023.
--
-- Cosa verifica:
--   1. Esiste la colonna `guideline_chunks.tsvector_content` di tipo tsvector
--   2. L'espressione GENERATED usa `to_tsvector('simple', ...)` (NON 'italian')
--   3. Esiste l'indice GIN `idx_guideline_chunks_tsvector`
--   4. La funzione `match_guideline_chunks_hybrid` usa 'simple' nel body
--   5. La funzione e' eseguibile dal ruolo `authenticated`

WITH checks AS (
  -- Check 1: column exists with correct type
  SELECT
    1 AS check_num,
    'colonna tsvector_content esiste su guideline_chunks' AS check_name,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'guideline_chunks'
          AND column_name = 'tsvector_content'
          AND udt_name = 'tsvector'
      ) THEN 'OK'
      ELSE 'FAIL: colonna mancante o tipo errato'
    END AS result

  UNION ALL

  -- Check 2: generation expression uses 'simple', not 'italian'
  SELECT
    2,
    'colonna tsvector_content usa analyzer simple (non italian)',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE c.relname = 'guideline_chunks'
          AND a.attname = 'tsvector_content'
          AND pg_get_expr(ad.adbin, ad.adrelid) LIKE '%''simple''%'
          AND pg_get_expr(ad.adbin, ad.adrelid) NOT LIKE '%''italian''%'
      ) THEN 'OK'
      ELSE 'FAIL: espressione GENERATED non usa simple, riapplicare 0023'
    END

  UNION ALL

  -- Check 3: GIN index exists on the column
  SELECT
    3,
    'indice GIN idx_guideline_chunks_tsvector esiste',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_guideline_chunks_tsvector'
          AND indexdef LIKE '%USING gin%'
          AND indexdef LIKE '%tsvector_content%'
      ) THEN 'OK'
      ELSE 'FAIL: indice GIN mancante o errato'
    END

  UNION ALL

  -- Check 4: function body uses 'simple' tokenizer in websearch_to_tsquery
  SELECT
    4,
    'funzione match_guideline_chunks_hybrid usa simple (non italian)',
    CASE
      WHEN EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'match_guideline_chunks_hybrid'
          AND pg_get_functiondef(p.oid) LIKE '%websearch_to_tsquery(''simple''%'
          AND pg_get_functiondef(p.oid) NOT LIKE '%websearch_to_tsquery(''italian''%'
      ) THEN 'OK'
      ELSE 'FAIL: funzione usa ancora analyzer italian, riapplicare 0023'
    END

  UNION ALL

  -- Check 5: authenticated role has EXECUTE on the function
  SELECT
    5,
    'ruolo authenticated ha EXECUTE su match_guideline_chunks_hybrid',
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'match_guideline_chunks_hybrid'
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ) THEN 'OK'
      ELSE 'FAIL: privilege EXECUTE non concesso'
    END
)
SELECT
  check_num,
  check_name,
  result,
  CASE WHEN result = 'OK' THEN '✓' ELSE '✗' END AS status
FROM checks
ORDER BY check_num;

-- Sanity check separato: numero righe in guideline_chunks con tsvector non-nullo.
-- Le colonne GENERATED STORED si popolano automaticamente all'ALTER TABLE,
-- quindi se la migration ha funzionato dovresti vedere row_count = total_rows.
SELECT
  COUNT(*) AS total_rows,
  COUNT(tsvector_content) AS rows_with_tsvector,
  CASE
    WHEN COUNT(*) = COUNT(tsvector_content) THEN 'OK: tutte le righe hanno tsvector popolato'
    ELSE 'WARN: alcune righe mancano tsvector — backfill incompleto?'
  END AS status
FROM guideline_chunks;
