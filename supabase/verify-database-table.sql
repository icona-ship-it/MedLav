-- ============================================================================
-- MedLav Database Verification Script (TABLE OUTPUT version)
-- ============================================================================
-- Returns results as a table, not RAISE NOTICE.
-- Paste into Supabase SQL Editor and execute.
-- ============================================================================

WITH checks AS (
  -- === EXTENSIONS ===
  SELECT 1 as ord, 'Extension' as category, 'pgvector' as item,
    EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as ok
  UNION ALL
  SELECT 2, 'Extension', 'uuid-ossp',
    EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp')

  -- === TABLES ===
  UNION ALL SELECT 10, 'Table', 'profiles', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles')
  UNION ALL SELECT 11, 'Table', 'cases', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cases')
  UNION ALL SELECT 12, 'Table', 'documents', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='documents')
  UNION ALL SELECT 13, 'Table', 'pages', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pages')
  UNION ALL SELECT 14, 'Table', 'events', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='events')
  UNION ALL SELECT 15, 'Table', 'event_images', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='event_images')
  UNION ALL SELECT 16, 'Table', 'anomalies', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anomalies')
  UNION ALL SELECT 17, 'Table', 'missing_documents', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='missing_documents')
  UNION ALL SELECT 18, 'Table', 'reports', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reports')
  UNION ALL SELECT 19, 'Table', 'report_ratings', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='report_ratings')
  UNION ALL SELECT 20, 'Table', 'case_shares', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='case_shares')
  UNION ALL SELECT 21, 'Table', 'audit_log', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_log')
  UNION ALL SELECT 22, 'Table', 'guidelines', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guidelines')
  UNION ALL SELECT 23, 'Table', 'guideline_chunks', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='guideline_chunks')
  UNION ALL SELECT 24, 'Table', 'report_exports', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='report_exports')

  -- === ENUM TYPES ===
  UNION ALL SELECT 30, 'Enum', 'case_type', EXISTS(SELECT 1 FROM pg_type WHERE typname='case_type')
  UNION ALL SELECT 31, 'Enum', 'case_role', EXISTS(SELECT 1 FROM pg_type WHERE typname='case_role')
  UNION ALL SELECT 32, 'Enum', 'case_status', EXISTS(SELECT 1 FROM pg_type WHERE typname='case_status')
  UNION ALL SELECT 33, 'Enum', 'document_type', EXISTS(SELECT 1 FROM pg_type WHERE typname='document_type')
  UNION ALL SELECT 34, 'Enum', 'processing_status', EXISTS(SELECT 1 FROM pg_type WHERE typname='processing_status')
  UNION ALL SELECT 35, 'Enum', 'event_type', EXISTS(SELECT 1 FROM pg_type WHERE typname='event_type')
  UNION ALL SELECT 36, 'Enum', 'date_precision', EXISTS(SELECT 1 FROM pg_type WHERE typname='date_precision')
  UNION ALL SELECT 37, 'Enum', 'source_type', EXISTS(SELECT 1 FROM pg_type WHERE typname='source_type')
  UNION ALL SELECT 38, 'Enum', 'anomaly_type', EXISTS(SELECT 1 FROM pg_type WHERE typname='anomaly_type')
  UNION ALL SELECT 39, 'Enum', 'anomaly_severity', EXISTS(SELECT 1 FROM pg_type WHERE typname='anomaly_severity')
  UNION ALL SELECT 40, 'Enum', 'report_status', EXISTS(SELECT 1 FROM pg_type WHERE typname='report_status')
  UNION ALL SELECT 41, 'Enum', 'extraction_pass', EXISTS(SELECT 1 FROM pg_type WHERE typname='extraction_pass')

  -- === KEY COLUMNS (profiles - GDPR + Stripe) ===
  UNION ALL SELECT 50, 'Column', 'profiles.gdpr_consent_at', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='gdpr_consent_at')
  UNION ALL SELECT 51, 'Column', 'profiles.privacy_policy_version', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='privacy_policy_version')
  UNION ALL SELECT 52, 'Column', 'profiles.terms_accepted_at', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='terms_accepted_at')
  UNION ALL SELECT 53, 'Column', 'profiles.data_retention_days', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='data_retention_days')
  UNION ALL SELECT 54, 'Column', 'profiles.stripe_customer_id', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='stripe_customer_id')
  UNION ALL SELECT 55, 'Column', 'profiles.subscription_status', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='subscription_status')
  UNION ALL SELECT 56, 'Column', 'profiles.subscription_plan', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='subscription_plan')
  UNION ALL SELECT 57, 'Column', 'profiles.email_notifications', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='email_notifications')
  UNION ALL SELECT 58, 'Column', 'profiles.is_active', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_active')

  -- === KEY COLUMNS (cases) ===
  UNION ALL SELECT 60, 'Column', 'cases.case_types (jsonb)', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='case_types')
  UNION ALL SELECT 61, 'Column', 'cases.perizia_metadata (jsonb)', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='cases' AND column_name='perizia_metadata')

  -- === KEY COLUMNS (events - extraction fields) ===
  UNION ALL SELECT 62, 'Column', 'events.source_text', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='source_text')
  UNION ALL SELECT 63, 'Column', 'events.source_pages', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='source_pages')
  UNION ALL SELECT 64, 'Column', 'events.extraction_pass', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='extraction_pass')

  -- === KEY COLUMNS (guideline_chunks - embedding) ===
  UNION ALL SELECT 65, 'Column', 'guideline_chunks.embedding (vector)', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='guideline_chunks' AND column_name='embedding')

  -- === RLS ENABLED ===
  UNION ALL SELECT 70, 'RLS', 'profiles', (SELECT relrowsecurity FROM pg_class WHERE relname='profiles' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 71, 'RLS', 'cases', (SELECT relrowsecurity FROM pg_class WHERE relname='cases' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 72, 'RLS', 'documents', (SELECT relrowsecurity FROM pg_class WHERE relname='documents' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 73, 'RLS', 'pages', (SELECT relrowsecurity FROM pg_class WHERE relname='pages' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 74, 'RLS', 'events', (SELECT relrowsecurity FROM pg_class WHERE relname='events' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 75, 'RLS', 'anomalies', (SELECT relrowsecurity FROM pg_class WHERE relname='anomalies' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 76, 'RLS', 'reports', (SELECT relrowsecurity FROM pg_class WHERE relname='reports' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 77, 'RLS', 'audit_log', (SELECT relrowsecurity FROM pg_class WHERE relname='audit_log' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 78, 'RLS', 'guidelines', (SELECT relrowsecurity FROM pg_class WHERE relname='guidelines' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 79, 'RLS', 'guideline_chunks', (SELECT relrowsecurity FROM pg_class WHERE relname='guideline_chunks' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 80, 'RLS', 'report_ratings', (SELECT relrowsecurity FROM pg_class WHERE relname='report_ratings' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
  UNION ALL SELECT 81, 'RLS', 'case_shares', (SELECT relrowsecurity FROM pg_class WHERE relname='case_shares' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))

  -- === STORAGE ===
  UNION ALL SELECT 90, 'Storage', 'documents bucket', EXISTS(SELECT 1 FROM storage.buckets WHERE id='documents')
  UNION ALL SELECT 91, 'Storage', 'documents bucket is private', EXISTS(SELECT 1 FROM storage.buckets WHERE id='documents' AND public=false)

  -- === RPC FUNCTIONS ===
  UNION ALL SELECT 95, 'Function', 'match_guideline_chunks', EXISTS(SELECT 1 FROM pg_proc WHERE proname='match_guideline_chunks')

  -- === FOREIGN KEYS (spot check key ones) ===
  UNION ALL SELECT 100, 'FK', 'cases.user_id → profiles', EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='cases' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='user_id'
  )
  UNION ALL SELECT 101, 'FK', 'documents.case_id → cases', EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='documents' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='case_id'
  )
  UNION ALL SELECT 102, 'FK', 'events.case_id → cases', EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='events' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='case_id'
  )
  UNION ALL SELECT 103, 'FK', 'reports.case_id → cases', EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='reports' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='case_id'
  )
  UNION ALL SELECT 104, 'FK', 'audit_log.user_id → profiles', EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='audit_log' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='user_id'
  )

  -- === UNIQUE CONSTRAINTS ===
  UNION ALL SELECT 110, 'Unique', 'cases.code', EXISTS(
    SELECT 1 FROM information_schema.table_constraints WHERE table_name='cases' AND constraint_type='UNIQUE'
  )
  UNION ALL SELECT 111, 'Unique', 'case_shares.token', EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='case_shares' AND tc.constraint_type='UNIQUE' AND kcu.column_name='token'
  )
)
SELECT
  CASE WHEN ok THEN '✅' ELSE '❌' END as status,
  category,
  item
FROM checks
ORDER BY ord;
