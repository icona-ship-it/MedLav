-- Verify migration 0026_rls_user_owned applied correctly.
-- Run dopo aver applicato 0026 in Supabase SQL editor.
-- Expected: tutte le 5 query ritornano OK / counts attesi.

-- ============================================================================
-- Check 1: RLS abilitato sulle 13 tabelle target
-- ============================================================================

SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'OK: RLS on' ELSE 'FAIL: RLS off' END AS rls_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'cases', 'documents', 'pages', 'events', 'reports',
    'anomalies', 'missing_documents', 'event_images',
    'case_shares', 'report_ratings', 'profiles',
    'credit_transactions', 'audit_log'
  )
ORDER BY c.relname;

-- Atteso: 13 righe tutte con 'OK: RLS on'

-- ============================================================================
-- Check 2: numero di policy create per tabella (atteso >= specificato)
-- ============================================================================

SELECT
  tablename,
  COUNT(*) AS policy_count,
  string_agg(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'cases', 'documents', 'pages', 'events', 'reports',
    'anomalies', 'missing_documents', 'event_images',
    'case_shares', 'report_ratings', 'profiles',
    'credit_transactions', 'audit_log'
  )
GROUP BY tablename
ORDER BY tablename;

-- Atteso:
--   anomalies         : 4 policies (select/insert/update/delete)
--   audit_log         : 3 (select_own, no_update, no_delete)
--   case_shares       : 3 (select_own bidir, insert_own, delete_own)
--   cases             : 4
--   credit_transactions: 1 (select_own)
--   documents         : 4
--   event_images      : 3 (select/insert/delete — no update perche' record solo creati/distrutti)
--   events            : 4
--   missing_documents : 4
--   pages             : 4
--   profiles          : 2 (select_own, update_own)
--   report_ratings    : 4
--   reports           : 4

-- ============================================================================
-- Check 3: query simulata come utente A non vede dati di utente B
-- ============================================================================

-- Questo richiede 2 utenti test reali nel DB. Skip se non disponibili.
-- Eseguire questi check manualmente con due session diverse:
--
-- Session A (utente A, anon key):
--   SET LOCAL request.jwt.claims = '{"sub": "<UUID_USER_A>"}';
--   SELECT id, user_id FROM cases;  -- deve mostrare solo i casi di A
--
-- Session B (utente B, anon key):
--   SET LOCAL request.jwt.claims = '{"sub": "<UUID_USER_B>"}';
--   SELECT id, user_id FROM cases;  -- deve mostrare solo i casi di B (zero overlap con A)

-- ============================================================================
-- Check 4: service_role bypassa RLS (verifica che operazioni admin funzionino)
-- ============================================================================

-- Quando si esegue questo SQL come postgres role (Supabase SQL editor default),
-- service_role e' equivalente — RLS e' bypassata.
-- Quindi questa query DEVE ritornare tutti i casi del DB:

SELECT 'OK: service_role sees all (' || COUNT(*)::text || ' cases total)' AS check_service_role
FROM cases;

-- ============================================================================
-- Check 5: audit_log e' immutabile (UPDATE/DELETE bloccati per non-service)
-- ============================================================================

-- Verifica che le policy no_update/no_delete esistono
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log' AND policyname = 'audit_log_no_update'
  ) THEN 'OK: no_update policy attiva'
  ELSE 'FAIL: missing no_update policy'
  END AS check_audit_immutable_update,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log' AND policyname = 'audit_log_no_delete'
  ) THEN 'OK: no_delete policy attiva'
  ELSE 'FAIL: missing no_delete policy'
  END AS check_audit_immutable_delete;

-- ============================================================================
-- Output atteso totale: 13 RLS on + count policy per tabella + 2 check audit_log
-- Se anche UN solo FAIL: rollback immediato (DROP POLICY ... ON ... ; ALTER TABLE DISABLE RLS;)
-- ============================================================================
