-- ============================================================================
-- MedLav — Script di VERIFICA Supabase
-- Esegui nel SQL Editor di Supabase per diagnosticare lo stato del database.
-- Questo script NON modifica nulla, solo SELECT.
-- ============================================================================

-- ─── 1. TABELLE ATTESE vs PRESENTI ─────────────────────────────────────────

SELECT '=== 1. VERIFICA TABELLE ===' AS sezione;

WITH expected_tables AS (
  SELECT unnest(ARRAY[
    'profiles','cases','documents','pages','events','event_images',
    'anomalies','missing_documents','reports','report_exports',
    'audit_log','guidelines','guideline_chunks','report_ratings','case_shares'
  ]) AS table_name
),
actual_tables AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
)
SELECT
  e.table_name,
  CASE WHEN a.table_name IS NOT NULL THEN 'OK' ELSE 'MANCANTE' END AS stato
FROM expected_tables e
LEFT JOIN actual_tables a ON e.table_name = a.table_name
ORDER BY e.table_name;

-- Tabelle EXTRA (non attese dal codice)
SELECT '--- Tabelle EXTRA (non nel codice) ---' AS nota;
SELECT table_name AS tabella_extra
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN (
    'profiles','cases','documents','pages','events','event_images',
    'anomalies','missing_documents','reports','report_exports',
    'audit_log','guidelines','guideline_chunks','report_ratings','case_shares'
  )
ORDER BY table_name;


-- ─── 2. COLONNE PROFILES (include nuove colonne Stripe + prefs) ────────────

SELECT '=== 2. COLONNE PROFILES ===' AS sezione;

WITH expected_cols AS (
  SELECT unnest(ARRAY[
    'id','email','full_name','studio',
    'stripe_customer_id','subscription_status','subscription_plan','subscription_period_end',
    'email_notifications','is_active',
    'created_at','updated_at'
  ]) AS col_name
),
actual_cols AS (
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
)
SELECT
  e.col_name,
  CASE WHEN a.column_name IS NOT NULL THEN 'OK' ELSE 'MANCANTE' END AS stato
FROM expected_cols e
LEFT JOIN actual_cols a ON e.col_name = a.column_name
ORDER BY e.col_name;


-- ─── 3. COLONNE CASES (include case_types + perizia_metadata) ──────────────

SELECT '=== 3. COLONNE CASES ===' AS sezione;

WITH expected_cols AS (
  SELECT unnest(ARRAY[
    'id','user_id','code','patient_initials','practice_reference',
    'case_type','case_types','case_role','status','notes','perizia_metadata',
    'document_count','created_at','updated_at'
  ]) AS col_name
),
actual_cols AS (
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'cases'
)
SELECT
  e.col_name,
  CASE WHEN a.column_name IS NOT NULL THEN 'OK' ELSE 'MANCANTE' END AS stato
FROM expected_cols e
LEFT JOIN actual_cols a ON e.col_name = a.column_name
ORDER BY e.col_name;


-- ─── 4. COLONNE EVENTS (include source_text, source_pages, extraction_pass) ─

SELECT '=== 4. COLONNE EVENTS ===' AS sezione;

WITH expected_cols AS (
  SELECT unnest(ARRAY[
    'id','case_id','document_id','order_number','event_date','date_precision',
    'event_type','title','description','source_type','diagnosis','doctor','facility',
    'confidence','requires_verification','reliability_notes','expert_notes',
    'source_text','source_pages','extraction_pass',
    'is_deleted','created_at','updated_at'
  ]) AS col_name
),
actual_cols AS (
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'events'
)
SELECT
  e.col_name,
  CASE WHEN a.column_name IS NOT NULL THEN 'OK' ELSE 'MANCANTE' END AS stato
FROM expected_cols e
LEFT JOIN actual_cols a ON e.col_name = a.column_name
ORDER BY e.col_name;


-- ─── 5. ENUMS ──────────────────────────────────────────────────────────────

SELECT '=== 5. VERIFICA ENUMS ===' AS sezione;

WITH expected_enums AS (
  SELECT unnest(ARRAY[
    'case_type','case_role','case_status','document_type','processing_status',
    'date_precision','event_type','source_type','extraction_pass',
    'anomaly_type','anomaly_severity','report_status'
  ]) AS enum_name
),
actual_enums AS (
  SELECT DISTINCT t.typname AS enum_name
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
)
SELECT
  e.enum_name,
  CASE WHEN a.enum_name IS NOT NULL THEN 'OK' ELSE 'MANCANTE' END AS stato
FROM expected_enums e
LEFT JOIN actual_enums a ON e.enum_name = a.enum_name
ORDER BY e.enum_name;

-- Valori enum case_type (deve includere rc_auto, previdenziale, infortuni)
SELECT '--- Valori case_type ---' AS nota;
SELECT e.enumlabel AS valore
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'case_type'
ORDER BY e.enumsortorder;

-- Valori anomaly_type (deve includere valore_clinico_critico, sequenza_temporale_violata)
SELECT '--- Valori anomaly_type ---' AS nota;
SELECT e.enumlabel AS valore
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'anomaly_type'
ORDER BY e.enumsortorder;


-- ─── 6. PGVECTOR EXTENSION ─────────────────────────────────────────────────

SELECT '=== 6. PGVECTOR ===' AS sezione;

SELECT
  extname,
  extversion,
  CASE WHEN extname = 'vector' THEN 'OK' ELSE 'MANCANTE' END AS stato
FROM pg_extension
WHERE extname = 'vector';

-- Se il risultato è vuoto, pgvector NON è abilitato!
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
  THEN 'pgvector: OK'
  ELSE 'pgvector: MANCANTE — abilitare da Dashboard → Database → Extensions → vector'
END AS pgvector_stato;


-- ─── 7. TIPO COLONNA EMBEDDING (deve essere vector, NON text) ──────────────

SELECT '=== 7. TIPO EMBEDDING ===' AS sezione;

SELECT
  column_name,
  data_type,
  udt_name,
  CASE
    WHEN udt_name = 'vector' THEN 'OK (vector)'
    WHEN data_type = 'text' THEN 'PROBLEMA — è text invece di vector(1024)'
    ELSE 'SCONOSCIUTO: ' || data_type
  END AS stato
FROM information_schema.columns
WHERE table_name = 'guideline_chunks' AND column_name = 'embedding';


-- ─── 8. RPC FUNCTION ───────────────────────────────────────────────────────

SELECT '=== 8. RPC FUNCTION ===' AS sezione;

SELECT
  routine_name,
  CASE WHEN routine_name IS NOT NULL THEN 'OK' ELSE 'MANCANTE' END AS stato
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'match_guideline_chunks';

-- Se vuoto, la funzione è MANCANTE


-- ─── 9. STORAGE BUCKETS ────────────────────────────────────────────────────

SELECT '=== 9. STORAGE BUCKETS ===' AS sezione;

SELECT
  id,
  name,
  public,
  CASE
    WHEN name = 'documents' AND public = false THEN 'OK'
    WHEN name = 'documents' AND public = true THEN 'PROBLEMA — deve essere privato'
    ELSE name || ' (non atteso)'
  END AS stato
FROM storage.buckets
ORDER BY name;


-- ─── 10. RLS STATUS ────────────────────────────────────────────────────────

SELECT '=== 10. ROW LEVEL SECURITY ===' AS sezione;

SELECT
  tablename,
  rowsecurity AS rls_attivo,
  CASE
    WHEN tablename IN ('cases','documents','events','pages','event_images',
                        'anomalies','missing_documents','reports','report_exports')
         AND rowsecurity = false
    THEN 'PROBLEMA — RLS disabilitato su tabella con dati sensibili'
    WHEN tablename IN ('guidelines','guideline_chunks','report_ratings','case_shares')
         AND rowsecurity = true
    THEN 'OK'
    WHEN tablename IN ('audit_log','profiles')
         AND rowsecurity = false
    THEN 'OK (accesso controllato a livello applicativo)'
    WHEN rowsecurity = true THEN 'OK'
    ELSE 'DA VERIFICARE'
  END AS stato
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Policies attive
SELECT '--- Policies attive ---' AS nota;
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ─── 11. STORAGE POLICIES ──────────────────────────────────────────────────

SELECT '=== 11. STORAGE POLICIES ===' AS sezione;

SELECT policyname, tablename, cmd
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;

-- Se vuoto: nessuna policy sullo storage!


-- ─── 12. FOREIGN KEYS ─────────────────────────────────────────────────────

SELECT '=== 12. FOREIGN KEYS ===' AS sezione;

SELECT
  tc.constraint_name,
  tc.table_name AS tabella,
  kcu.column_name AS colonna,
  ccu.table_name AS riferimento_tabella,
  ccu.column_name AS riferimento_colonna
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;


-- ─── 13. INDEXES ───────────────────────────────────────────────────────────

SELECT '=== 13. INDEXES ===' AS sezione;

SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname NOT LIKE '%pkey%'
ORDER BY tablename, indexname;


-- ============================================================================
-- FINE VERIFICA — Controlla i risultati sopra per trovare:
-- - Tabelle/colonne MANCANTI
-- - Enums MANCANTI o con valori mancanti
-- - pgvector MANCANTE
-- - embedding con tipo SBAGLIATO (text invece di vector)
-- - RPC function MANCANTE
-- - RLS DISABILITATO su tabelle sensibili
-- - Storage policies MANCANTI
-- ============================================================================
