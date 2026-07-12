-- Indici sulle foreign key più interrogate (verifica totale 2026-07-12).
-- Le query runtime filtrano quasi sempre per user_id / case_id / document_id /
-- event_id, ma queste FK non avevano indice: full scan aggravato dalle policy RLS
-- con sub-select annidati. Su piccoli volumi l'impatto è basso, ma cresce con gli
-- utenti/casi — da applicare prima di aprire a nuovi periti.
--
-- Idempotente (IF NOT EXISTS). Tabelle piccole → lock momentaneo trascurabile.
-- Su tabelle molto grandi usare la variante CONCURRENTLY (fuori transazione).

CREATE INDEX IF NOT EXISTS idx_cases_user_id            ON public.cases(user_id);
CREATE INDEX IF NOT EXISTS idx_events_case_id           ON public.events(case_id);
CREATE INDEX IF NOT EXISTS idx_events_document_id        ON public.events(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_id         ON public.documents(case_id);
CREATE INDEX IF NOT EXISTS idx_pages_document_id         ON public.pages(document_id);
CREATE INDEX IF NOT EXISTS idx_reports_case_id           ON public.reports(case_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_case_id         ON public.anomalies(case_id);
CREATE INDEX IF NOT EXISTS idx_missing_documents_case_id ON public.missing_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_event_images_event_id     ON public.event_images(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id         ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_report_ratings_user_id    ON public.report_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_case_shares_case_id       ON public.case_shares(case_id);
CREATE INDEX IF NOT EXISTS idx_case_shares_user_id       ON public.case_shares(user_id);
