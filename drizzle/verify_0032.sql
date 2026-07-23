-- Verifica idempotente migration 0032 (pipeline_diagnostics) — incollare nel SQL editor.
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_name = 'pipeline_diagnostics') AS tabella_presente,          -- atteso: 1
  (SELECT count(*) FROM pg_indexes WHERE tablename = 'pipeline_diagnostics') AS indici,                                    -- atteso: >= 3 (pk + case_id + uq)
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'pipeline_diagnostics') AS rls_attiva,                              -- atteso: true
  (SELECT count(*) FROM pg_policies WHERE tablename = 'pipeline_diagnostics') AS policy;                                   -- atteso: 1
