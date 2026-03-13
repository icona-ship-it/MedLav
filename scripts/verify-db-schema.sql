-- =============================================================================
-- MedLav — Verifica completa schema DB
-- Eseguire nell'SQL Editor di Supabase
-- Output: una riga per ogni check con OK / MISSING
-- =============================================================================

-- Risultati in una tabella temporanea
CREATE TEMP TABLE _check_results (
  category TEXT,
  item TEXT,
  status TEXT -- 'OK' o 'MISSING'
);

-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================
INSERT INTO _check_results
SELECT 'extension', 'vector (pgvector)',
  CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN 'OK' ELSE 'MISSING' END;

-- =============================================================================
-- 2. ENUMS — verifica ogni enum e tutti i suoi valori attesi
-- =============================================================================

-- Helper: controlla se un valore enum esiste
CREATE OR REPLACE FUNCTION _check_enum_value(enum_name TEXT, enum_value TEXT) RETURNS TEXT AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = enum_name AND e.enumlabel = enum_value
  ) THEN RETURN 'OK';
  ELSE RETURN 'MISSING';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- case_type
INSERT INTO _check_results VALUES
  ('enum:case_type', 'ortopedica', _check_enum_value('case_type', 'ortopedica')),
  ('enum:case_type', 'oncologica', _check_enum_value('case_type', 'oncologica')),
  ('enum:case_type', 'ostetrica', _check_enum_value('case_type', 'ostetrica')),
  ('enum:case_type', 'anestesiologica', _check_enum_value('case_type', 'anestesiologica')),
  ('enum:case_type', 'infezione_nosocomiale', _check_enum_value('case_type', 'infezione_nosocomiale')),
  ('enum:case_type', 'errore_diagnostico', _check_enum_value('case_type', 'errore_diagnostico')),
  ('enum:case_type', 'rc_auto', _check_enum_value('case_type', 'rc_auto')),
  ('enum:case_type', 'previdenziale', _check_enum_value('case_type', 'previdenziale')),
  ('enum:case_type', 'infortuni', _check_enum_value('case_type', 'infortuni')),
  ('enum:case_type', 'perizia_assicurativa', _check_enum_value('case_type', 'perizia_assicurativa')),
  ('enum:case_type', 'analisi_spese_mediche', _check_enum_value('case_type', 'analisi_spese_mediche')),
  ('enum:case_type', 'opinione_prognostica', _check_enum_value('case_type', 'opinione_prognostica')),
  ('enum:case_type', 'generica', _check_enum_value('case_type', 'generica'));

-- case_role
INSERT INTO _check_results VALUES
  ('enum:case_role', 'ctu', _check_enum_value('case_role', 'ctu')),
  ('enum:case_role', 'ctp', _check_enum_value('case_role', 'ctp')),
  ('enum:case_role', 'stragiudiziale', _check_enum_value('case_role', 'stragiudiziale'));

-- case_status
INSERT INTO _check_results VALUES
  ('enum:case_status', 'bozza', _check_enum_value('case_status', 'bozza')),
  ('enum:case_status', 'in_revisione', _check_enum_value('case_status', 'in_revisione')),
  ('enum:case_status', 'definitivo', _check_enum_value('case_status', 'definitivo')),
  ('enum:case_status', 'archiviato', _check_enum_value('case_status', 'archiviato'));

-- document_type
INSERT INTO _check_results VALUES
  ('enum:document_type', 'cartella_clinica', _check_enum_value('document_type', 'cartella_clinica')),
  ('enum:document_type', 'referto_specialistico', _check_enum_value('document_type', 'referto_specialistico')),
  ('enum:document_type', 'esame_strumentale', _check_enum_value('document_type', 'esame_strumentale')),
  ('enum:document_type', 'esame_laboratorio', _check_enum_value('document_type', 'esame_laboratorio')),
  ('enum:document_type', 'lettera_dimissione', _check_enum_value('document_type', 'lettera_dimissione')),
  ('enum:document_type', 'certificato', _check_enum_value('document_type', 'certificato')),
  ('enum:document_type', 'perizia_precedente', _check_enum_value('document_type', 'perizia_precedente')),
  ('enum:document_type', 'spese_mediche', _check_enum_value('document_type', 'spese_mediche')),
  ('enum:document_type', 'memoria_difensiva', _check_enum_value('document_type', 'memoria_difensiva')),
  ('enum:document_type', 'perizia_ctp', _check_enum_value('document_type', 'perizia_ctp')),
  ('enum:document_type', 'perizia_ctu', _check_enum_value('document_type', 'perizia_ctu')),
  ('enum:document_type', 'altro', _check_enum_value('document_type', 'altro'));

-- processing_status
INSERT INTO _check_results VALUES
  ('enum:processing_status', 'caricato', _check_enum_value('processing_status', 'caricato')),
  ('enum:processing_status', 'in_coda', _check_enum_value('processing_status', 'in_coda')),
  ('enum:processing_status', 'ocr_in_corso', _check_enum_value('processing_status', 'ocr_in_corso')),
  ('enum:processing_status', 'classificazione_completata', _check_enum_value('processing_status', 'classificazione_completata')),
  ('enum:processing_status', 'estrazione_in_corso', _check_enum_value('processing_status', 'estrazione_in_corso')),
  ('enum:processing_status', 'validazione_in_corso', _check_enum_value('processing_status', 'validazione_in_corso')),
  ('enum:processing_status', 'completato', _check_enum_value('processing_status', 'completato')),
  ('enum:processing_status', 'errore', _check_enum_value('processing_status', 'errore'));

-- event_type
INSERT INTO _check_results VALUES
  ('enum:event_type', 'visita', _check_enum_value('event_type', 'visita')),
  ('enum:event_type', 'esame', _check_enum_value('event_type', 'esame')),
  ('enum:event_type', 'diagnosi', _check_enum_value('event_type', 'diagnosi')),
  ('enum:event_type', 'intervento', _check_enum_value('event_type', 'intervento')),
  ('enum:event_type', 'terapia', _check_enum_value('event_type', 'terapia')),
  ('enum:event_type', 'ricovero', _check_enum_value('event_type', 'ricovero')),
  ('enum:event_type', 'follow-up', _check_enum_value('event_type', 'follow-up')),
  ('enum:event_type', 'referto', _check_enum_value('event_type', 'referto')),
  ('enum:event_type', 'prescrizione', _check_enum_value('event_type', 'prescrizione')),
  ('enum:event_type', 'consenso', _check_enum_value('event_type', 'consenso')),
  ('enum:event_type', 'complicanza', _check_enum_value('event_type', 'complicanza')),
  ('enum:event_type', 'spesa_medica', _check_enum_value('event_type', 'spesa_medica')),
  ('enum:event_type', 'documento_amministrativo', _check_enum_value('event_type', 'documento_amministrativo')),
  ('enum:event_type', 'certificato', _check_enum_value('event_type', 'certificato')),
  ('enum:event_type', 'altro', _check_enum_value('event_type', 'altro'));

-- date_precision
INSERT INTO _check_results VALUES
  ('enum:date_precision', 'giorno', _check_enum_value('date_precision', 'giorno')),
  ('enum:date_precision', 'mese', _check_enum_value('date_precision', 'mese')),
  ('enum:date_precision', 'anno', _check_enum_value('date_precision', 'anno')),
  ('enum:date_precision', 'sconosciuta', _check_enum_value('date_precision', 'sconosciuta'));

-- source_type
INSERT INTO _check_results VALUES
  ('enum:source_type', 'cartella_clinica', _check_enum_value('source_type', 'cartella_clinica')),
  ('enum:source_type', 'referto_controllo', _check_enum_value('source_type', 'referto_controllo')),
  ('enum:source_type', 'esame_strumentale', _check_enum_value('source_type', 'esame_strumentale')),
  ('enum:source_type', 'esame_ematochimico', _check_enum_value('source_type', 'esame_ematochimico')),
  ('enum:source_type', 'altro', _check_enum_value('source_type', 'altro'));

-- extraction_pass
INSERT INTO _check_results VALUES
  ('enum:extraction_pass', 'both', _check_enum_value('extraction_pass', 'both')),
  ('enum:extraction_pass', 'pass1_only', _check_enum_value('extraction_pass', 'pass1_only')),
  ('enum:extraction_pass', 'pass2_only', _check_enum_value('extraction_pass', 'pass2_only')),
  ('enum:extraction_pass', 'retry', _check_enum_value('extraction_pass', 'retry'));

-- anomaly_type
INSERT INTO _check_results VALUES
  ('enum:anomaly_type', 'ritardo_diagnostico', _check_enum_value('anomaly_type', 'ritardo_diagnostico')),
  ('enum:anomaly_type', 'gap_post_chirurgico', _check_enum_value('anomaly_type', 'gap_post_chirurgico')),
  ('enum:anomaly_type', 'gap_documentale', _check_enum_value('anomaly_type', 'gap_documentale')),
  ('enum:anomaly_type', 'complicanza_non_gestita', _check_enum_value('anomaly_type', 'complicanza_non_gestita')),
  ('enum:anomaly_type', 'consenso_non_documentato', _check_enum_value('anomaly_type', 'consenso_non_documentato')),
  ('enum:anomaly_type', 'diagnosi_contraddittoria', _check_enum_value('anomaly_type', 'diagnosi_contraddittoria')),
  ('enum:anomaly_type', 'terapia_senza_followup', _check_enum_value('anomaly_type', 'terapia_senza_followup')),
  ('enum:anomaly_type', 'valore_clinico_critico', _check_enum_value('anomaly_type', 'valore_clinico_critico')),
  ('enum:anomaly_type', 'sequenza_temporale_violata', _check_enum_value('anomaly_type', 'sequenza_temporale_violata'));

-- anomaly_severity
INSERT INTO _check_results VALUES
  ('enum:anomaly_severity', 'critica', _check_enum_value('anomaly_severity', 'critica')),
  ('enum:anomaly_severity', 'alta', _check_enum_value('anomaly_severity', 'alta')),
  ('enum:anomaly_severity', 'media', _check_enum_value('anomaly_severity', 'media')),
  ('enum:anomaly_severity', 'bassa', _check_enum_value('anomaly_severity', 'bassa'));

-- report_status
INSERT INTO _check_results VALUES
  ('enum:report_status', 'bozza', _check_enum_value('report_status', 'bozza')),
  ('enum:report_status', 'in_revisione', _check_enum_value('report_status', 'in_revisione')),
  ('enum:report_status', 'definitivo', _check_enum_value('report_status', 'definitivo'));

-- =============================================================================
-- 3. TABLES + COLUMNS — verifica che ogni tabella abbia le colonne attese
-- =============================================================================

CREATE OR REPLACE FUNCTION _check_column(tbl TEXT, col TEXT) RETURNS TEXT AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
  ) THEN RETURN 'OK';
  ELSE RETURN 'MISSING';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- profiles (16 columns)
INSERT INTO _check_results VALUES
  ('table:profiles', 'id', _check_column('profiles', 'id')),
  ('table:profiles', 'email', _check_column('profiles', 'email')),
  ('table:profiles', 'full_name', _check_column('profiles', 'full_name')),
  ('table:profiles', 'studio', _check_column('profiles', 'studio')),
  ('table:profiles', 'stripe_customer_id', _check_column('profiles', 'stripe_customer_id')),
  ('table:profiles', 'subscription_status', _check_column('profiles', 'subscription_status')),
  ('table:profiles', 'subscription_plan', _check_column('profiles', 'subscription_plan')),
  ('table:profiles', 'subscription_period_end', _check_column('profiles', 'subscription_period_end')),
  ('table:profiles', 'email_notifications', _check_column('profiles', 'email_notifications')),
  ('table:profiles', 'is_active', _check_column('profiles', 'is_active')),
  ('table:profiles', 'gdpr_consent_at', _check_column('profiles', 'gdpr_consent_at')),
  ('table:profiles', 'privacy_policy_version', _check_column('profiles', 'privacy_policy_version')),
  ('table:profiles', 'terms_accepted_at', _check_column('profiles', 'terms_accepted_at')),
  ('table:profiles', 'data_retention_days', _check_column('profiles', 'data_retention_days')),
  ('table:profiles', 'created_at', _check_column('profiles', 'created_at')),
  ('table:profiles', 'updated_at', _check_column('profiles', 'updated_at'));

-- cases (14 columns)
INSERT INTO _check_results VALUES
  ('table:cases', 'id', _check_column('cases', 'id')),
  ('table:cases', 'user_id', _check_column('cases', 'user_id')),
  ('table:cases', 'code', _check_column('cases', 'code')),
  ('table:cases', 'patient_initials', _check_column('cases', 'patient_initials')),
  ('table:cases', 'practice_reference', _check_column('cases', 'practice_reference')),
  ('table:cases', 'case_type', _check_column('cases', 'case_type')),
  ('table:cases', 'case_types', _check_column('cases', 'case_types')),
  ('table:cases', 'case_role', _check_column('cases', 'case_role')),
  ('table:cases', 'status', _check_column('cases', 'status')),
  ('table:cases', 'notes', _check_column('cases', 'notes')),
  ('table:cases', 'perizia_metadata', _check_column('cases', 'perizia_metadata')),
  ('table:cases', 'document_count', _check_column('cases', 'document_count')),
  ('table:cases', 'created_at', _check_column('cases', 'created_at')),
  ('table:cases', 'updated_at', _check_column('cases', 'updated_at'));

-- documents (13 columns)
INSERT INTO _check_results VALUES
  ('table:documents', 'id', _check_column('documents', 'id')),
  ('table:documents', 'case_id', _check_column('documents', 'case_id')),
  ('table:documents', 'file_name', _check_column('documents', 'file_name')),
  ('table:documents', 'file_type', _check_column('documents', 'file_type')),
  ('table:documents', 'file_size', _check_column('documents', 'file_size')),
  ('table:documents', 'storage_path', _check_column('documents', 'storage_path')),
  ('table:documents', 'document_type', _check_column('documents', 'document_type')),
  ('table:documents', 'processing_status', _check_column('documents', 'processing_status')),
  ('table:documents', 'processing_error', _check_column('documents', 'processing_error')),
  ('table:documents', 'classification_metadata', _check_column('documents', 'classification_metadata')),
  ('table:documents', 'page_count', _check_column('documents', 'page_count')),
  ('table:documents', 'created_at', _check_column('documents', 'created_at')),
  ('table:documents', 'updated_at', _check_column('documents', 'updated_at'));

-- pages (9 columns)
INSERT INTO _check_results VALUES
  ('table:pages', 'id', _check_column('pages', 'id')),
  ('table:pages', 'document_id', _check_column('pages', 'document_id')),
  ('table:pages', 'page_number', _check_column('pages', 'page_number')),
  ('table:pages', 'ocr_text', _check_column('pages', 'ocr_text')),
  ('table:pages', 'ocr_confidence', _check_column('pages', 'ocr_confidence')),
  ('table:pages', 'has_handwriting', _check_column('pages', 'has_handwriting')),
  ('table:pages', 'handwriting_confidence', _check_column('pages', 'handwriting_confidence')),
  ('table:pages', 'image_path', _check_column('pages', 'image_path')),
  ('table:pages', 'created_at', _check_column('pages', 'created_at'));

-- events (23 columns)
INSERT INTO _check_results VALUES
  ('table:events', 'id', _check_column('events', 'id')),
  ('table:events', 'case_id', _check_column('events', 'case_id')),
  ('table:events', 'document_id', _check_column('events', 'document_id')),
  ('table:events', 'order_number', _check_column('events', 'order_number')),
  ('table:events', 'event_date', _check_column('events', 'event_date')),
  ('table:events', 'date_precision', _check_column('events', 'date_precision')),
  ('table:events', 'event_type', _check_column('events', 'event_type')),
  ('table:events', 'title', _check_column('events', 'title')),
  ('table:events', 'description', _check_column('events', 'description')),
  ('table:events', 'source_type', _check_column('events', 'source_type')),
  ('table:events', 'diagnosis', _check_column('events', 'diagnosis')),
  ('table:events', 'doctor', _check_column('events', 'doctor')),
  ('table:events', 'facility', _check_column('events', 'facility')),
  ('table:events', 'confidence', _check_column('events', 'confidence')),
  ('table:events', 'requires_verification', _check_column('events', 'requires_verification')),
  ('table:events', 'reliability_notes', _check_column('events', 'reliability_notes')),
  ('table:events', 'expert_notes', _check_column('events', 'expert_notes')),
  ('table:events', 'source_text', _check_column('events', 'source_text')),
  ('table:events', 'source_pages', _check_column('events', 'source_pages')),
  ('table:events', 'extraction_pass', _check_column('events', 'extraction_pass')),
  ('table:events', 'is_deleted', _check_column('events', 'is_deleted')),
  ('table:events', 'created_at', _check_column('events', 'created_at')),
  ('table:events', 'updated_at', _check_column('events', 'updated_at'));

-- event_images (6 columns)
INSERT INTO _check_results VALUES
  ('table:event_images', 'id', _check_column('event_images', 'id')),
  ('table:event_images', 'event_id', _check_column('event_images', 'event_id')),
  ('table:event_images', 'page_id', _check_column('event_images', 'page_id')),
  ('table:event_images', 'image_path', _check_column('event_images', 'image_path')),
  ('table:event_images', 'page_number', _check_column('event_images', 'page_number')),
  ('table:event_images', 'created_at', _check_column('event_images', 'created_at'));

-- anomalies (8 columns)
INSERT INTO _check_results VALUES
  ('table:anomalies', 'id', _check_column('anomalies', 'id')),
  ('table:anomalies', 'case_id', _check_column('anomalies', 'case_id')),
  ('table:anomalies', 'anomaly_type', _check_column('anomalies', 'anomaly_type')),
  ('table:anomalies', 'severity', _check_column('anomalies', 'severity')),
  ('table:anomalies', 'description', _check_column('anomalies', 'description')),
  ('table:anomalies', 'involved_events', _check_column('anomalies', 'involved_events')),
  ('table:anomalies', 'suggestion', _check_column('anomalies', 'suggestion')),
  ('table:anomalies', 'created_at', _check_column('anomalies', 'created_at'));

-- missing_documents (6 columns)
INSERT INTO _check_results VALUES
  ('table:missing_documents', 'id', _check_column('missing_documents', 'id')),
  ('table:missing_documents', 'case_id', _check_column('missing_documents', 'case_id')),
  ('table:missing_documents', 'document_name', _check_column('missing_documents', 'document_name')),
  ('table:missing_documents', 'reason', _check_column('missing_documents', 'reason')),
  ('table:missing_documents', 'related_event', _check_column('missing_documents', 'related_event')),
  ('table:missing_documents', 'created_at', _check_column('missing_documents', 'created_at'));

-- reports (7 columns)
INSERT INTO _check_results VALUES
  ('table:reports', 'id', _check_column('reports', 'id')),
  ('table:reports', 'case_id', _check_column('reports', 'case_id')),
  ('table:reports', 'version', _check_column('reports', 'version')),
  ('table:reports', 'report_status', _check_column('reports', 'report_status')),
  ('table:reports', 'synthesis', _check_column('reports', 'synthesis')),
  ('table:reports', 'created_at', _check_column('reports', 'created_at')),
  ('table:reports', 'updated_at', _check_column('reports', 'updated_at'));

-- report_exports (5 columns)
INSERT INTO _check_results VALUES
  ('table:report_exports', 'id', _check_column('report_exports', 'id')),
  ('table:report_exports', 'report_id', _check_column('report_exports', 'report_id')),
  ('table:report_exports', 'format', _check_column('report_exports', 'format')),
  ('table:report_exports', 'storage_path', _check_column('report_exports', 'storage_path')),
  ('table:report_exports', 'created_at', _check_column('report_exports', 'created_at'));

-- audit_log (8 columns)
INSERT INTO _check_results VALUES
  ('table:audit_log', 'id', _check_column('audit_log', 'id')),
  ('table:audit_log', 'user_id', _check_column('audit_log', 'user_id')),
  ('table:audit_log', 'action', _check_column('audit_log', 'action')),
  ('table:audit_log', 'entity_type', _check_column('audit_log', 'entity_type')),
  ('table:audit_log', 'entity_id', _check_column('audit_log', 'entity_id')),
  ('table:audit_log', 'metadata', _check_column('audit_log', 'metadata')),
  ('table:audit_log', 'ip_address', _check_column('audit_log', 'ip_address')),
  ('table:audit_log', 'created_at', _check_column('audit_log', 'created_at'));

-- guidelines (9 columns)
INSERT INTO _check_results VALUES
  ('table:guidelines', 'id', _check_column('guidelines', 'id')),
  ('table:guidelines', 'title', _check_column('guidelines', 'title')),
  ('table:guidelines', 'source', _check_column('guidelines', 'source')),
  ('table:guidelines', 'year', _check_column('guidelines', 'year')),
  ('table:guidelines', 'case_types', _check_column('guidelines', 'case_types')),
  ('table:guidelines', 'chunk_count', _check_column('guidelines', 'chunk_count')),
  ('table:guidelines', 'is_active', _check_column('guidelines', 'is_active')),
  ('table:guidelines', 'created_at', _check_column('guidelines', 'created_at')),
  ('table:guidelines', 'updated_at', _check_column('guidelines', 'updated_at'));

-- guideline_chunks (8 columns)
INSERT INTO _check_results VALUES
  ('table:guideline_chunks', 'id', _check_column('guideline_chunks', 'id')),
  ('table:guideline_chunks', 'guideline_id', _check_column('guideline_chunks', 'guideline_id')),
  ('table:guideline_chunks', 'chunk_index', _check_column('guideline_chunks', 'chunk_index')),
  ('table:guideline_chunks', 'content', _check_column('guideline_chunks', 'content')),
  ('table:guideline_chunks', 'section_title', _check_column('guideline_chunks', 'section_title')),
  ('table:guideline_chunks', 'embedding', _check_column('guideline_chunks', 'embedding')),
  ('table:guideline_chunks', 'token_count', _check_column('guideline_chunks', 'token_count')),
  ('table:guideline_chunks', 'created_at', _check_column('guideline_chunks', 'created_at'));

-- report_ratings (7 columns)
INSERT INTO _check_results VALUES
  ('table:report_ratings', 'id', _check_column('report_ratings', 'id')),
  ('table:report_ratings', 'report_id', _check_column('report_ratings', 'report_id')),
  ('table:report_ratings', 'user_id', _check_column('report_ratings', 'user_id')),
  ('table:report_ratings', 'rating', _check_column('report_ratings', 'rating')),
  ('table:report_ratings', 'comment', _check_column('report_ratings', 'comment')),
  ('table:report_ratings', 'created_at', _check_column('report_ratings', 'created_at')),
  ('table:report_ratings', 'updated_at', _check_column('report_ratings', 'updated_at'));

-- case_shares (8 columns)
INSERT INTO _check_results VALUES
  ('table:case_shares', 'id', _check_column('case_shares', 'id')),
  ('table:case_shares', 'case_id', _check_column('case_shares', 'case_id')),
  ('table:case_shares', 'user_id', _check_column('case_shares', 'user_id')),
  ('table:case_shares', 'token', _check_column('case_shares', 'token')),
  ('table:case_shares', 'label', _check_column('case_shares', 'label')),
  ('table:case_shares', 'expires_at', _check_column('case_shares', 'expires_at')),
  ('table:case_shares', 'view_count', _check_column('case_shares', 'view_count')),
  ('table:case_shares', 'created_at', _check_column('case_shares', 'created_at'));

-- =============================================================================
-- 4. FOREIGN KEYS
-- =============================================================================

CREATE OR REPLACE FUNCTION _check_fk(tbl TEXT, col TEXT) RETURNS TEXT AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND kcu.table_schema = 'public'
      AND kcu.table_name = tbl
      AND kcu.column_name = col
  ) THEN RETURN 'OK';
  ELSE RETURN 'MISSING';
  END IF;
END;
$$ LANGUAGE plpgsql;

INSERT INTO _check_results VALUES
  ('fk', 'cases.user_id -> profiles', _check_fk('cases', 'user_id')),
  ('fk', 'documents.case_id -> cases', _check_fk('documents', 'case_id')),
  ('fk', 'pages.document_id -> documents', _check_fk('pages', 'document_id')),
  ('fk', 'events.case_id -> cases', _check_fk('events', 'case_id')),
  ('fk', 'events.document_id -> documents', _check_fk('events', 'document_id')),
  ('fk', 'event_images.event_id -> events', _check_fk('event_images', 'event_id')),
  ('fk', 'event_images.page_id -> pages', _check_fk('event_images', 'page_id')),
  ('fk', 'anomalies.case_id -> cases', _check_fk('anomalies', 'case_id')),
  ('fk', 'missing_documents.case_id -> cases', _check_fk('missing_documents', 'case_id')),
  ('fk', 'reports.case_id -> cases', _check_fk('reports', 'case_id')),
  ('fk', 'report_exports.report_id -> reports', _check_fk('report_exports', 'report_id')),
  ('fk', 'audit_log.user_id -> profiles', _check_fk('audit_log', 'user_id')),
  ('fk', 'guideline_chunks.guideline_id -> guidelines', _check_fk('guideline_chunks', 'guideline_id')),
  ('fk', 'report_ratings.report_id -> reports', _check_fk('report_ratings', 'report_id')),
  ('fk', 'report_ratings.user_id -> profiles', _check_fk('report_ratings', 'user_id')),
  ('fk', 'case_shares.case_id -> cases', _check_fk('case_shares', 'case_id')),
  ('fk', 'case_shares.user_id -> profiles', _check_fk('case_shares', 'user_id'));

-- =============================================================================
-- 5. UNIQUE CONSTRAINTS
-- =============================================================================

CREATE OR REPLACE FUNCTION _check_unique(tbl TEXT, col TEXT) RETURNS TEXT AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.key_column_usage kcu
    JOIN information_schema.table_constraints tc
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'UNIQUE'
      AND kcu.table_schema = 'public'
      AND kcu.table_name = tbl
      AND kcu.column_name = col
  ) THEN RETURN 'OK';
  ELSE RETURN 'MISSING';
  END IF;
END;
$$ LANGUAGE plpgsql;

INSERT INTO _check_results VALUES
  ('unique', 'cases.code', _check_unique('cases', 'code')),
  ('unique', 'case_shares.token', _check_unique('case_shares', 'token'));

-- =============================================================================
-- 6. INDEXES
-- =============================================================================

INSERT INTO _check_results
SELECT 'index', 'idx_guideline_chunks_guideline_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_guideline_chunks_guideline_id'
  ) THEN 'OK' ELSE 'MISSING' END;

-- =============================================================================
-- OUTPUT: mostra prima i MISSING, poi gli OK
-- =============================================================================

-- Riepilogo
SELECT
  '=== RIEPILOGO ===' AS info,
  (SELECT count(*) FROM _check_results WHERE status = 'OK')::text || ' OK' AS ok_count,
  (SELECT count(*) FROM _check_results WHERE status = 'MISSING')::text || ' MISSING' AS missing_count,
  (SELECT count(*) FROM _check_results)::text || ' TOTAL' AS total;

-- Dettaglio MISSING (se ce ne sono)
SELECT category, item, status
FROM _check_results
WHERE status = 'MISSING'
ORDER BY category, item;

-- Dettaglio completo
SELECT category, item, status
FROM _check_results
ORDER BY category, item;

-- Cleanup
DROP FUNCTION IF EXISTS _check_enum_value(TEXT, TEXT);
DROP FUNCTION IF EXISTS _check_column(TEXT, TEXT);
DROP FUNCTION IF EXISTS _check_fk(TEXT, TEXT);
DROP FUNCTION IF EXISTS _check_unique(TEXT, TEXT);
DROP TABLE IF EXISTS _check_results;
