-- Verify migration 0027_audit_archive applied correctly.
-- Run this in Supabase SQL editor after applying 0027_audit_archive.sql.
-- Expected: all 7 checks return 'OK'.

-- ============================================================================

-- 1. Table esiste
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_archive'
  ) THEN 'OK: audit_archive table exists'
       ELSE 'FAIL: audit_archive missing'
  END AS check_1_table;

-- 2. user_id NOT NULL
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_archive' AND column_name = 'user_id' AND is_nullable = 'NO'
  ) THEN 'OK: user_id NOT NULL'
       ELSE 'FAIL: user_id is nullable'
  END AS check_2_user_id_required;

-- 3. NO foreign key constraint su user_id (by design — sopravvive a profile delete)
SELECT
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_name)
    WHERE tc.table_name = 'audit_archive'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'user_id'
  ) THEN 'OK: no FK on user_id (audit survives user delete)'
       ELSE 'FAIL: user_id has FK constraint, will cascade on delete'
  END AS check_3_no_fk;

-- 4. RLS enabled
SELECT
  CASE WHEN (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.audit_archive'::regclass
  ) THEN 'OK: RLS enabled'
       ELSE 'FAIL: RLS not enabled'
  END AS check_4_rls;

-- 5. 3 policy esistono (no_read, no_update, no_delete)
SELECT
  CASE WHEN (
    SELECT COUNT(*) FROM pg_policies WHERE tablename = 'audit_archive'
  ) >= 3 THEN 'OK: ' || (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'audit_archive')::text || ' policies'
            ELSE 'FAIL: missing policies on audit_archive'
  END AS check_5_policies;

-- 6. Indici presenti (3 attesi: user_id, created_at, action)
SELECT
  CASE WHEN (
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'audit_archive'
      AND indexname IN ('idx_audit_archive_user_id', 'idx_audit_archive_created_at', 'idx_audit_archive_action')
  ) = 3 THEN 'OK: 3 indices present'
        ELSE 'FAIL: missing indices, found: ' || (
          SELECT string_agg(indexname, ', ')
          FROM pg_indexes WHERE tablename = 'audit_archive'
        )
  END AS check_6_indices;

-- 7. Test INSERT (via service_role bypassa RLS — questo conferma policy non blocca service)
-- NOTA: lanciare questo in SQL editor che gira come postgres role.
INSERT INTO audit_archive (user_id, action, entity_type, metadata)
VALUES (gen_random_uuid(), 'test.migration_verify', 'test', '{"check": 7}'::jsonb);

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM audit_archive WHERE action = 'test.migration_verify'
  ) THEN 'OK: INSERT works via service_role'
       ELSE 'FAIL: INSERT failed'
  END AS check_7_insert;

-- Cleanup test record
DELETE FROM audit_archive WHERE action = 'test.migration_verify';

-- ============================================================================
-- Expected output: 7 rows, tutti con 'OK: ...'
-- ============================================================================
