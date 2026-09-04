-- Verifica idempotente migration 0033 (merge multi-file documenti).
-- Attese: 2 colonne su documents + 1 FK + 1 indice parziale. Incollare nel SQL editor.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name IN ('merged_into_document_id', 'merge_order')) AS colonne_attese_2,
  -- pg_constraint, non information_schema (che qui rispondeva 0 con la FK presente — verificato 2026-09-04)
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.documents'::regclass AND conname = 'documents_merged_into_document_id_documents_id_fk' AND contype = 'f') AS fk_attesa_1,
  (SELECT count(*) FROM pg_indexes
    WHERE tablename = 'documents' AND indexname = 'idx_documents_merged_into') AS indice_atteso_1;
