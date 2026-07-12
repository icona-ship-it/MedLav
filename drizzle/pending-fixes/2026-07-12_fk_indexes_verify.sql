-- Verifica: tutti gli indici FK previsti devono esistere.
-- Atteso: 14 righe.
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_cases_user_id','idx_events_case_id','idx_events_document_id',
    'idx_documents_case_id','idx_pages_document_id','idx_reports_case_id',
    'idx_anomalies_case_id','idx_missing_documents_case_id','idx_event_images_event_id',
    'idx_audit_log_user_id','idx_credit_transactions_user_id','idx_report_ratings_user_id',
    'idx_case_shares_case_id','idx_case_shares_user_id'
  )
ORDER BY tablename, indexname;
