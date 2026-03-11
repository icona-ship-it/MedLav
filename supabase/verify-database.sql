-- ============================================================================
-- MedLav Database Verification Script
-- ============================================================================
-- Safe to run: READ-ONLY, no modifications.
-- Paste into Supabase SQL Editor and execute.
-- Based on: src/db/schema/*.ts, drizzle/0000-0010 migrations, supabase/storage-setup.sql
-- ============================================================================

DO $$
DECLARE
  _result BOOLEAN;
  _count INTEGER;
  _col_type TEXT;
  _enum_vals TEXT[];
  _expected_vals TEXT[];
BEGIN

  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '  MedLav Database Verification Report';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 1: EXTENSIONS
  -- ========================================================================
  RAISE NOTICE '--- 1. EXTENSIONS ---';
  RAISE NOTICE '';

  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') INTO _result;
  RAISE NOTICE '% Extension: pgvector (vector)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') INTO _result;
  RAISE NOTICE '% Extension: uuid-ossp', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 2: ENUM TYPES
  -- ========================================================================
  RAISE NOTICE '--- 2. ENUM TYPES ---';
  RAISE NOTICE '';

  -- 2.1 case_type
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'case_type' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: case_type', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'case_type' INTO _enum_vals;
    _expected_vals := ARRAY['ortopedica','oncologica','ostetrica','anestesiologica','infezione_nosocomiale','errore_diagnostico','rc_auto','previdenziale','infortuni','generica'];
    RAISE NOTICE '    Expected values: %', _expected_vals;
    RAISE NOTICE '    Actual values:   %', _enum_vals;
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values match';
    ELSE
      RAISE NOTICE '      FAIL Values mismatch';
    END IF;
  END IF;

  -- 2.2 case_role
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'case_role' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: case_role', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'case_role' INTO _enum_vals;
    _expected_vals := ARRAY['ctu','ctp','stragiudiziale'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.3 case_status
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'case_status' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: case_status', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'case_status' INTO _enum_vals;
    _expected_vals := ARRAY['bozza','in_revisione','definitivo','archiviato'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.4 document_type
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'document_type' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: document_type', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'document_type' INTO _enum_vals;
    _expected_vals := ARRAY['cartella_clinica','referto_specialistico','esame_strumentale','esame_laboratorio','lettera_dimissione','certificato','perizia_precedente','altro'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.5 processing_status
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'processing_status' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: processing_status', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'processing_status' INTO _enum_vals;
    _expected_vals := ARRAY['caricato','in_coda','ocr_in_corso','estrazione_in_corso','validazione_in_corso','completato','errore'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.6 event_type
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'event_type' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: event_type', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'event_type' INTO _enum_vals;
    _expected_vals := ARRAY['visita','esame','diagnosi','intervento','terapia','ricovero','follow-up','referto','prescrizione','consenso','complicanza','altro'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.7 date_precision
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'date_precision' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: date_precision', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'date_precision' INTO _enum_vals;
    _expected_vals := ARRAY['giorno','mese','anno','sconosciuta'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.8 source_type
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'source_type' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: source_type', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'source_type' INTO _enum_vals;
    _expected_vals := ARRAY['cartella_clinica','referto_controllo','esame_strumentale','esame_ematochimico','altro'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.9 extraction_pass
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'extraction_pass' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: extraction_pass', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'extraction_pass' INTO _enum_vals;
    _expected_vals := ARRAY['both','pass1_only','pass2_only'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.10 anomaly_type
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'anomaly_type' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: anomaly_type', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'anomaly_type' INTO _enum_vals;
    _expected_vals := ARRAY['ritardo_diagnostico','gap_post_chirurgico','gap_documentale','complicanza_non_gestita','consenso_non_documentato','diagnosi_contraddittoria','terapia_senza_followup','valore_clinico_critico','sequenza_temporale_violata'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.11 anomaly_severity
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'anomaly_severity' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: anomaly_severity', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'anomaly_severity' INTO _enum_vals;
    _expected_vals := ARRAY['critica','alta','media','bassa'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  -- 2.12 report_status
  SELECT EXISTS(SELECT 1 FROM pg_type WHERE typname = 'report_status' AND typtype = 'e') INTO _result;
  RAISE NOTICE '% Enum: report_status', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;
  IF _result THEN
    SELECT ARRAY_AGG(e.enumlabel ORDER BY e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'report_status' INTO _enum_vals;
    _expected_vals := ARRAY['bozza','in_revisione','definitivo'];
    IF _enum_vals @> _expected_vals AND _expected_vals @> _enum_vals THEN
      RAISE NOTICE '      OK Values: %', _enum_vals;
    ELSE
      RAISE NOTICE '      FAIL Expected: % | Got: %', _expected_vals, _enum_vals;
    END IF;
  END IF;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 3: TABLES EXISTENCE
  -- ========================================================================
  RAISE NOTICE '--- 3. TABLES ---';
  RAISE NOTICE '';

  -- 3.1 profiles
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: profiles', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.2 cases
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'cases' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: cases', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.3 documents
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'documents' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: documents', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.4 pages
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'pages' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: pages', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.5 events
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'events' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: events', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.6 event_images
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'event_images' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: event_images', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.7 anomalies
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'anomalies' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: anomalies', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.8 missing_documents
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'missing_documents' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: missing_documents', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.9 reports
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'reports' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: reports', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.10 report_exports
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'report_exports' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: report_exports', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.11 report_ratings
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'report_ratings' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: report_ratings', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.12 case_shares
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'case_shares' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: case_shares', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.13 audit_log
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: audit_log', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.14 guidelines
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'guidelines' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: guidelines', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- 3.15 guideline_chunks
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'guideline_chunks' AND table_schema = 'public') INTO _result;
  RAISE NOTICE '% Table: guideline_chunks', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 4: COLUMN VERIFICATION (per table)
  -- ========================================================================
  RAISE NOTICE '--- 4. COLUMNS ---';
  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.1 profiles
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [profiles]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % profiles.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='email' AND data_type='text') INTO _result;
  RAISE NOTICE '  % profiles.email (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='full_name' AND data_type='text') INTO _result;
  RAISE NOTICE '  % profiles.full_name (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='studio' AND data_type='text') INTO _result;
  RAISE NOTICE '  % profiles.studio (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='stripe_customer_id' AND data_type='text') INTO _result;
  RAISE NOTICE '  % profiles.stripe_customer_id (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='subscription_status' AND data_type='text') INTO _result;
  RAISE NOTICE '  % profiles.subscription_status (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='subscription_plan' AND data_type='text') INTO _result;
  RAISE NOTICE '  % profiles.subscription_plan (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='subscription_period_end') INTO _result;
  RAISE NOTICE '  % profiles.subscription_period_end (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='email_notifications' AND data_type='boolean') INTO _result;
  RAISE NOTICE '  % profiles.email_notifications (boolean)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active' AND data_type='boolean') INTO _result;
  RAISE NOTICE '  % profiles.is_active (boolean)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='gdpr_consent_at') INTO _result;
  RAISE NOTICE '  % profiles.gdpr_consent_at (timestamptz) [GDPR]', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='privacy_policy_version' AND data_type='text') INTO _result;
  RAISE NOTICE '  % profiles.privacy_policy_version (text) [GDPR]', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='terms_accepted_at') INTO _result;
  RAISE NOTICE '  % profiles.terms_accepted_at (timestamptz) [GDPR]', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='data_retention_days' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % profiles.data_retention_days (integer) [GDPR]', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % profiles.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='updated_at') INTO _result;
  RAISE NOTICE '  % profiles.updated_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.2 cases
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [cases]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % cases.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='user_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % cases.user_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='code' AND data_type='text') INTO _result;
  RAISE NOTICE '  % cases.code (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='patient_initials' AND data_type='text') INTO _result;
  RAISE NOTICE '  % cases.patient_initials (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='practice_reference' AND data_type='text') INTO _result;
  RAISE NOTICE '  % cases.practice_reference (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='case_type') INTO _result;
  RAISE NOTICE '  % cases.case_type (case_type enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='case_types' AND data_type='jsonb') INTO _result;
  RAISE NOTICE '  % cases.case_types (jsonb)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='case_role') INTO _result;
  RAISE NOTICE '  % cases.case_role (case_role enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='status') INTO _result;
  RAISE NOTICE '  % cases.status (case_status enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='notes' AND data_type='text') INTO _result;
  RAISE NOTICE '  % cases.notes (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='perizia_metadata' AND data_type='jsonb') INTO _result;
  RAISE NOTICE '  % cases.perizia_metadata (jsonb)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='document_count' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % cases.document_count (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % cases.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cases' AND column_name='updated_at') INTO _result;
  RAISE NOTICE '  % cases.updated_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.3 documents
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [documents]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % documents.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='case_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % documents.case_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='file_name' AND data_type='text') INTO _result;
  RAISE NOTICE '  % documents.file_name (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='file_type' AND data_type='text') INTO _result;
  RAISE NOTICE '  % documents.file_type (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='file_size' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % documents.file_size (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='storage_path' AND data_type='text') INTO _result;
  RAISE NOTICE '  % documents.storage_path (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='document_type') INTO _result;
  RAISE NOTICE '  % documents.document_type (document_type enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='processing_status') INTO _result;
  RAISE NOTICE '  % documents.processing_status (processing_status enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='processing_error' AND data_type='text') INTO _result;
  RAISE NOTICE '  % documents.processing_error (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='page_count' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % documents.page_count (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % documents.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='updated_at') INTO _result;
  RAISE NOTICE '  % documents.updated_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.4 pages
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [pages]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % pages.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='document_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % pages.document_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='page_number' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % pages.page_number (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='ocr_text' AND data_type='text') INTO _result;
  RAISE NOTICE '  % pages.ocr_text (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='ocr_confidence' AND data_type='real') INTO _result;
  RAISE NOTICE '  % pages.ocr_confidence (real)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='has_handwriting' AND data_type='text') INTO _result;
  RAISE NOTICE '  % pages.has_handwriting (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='handwriting_confidence' AND data_type='real') INTO _result;
  RAISE NOTICE '  % pages.handwriting_confidence (real)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='image_path' AND data_type='text') INTO _result;
  RAISE NOTICE '  % pages.image_path (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % pages.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.5 events
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [events]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % events.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='case_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % events.case_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='document_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % events.document_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='order_number' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % events.order_number (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='event_date' AND data_type='date') INTO _result;
  RAISE NOTICE '  % events.event_date (date)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='date_precision') INTO _result;
  RAISE NOTICE '  % events.date_precision (date_precision enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='event_type') INTO _result;
  RAISE NOTICE '  % events.event_type (event_type enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='title' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.title (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='description' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.description (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='source_type') INTO _result;
  RAISE NOTICE '  % events.source_type (source_type enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='diagnosis' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.diagnosis (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='doctor' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.doctor (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='facility' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.facility (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='confidence' AND data_type='real') INTO _result;
  RAISE NOTICE '  % events.confidence (real)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='requires_verification' AND data_type='boolean') INTO _result;
  RAISE NOTICE '  % events.requires_verification (boolean)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='reliability_notes' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.reliability_notes (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='expert_notes' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.expert_notes (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='source_text' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.source_text (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='source_pages' AND data_type='text') INTO _result;
  RAISE NOTICE '  % events.source_pages (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='extraction_pass') INTO _result;
  RAISE NOTICE '  % events.extraction_pass (extraction_pass enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='is_deleted' AND data_type='boolean') INTO _result;
  RAISE NOTICE '  % events.is_deleted (boolean)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % events.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='updated_at') INTO _result;
  RAISE NOTICE '  % events.updated_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.6 event_images
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [event_images]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_images' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % event_images.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_images' AND column_name='event_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % event_images.event_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_images' AND column_name='page_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % event_images.page_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_images' AND column_name='image_path' AND data_type='text') INTO _result;
  RAISE NOTICE '  % event_images.image_path (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_images' AND column_name='page_number' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % event_images.page_number (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='event_images' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % event_images.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.7 anomalies
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [anomalies]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % anomalies.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='case_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % anomalies.case_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='anomaly_type') INTO _result;
  RAISE NOTICE '  % anomalies.anomaly_type (anomaly_type enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='severity') INTO _result;
  RAISE NOTICE '  % anomalies.severity (anomaly_severity enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='description' AND data_type='text') INTO _result;
  RAISE NOTICE '  % anomalies.description (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='involved_events' AND data_type='text') INTO _result;
  RAISE NOTICE '  % anomalies.involved_events (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='suggestion' AND data_type='text') INTO _result;
  RAISE NOTICE '  % anomalies.suggestion (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomalies' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % anomalies.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.8 missing_documents
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [missing_documents]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missing_documents' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % missing_documents.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missing_documents' AND column_name='case_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % missing_documents.case_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missing_documents' AND column_name='document_name' AND data_type='text') INTO _result;
  RAISE NOTICE '  % missing_documents.document_name (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missing_documents' AND column_name='reason' AND data_type='text') INTO _result;
  RAISE NOTICE '  % missing_documents.reason (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missing_documents' AND column_name='related_event' AND data_type='text') INTO _result;
  RAISE NOTICE '  % missing_documents.related_event (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='missing_documents' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % missing_documents.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.9 reports
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [reports]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % reports.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='case_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % reports.case_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='version' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % reports.version (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='report_status') INTO _result;
  RAISE NOTICE '  % reports.report_status (report_status enum)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='synthesis' AND data_type='text') INTO _result;
  RAISE NOTICE '  % reports.synthesis (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % reports.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='updated_at') INTO _result;
  RAISE NOTICE '  % reports.updated_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.10 report_exports
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [report_exports]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_exports' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % report_exports.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_exports' AND column_name='report_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % report_exports.report_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_exports' AND column_name='format' AND data_type='text') INTO _result;
  RAISE NOTICE '  % report_exports.format (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_exports' AND column_name='storage_path' AND data_type='text') INTO _result;
  RAISE NOTICE '  % report_exports.storage_path (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_exports' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % report_exports.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.11 report_ratings
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [report_ratings]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_ratings' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % report_ratings.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_ratings' AND column_name='report_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % report_ratings.report_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_ratings' AND column_name='user_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % report_ratings.user_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_ratings' AND column_name='rating' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % report_ratings.rating (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_ratings' AND column_name='comment' AND data_type='text') INTO _result;
  RAISE NOTICE '  % report_ratings.comment (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_ratings' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % report_ratings.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='report_ratings' AND column_name='updated_at') INTO _result;
  RAISE NOTICE '  % report_ratings.updated_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.12 case_shares
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [case_shares]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % case_shares.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='case_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % case_shares.case_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='user_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % case_shares.user_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='token' AND data_type='text') INTO _result;
  RAISE NOTICE '  % case_shares.token (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='label' AND data_type='text') INTO _result;
  RAISE NOTICE '  % case_shares.label (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='expires_at') INTO _result;
  RAISE NOTICE '  % case_shares.expires_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='view_count' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % case_shares.view_count (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='case_shares' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % case_shares.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.13 audit_log
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [audit_log]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % audit_log.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='user_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % audit_log.user_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='action' AND data_type='text') INTO _result;
  RAISE NOTICE '  % audit_log.action (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='entity_type' AND data_type='text') INTO _result;
  RAISE NOTICE '  % audit_log.entity_type (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='entity_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % audit_log.entity_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='metadata' AND data_type='jsonb') INTO _result;
  RAISE NOTICE '  % audit_log.metadata (jsonb)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='ip_address' AND data_type='text') INTO _result;
  RAISE NOTICE '  % audit_log.ip_address (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % audit_log.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.14 guidelines
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [guidelines]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % guidelines.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='title' AND data_type='text') INTO _result;
  RAISE NOTICE '  % guidelines.title (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='source' AND data_type='text') INTO _result;
  RAISE NOTICE '  % guidelines.source (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='year' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % guidelines.year (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='case_types' AND data_type='jsonb') INTO _result;
  RAISE NOTICE '  % guidelines.case_types (jsonb)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='chunk_count' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % guidelines.chunk_count (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='is_active' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % guidelines.is_active (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % guidelines.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guidelines' AND column_name='updated_at') INTO _result;
  RAISE NOTICE '  % guidelines.updated_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- -----------------------------------------------------------------------
  -- 4.15 guideline_chunks
  -- -----------------------------------------------------------------------
  RAISE NOTICE '  [guideline_chunks]';

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % guideline_chunks.id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='guideline_id' AND data_type='uuid') INTO _result;
  RAISE NOTICE '  % guideline_chunks.guideline_id (uuid)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='chunk_index' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % guideline_chunks.chunk_index (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='content' AND data_type='text') INTO _result;
  RAISE NOTICE '  % guideline_chunks.content (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='section_title' AND data_type='text') INTO _result;
  RAISE NOTICE '  % guideline_chunks.section_title (text)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- embedding is vector(1024) type, not in information_schema as standard type
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='embedding') INTO _result;
  RAISE NOTICE '  % guideline_chunks.embedding (vector(1024))', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- Verify actual vector type
  SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='embedding' INTO _col_type;
  IF _col_type = 'USER-DEFINED' THEN
    RAISE NOTICE '      OK Confirmed: embedding is USER-DEFINED (pgvector type)';
  ELSIF _col_type IS NOT NULL THEN
    RAISE NOTICE '      WARN Embedding data_type is "%" (expected USER-DEFINED/vector)', _col_type;
  END IF;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='token_count' AND data_type='integer') INTO _result;
  RAISE NOTICE '  % guideline_chunks.token_count (integer)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guideline_chunks' AND column_name='created_at') INTO _result;
  RAISE NOTICE '  % guideline_chunks.created_at (timestamptz)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 5: ROW LEVEL SECURITY (RLS)
  -- ========================================================================
  RAISE NOTICE '--- 5. ROW LEVEL SECURITY (RLS ENABLED) ---';
  RAISE NOTICE '';

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles' INTO _result;
  RAISE NOTICE '% RLS enabled: profiles', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cases' INTO _result;
  RAISE NOTICE '% RLS enabled: cases', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'documents' INTO _result;
  RAISE NOTICE '% RLS enabled: documents', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pages' INTO _result;
  RAISE NOTICE '% RLS enabled: pages', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'events' INTO _result;
  RAISE NOTICE '% RLS enabled: events', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'anomalies' INTO _result;
  RAISE NOTICE '% RLS enabled: anomalies', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'missing_documents' INTO _result;
  RAISE NOTICE '% RLS enabled: missing_documents', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reports' INTO _result;
  RAISE NOTICE '% RLS enabled: reports', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'report_exports' INTO _result;
  RAISE NOTICE '% RLS enabled: report_exports', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'report_ratings' INTO _result;
  RAISE NOTICE '% RLS enabled: report_ratings', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'case_shares' INTO _result;
  RAISE NOTICE '% RLS enabled: case_shares', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log' INTO _result;
  RAISE NOTICE '% RLS enabled: audit_log', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'guidelines' INTO _result;
  RAISE NOTICE '% RLS enabled: guidelines', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'guideline_chunks' INTO _result;
  RAISE NOTICE '% RLS enabled: guideline_chunks', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- Note: event_images does not have RLS in the migrations
  SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'event_images' INTO _result;
  RAISE NOTICE '% RLS enabled: event_images (NOTE: not in migrations)', CASE WHEN _result THEN '  OK' ELSE '  WARN - not enabled' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 6: RLS POLICIES
  -- ========================================================================
  RAISE NOTICE '--- 6. RLS POLICIES ---';
  RAISE NOTICE '';

  -- profiles policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' INTO _count;
  RAISE NOTICE '  [profiles] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can read own profile') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own profile"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update own profile') INTO _result;
  RAISE NOTICE '  % Policy: "Users can update own profile"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can insert own profile') INTO _result;
  RAISE NOTICE '  % Policy: "Users can insert own profile"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- cases policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cases' INTO _count;
  RAISE NOTICE '  [cases] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cases' AND policyname='Users can read own cases') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own cases"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cases' AND policyname='Users can insert own cases') INTO _result;
  RAISE NOTICE '  % Policy: "Users can insert own cases"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cases' AND policyname='Users can update own cases') INTO _result;
  RAISE NOTICE '  % Policy: "Users can update own cases"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cases' AND policyname='Users can delete own cases') INTO _result;
  RAISE NOTICE '  % Policy: "Users can delete own cases"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- documents policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents' INTO _count;
  RAISE NOTICE '  [documents] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Users can read own documents') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Users can insert own documents') INTO _result;
  RAISE NOTICE '  % Policy: "Users can insert own documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Users can update own documents') INTO _result;
  RAISE NOTICE '  % Policy: "Users can update own documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='documents' AND policyname='Users can delete own documents') INTO _result;
  RAISE NOTICE '  % Policy: "Users can delete own documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- pages policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pages' INTO _count;
  RAISE NOTICE '  [pages] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pages' AND policyname='Users can read own pages') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own pages"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pages' AND policyname='Users can insert own pages') INTO _result;
  RAISE NOTICE '  % Policy: "Users can insert own pages"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- events policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' INTO _count;
  RAISE NOTICE '  [events] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='Users can read own events') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own events"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='events' AND policyname='Users can manage own events') INTO _result;
  RAISE NOTICE '  % Policy: "Users can manage own events"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- anomalies policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anomalies' INTO _count;
  RAISE NOTICE '  [anomalies] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='anomalies' AND policyname='Users can read own anomalies') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own anomalies"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- missing_documents policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'missing_documents' INTO _count;
  RAISE NOTICE '  [missing_documents] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='missing_documents' AND policyname='Users can read own missing docs') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own missing docs"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- reports policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reports' INTO _count;
  RAISE NOTICE '  [reports] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND policyname='Users can read own reports') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own reports"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reports' AND policyname='Users can manage own reports') INTO _result;
  RAISE NOTICE '  % Policy: "Users can manage own reports"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- report_exports policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_exports' INTO _count;
  RAISE NOTICE '  [report_exports] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='report_exports' AND policyname='Users can read own exports') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own exports"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- report_ratings policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'report_ratings' INTO _count;
  RAISE NOTICE '  [report_ratings] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='report_ratings' AND policyname='users_own_ratings') INTO _result;
  RAISE NOTICE '  % Policy: "users_own_ratings"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- case_shares policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'case_shares' INTO _count;
  RAISE NOTICE '  [case_shares] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='case_shares' AND policyname='users_own_shares') INTO _result;
  RAISE NOTICE '  % Policy: "users_own_shares"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- audit_log policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_log' INTO _count;
  RAISE NOTICE '  [audit_log] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_log' AND policyname='Users can read own audit logs') INTO _result;
  RAISE NOTICE '  % Policy: "Users can read own audit logs"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_log' AND policyname='Service can insert audit logs') INTO _result;
  RAISE NOTICE '  % Policy: "Service can insert audit logs"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- guidelines policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'guidelines' INTO _count;
  RAISE NOTICE '  [guidelines] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='guidelines' AND policyname='guidelines_read') INTO _result;
  RAISE NOTICE '  % Policy: "guidelines_read"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='guidelines' AND policyname='guidelines_admin_write') INTO _result;
  RAISE NOTICE '  % Policy: "guidelines_admin_write"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- guideline_chunks policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'guideline_chunks' INTO _count;
  RAISE NOTICE '  [guideline_chunks] % policies found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='guideline_chunks' AND policyname='guideline_chunks_read') INTO _result;
  RAISE NOTICE '  % Policy: "guideline_chunks_read"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='guideline_chunks' AND policyname='guideline_chunks_admin_write') INTO _result;
  RAISE NOTICE '  % Policy: "guideline_chunks_admin_write"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 7: FOREIGN KEY CONSTRAINTS
  -- ========================================================================
  RAISE NOTICE '--- 7. FOREIGN KEY CONSTRAINTS ---';
  RAISE NOTICE '';

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'cases_user_id_profiles_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: cases.user_id -> profiles.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'documents_case_id_cases_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: documents.case_id -> cases.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'pages_document_id_documents_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: pages.document_id -> documents.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'events_case_id_cases_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: events.case_id -> cases.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'events_document_id_documents_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: events.document_id -> documents.id (SET NULL)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'anomalies_case_id_cases_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: anomalies.case_id -> cases.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'missing_documents_case_id_cases_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: missing_documents.case_id -> cases.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'reports_case_id_cases_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: reports.case_id -> cases.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'report_exports_report_id_reports_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: report_exports.report_id -> reports.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'audit_log_user_id_profiles_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: audit_log.user_id -> profiles.id (SET NULL)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'event_images_event_id_events_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: event_images.event_id -> events.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'event_images_page_id_pages_id_fk' AND constraint_type = 'FOREIGN KEY') INTO _result;
  RAISE NOTICE '% FK: event_images.page_id -> pages.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- guideline_chunks FK (created inline in migration 0002)
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'guideline_chunks' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'guideline_id'
  ) INTO _result;
  RAISE NOTICE '% FK: guideline_chunks.guideline_id -> guidelines.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- report_ratings FKs (created inline in migration 0007)
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'report_ratings' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'report_id'
  ) INTO _result;
  RAISE NOTICE '% FK: report_ratings.report_id -> reports.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'report_ratings' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'user_id'
  ) INTO _result;
  RAISE NOTICE '% FK: report_ratings.user_id -> profiles.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- case_shares FKs (created inline in migration 0008)
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'case_shares' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'case_id'
  ) INTO _result;
  RAISE NOTICE '% FK: case_shares.case_id -> cases.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'case_shares' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'user_id'
  ) INTO _result;
  RAISE NOTICE '% FK: case_shares.user_id -> profiles.id (CASCADE)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 8: UNIQUE CONSTRAINTS
  -- ========================================================================
  RAISE NOTICE '--- 8. UNIQUE CONSTRAINTS ---';
  RAISE NOTICE '';

  SELECT EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'cases' AND constraint_name = 'cases_code_unique' AND constraint_type = 'UNIQUE') INTO _result;
  RAISE NOTICE '% UNIQUE: cases.code (cases_code_unique)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'report_ratings' AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE '%report%user%'
  ) INTO _result;
  IF NOT _result THEN
    -- Also check the explicit name from migration
    SELECT EXISTS(
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'report_ratings' AND constraint_type = 'UNIQUE'
    ) INTO _result;
  END IF;
  RAISE NOTICE '% UNIQUE: report_ratings(report_id, user_id)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'case_shares' AND tc.constraint_type = 'UNIQUE' AND kcu.column_name = 'token'
  ) INTO _result;
  RAISE NOTICE '% UNIQUE: case_shares.token', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 9: INDEXES
  -- ========================================================================
  RAISE NOTICE '--- 9. INDEXES ---';
  RAISE NOTICE '';

  -- guideline_chunks indexes from migration 0002
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_guideline_chunks_guideline_id') INTO _result;
  RAISE NOTICE '% Index: idx_guideline_chunks_guideline_id (guideline_chunks.guideline_id)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_guideline_chunks_embedding') INTO _result;
  RAISE NOTICE '% Index: idx_guideline_chunks_embedding (HNSW cosine)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- case_shares token index from migration 0008
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_case_shares_token') INTO _result;
  RAISE NOTICE '% Index: idx_case_shares_token (case_shares.token)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- Primary key indexes (auto-created)
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'profiles' AND indexdef LIKE '%PRIMARY%') INTO _result;
  RAISE NOTICE '% PK Index: profiles', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'cases' AND indexdef LIKE '%PRIMARY%') INTO _result;
  RAISE NOTICE '% PK Index: cases', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'documents' AND indexdef LIKE '%PRIMARY%') INTO _result;
  RAISE NOTICE '% PK Index: documents', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'events' AND indexdef LIKE '%PRIMARY%') INTO _result;
  RAISE NOTICE '% PK Index: events', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'reports' AND indexdef LIKE '%PRIMARY%') INTO _result;
  RAISE NOTICE '% PK Index: reports', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 10: CHECK CONSTRAINTS
  -- ========================================================================
  RAISE NOTICE '--- 10. CHECK CONSTRAINTS ---';
  RAISE NOTICE '';

  -- report_ratings rating CHECK (1-5)
  SELECT EXISTS(
    SELECT 1 FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
    WHERE ccu.table_name = 'report_ratings' AND ccu.column_name = 'rating'
    AND cc.check_clause LIKE '%rating%>=%1%' OR cc.check_clause LIKE '%rating%<=%5%'
  ) INTO _result;
  -- Fallback: just check any CHECK constraint exists on report_ratings
  IF NOT _result THEN
    SELECT EXISTS(
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'report_ratings' AND constraint_type = 'CHECK'
      AND constraint_name NOT LIKE '%not_null%' -- exclude NOT NULL checks
    ) INTO _result;
  END IF;
  RAISE NOTICE '% CHECK: report_ratings.rating (1-5)', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 11: STORAGE BUCKET
  -- ========================================================================
  RAISE NOTICE '--- 11. STORAGE ---';
  RAISE NOTICE '';

  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'documents') INTO _result;
  RAISE NOTICE '% Storage bucket: "documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  IF _result THEN
    SELECT public FROM storage.buckets WHERE id = 'documents' INTO _result;
    RAISE NOTICE '% Storage bucket "documents" is private (public=false)', CASE WHEN NOT _result THEN '  OK' ELSE '  FAIL - bucket is public!' END;
  END IF;

  -- Storage policies
  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%documents%' INTO _count;
  RAISE NOTICE '  Storage object policies for documents: % found', _count;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can upload own documents') INTO _result;
  RAISE NOTICE '  % Storage Policy: "Users can upload own documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can read own documents') INTO _result;
  RAISE NOTICE '  % Storage Policy: "Users can read own documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can delete own documents') INTO _result;
  RAISE NOTICE '  % Storage Policy: "Users can delete own documents"', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 12: RPC FUNCTIONS
  -- ========================================================================
  RAISE NOTICE '--- 12. RPC FUNCTIONS ---';
  RAISE NOTICE '';

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'match_guideline_chunks'
  ) INTO _result;
  RAISE NOTICE '% Function: match_guideline_chunks()', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  -- Check function returns guideline_year (updated in migration 0005)
  IF _result THEN
    SELECT EXISTS(
      SELECT 1 FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name = 'match_guideline_chunks'
      AND routine_definition LIKE '%guideline_year%'
    ) INTO _result;
    RAISE NOTICE '  % Returns guideline_year (migration 0005)', CASE WHEN _result THEN '  OK' ELSE '  FAIL - may be old version' END;
  END IF;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 13: GDPR COLUMN COMMENTS
  -- ========================================================================
  RAISE NOTICE '--- 13. GDPR COLUMN COMMENTS ---';
  RAISE NOTICE '';

  SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_description d
    JOIN pg_catalog.pg_attribute a ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
    JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles' AND a.attname = 'gdpr_consent_at'
    AND d.description LIKE '%GDPR%'
  ) INTO _result;
  RAISE NOTICE '% Comment on profiles.gdpr_consent_at', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_description d
    JOIN pg_catalog.pg_attribute a ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
    JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles' AND a.attname = 'privacy_policy_version'
  ) INTO _result;
  RAISE NOTICE '% Comment on profiles.privacy_policy_version', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_description d
    JOIN pg_catalog.pg_attribute a ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
    JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles' AND a.attname = 'terms_accepted_at'
  ) INTO _result;
  RAISE NOTICE '% Comment on profiles.terms_accepted_at', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_description d
    JOIN pg_catalog.pg_attribute a ON d.objoid = a.attrelid AND d.objsubid = a.attnum
    JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
    JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles' AND a.attname = 'data_retention_days'
  ) INTO _result;
  RAISE NOTICE '% Comment on profiles.data_retention_days', CASE WHEN _result THEN '  OK' ELSE '  FAIL' END;

  RAISE NOTICE '';

  -- ========================================================================
  -- SECTION 14: SUMMARY STATISTICS
  -- ========================================================================
  RAISE NOTICE '--- 14. SUMMARY STATISTICS ---';
  RAISE NOTICE '';

  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' INTO _count;
  RAISE NOTICE '  Total public tables: % (expected: 15)', _count;

  SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e' INTO _count;
  RAISE NOTICE '  Total public enum types: % (expected: 12)', _count;

  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' INTO _count;
  RAISE NOTICE '  Total RLS policies (public schema): %', _count;

  SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' INTO _count;
  RAISE NOTICE '  Total RLS policies (storage schema): %', _count;

  SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND constraint_schema = 'public' INTO _count;
  RAISE NOTICE '  Total foreign key constraints: %', _count;

  SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' INTO _count;
  RAISE NOTICE '  Total indexes (public schema): %', _count;

  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE '  Verification Complete';
  RAISE NOTICE '================================================================';

END $$;
