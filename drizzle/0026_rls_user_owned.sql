-- Migration 0026: Row Level Security su tutte le tabelle user-owned.
--
-- Difesa contro: leak di SUPABASE_SERVICE_ROLE_KEY o anon key con permissions
-- broad. Anche se un attaccante ottiene una key, RLS impone che ogni query
-- veda SOLO i dati del proprio utente (auth.uid()).
--
-- Service role bypassa RLS by design (necessario per audit log, batch ops,
-- pipeline Inngest). Le route che usano service role devono rimanere chiuse
-- dietro auth applicativa + ownership check.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY. Sicuro da rilanciare.
-- Aplica via Supabase SQL editor. Verifica con drizzle/verify_0026.sql.
--
-- IMPORTANTE: prima di applicare in PROD, testare in staging che le query
-- applicative continuino a funzionare. RLS rifiuta silenziosamente le query
-- non-conformi (ritorna empty result), quindi rotture sono "invisibili"
-- finche' l'utente non si accorge.

-- ============================================================================
-- 1. cases — ownership diretta via user_id
-- ============================================================================

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cases_select_own ON cases;
CREATE POLICY cases_select_own ON cases
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cases_insert_own ON cases;
CREATE POLICY cases_insert_own ON cases
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cases_update_own ON cases;
CREATE POLICY cases_update_own ON cases
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cases_delete_own ON cases;
CREATE POLICY cases_delete_own ON cases
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 2. documents — via cases.user_id
-- ============================================================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_select_own ON documents;
CREATE POLICY documents_select_own ON documents
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS documents_insert_own ON documents;
CREATE POLICY documents_insert_own ON documents
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS documents_update_own ON documents;
CREATE POLICY documents_update_own ON documents
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS documents_delete_own ON documents;
CREATE POLICY documents_delete_own ON documents
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 3. pages — via documents.case_id → cases.user_id
-- ============================================================================

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pages_select_own ON pages;
CREATE POLICY pages_select_own ON pages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM documents
    JOIN cases ON cases.id = documents.case_id
    WHERE documents.id = pages.document_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS pages_insert_own ON pages;
CREATE POLICY pages_insert_own ON pages
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM documents
    JOIN cases ON cases.id = documents.case_id
    WHERE documents.id = pages.document_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS pages_update_own ON pages;
CREATE POLICY pages_update_own ON pages
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM documents
    JOIN cases ON cases.id = documents.case_id
    WHERE documents.id = pages.document_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS pages_delete_own ON pages;
CREATE POLICY pages_delete_own ON pages
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM documents
    JOIN cases ON cases.id = documents.case_id
    WHERE documents.id = pages.document_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 4. events — via cases.user_id
-- ============================================================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_own ON events;
CREATE POLICY events_select_own ON events
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = events.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS events_insert_own ON events;
CREATE POLICY events_insert_own ON events
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = events.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS events_update_own ON events;
CREATE POLICY events_update_own ON events
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = events.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS events_delete_own ON events;
CREATE POLICY events_delete_own ON events
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = events.case_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 5. reports — via cases.user_id
-- ============================================================================

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reports_select_own ON reports;
CREATE POLICY reports_select_own ON reports
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = reports.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS reports_insert_own ON reports;
CREATE POLICY reports_insert_own ON reports
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = reports.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS reports_update_own ON reports;
CREATE POLICY reports_update_own ON reports
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = reports.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS reports_delete_own ON reports;
CREATE POLICY reports_delete_own ON reports
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = reports.case_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 6. anomalies — via cases.user_id
-- ============================================================================

ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anomalies_select_own ON anomalies;
CREATE POLICY anomalies_select_own ON anomalies
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = anomalies.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS anomalies_insert_own ON anomalies;
CREATE POLICY anomalies_insert_own ON anomalies
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = anomalies.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS anomalies_update_own ON anomalies;
CREATE POLICY anomalies_update_own ON anomalies
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = anomalies.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS anomalies_delete_own ON anomalies;
CREATE POLICY anomalies_delete_own ON anomalies
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = anomalies.case_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 7. missing_documents — via cases.user_id
-- ============================================================================

ALTER TABLE missing_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS missing_documents_select_own ON missing_documents;
CREATE POLICY missing_documents_select_own ON missing_documents
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = missing_documents.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS missing_documents_insert_own ON missing_documents;
CREATE POLICY missing_documents_insert_own ON missing_documents
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = missing_documents.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS missing_documents_update_own ON missing_documents;
CREATE POLICY missing_documents_update_own ON missing_documents
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = missing_documents.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS missing_documents_delete_own ON missing_documents;
CREATE POLICY missing_documents_delete_own ON missing_documents
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = missing_documents.case_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 8. event_images — via events.case_id → cases.user_id
-- ============================================================================

ALTER TABLE event_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_images_select_own ON event_images;
CREATE POLICY event_images_select_own ON event_images
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM events
    JOIN cases ON cases.id = events.case_id
    WHERE events.id = event_images.event_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS event_images_insert_own ON event_images;
CREATE POLICY event_images_insert_own ON event_images
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM events
    JOIN cases ON cases.id = events.case_id
    WHERE events.id = event_images.event_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS event_images_delete_own ON event_images;
CREATE POLICY event_images_delete_own ON event_images
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM events
    JOIN cases ON cases.id = events.case_id
    WHERE events.id = event_images.event_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 9. case_shares — bidirectional ownership (owner can manage, shared-with can see)
-- ============================================================================

ALTER TABLE case_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS case_shares_select_own ON case_shares;
CREATE POLICY case_shares_select_own ON case_shares
  FOR SELECT
  USING (
    -- Owner of the case can see all shares
    EXISTS (SELECT 1 FROM cases WHERE cases.id = case_shares.case_id AND cases.user_id = auth.uid())
    -- Or recipient can see shares directed at them
    OR shared_with_user_id = auth.uid()
  );

DROP POLICY IF EXISTS case_shares_insert_own ON case_shares;
CREATE POLICY case_shares_insert_own ON case_shares
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = case_shares.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS case_shares_delete_own ON case_shares;
CREATE POLICY case_shares_delete_own ON case_shares
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = case_shares.case_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 10. report_ratings — via cases.user_id
-- ============================================================================

ALTER TABLE report_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_ratings_select_own ON report_ratings;
CREATE POLICY report_ratings_select_own ON report_ratings
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = report_ratings.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS report_ratings_insert_own ON report_ratings;
CREATE POLICY report_ratings_insert_own ON report_ratings
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = report_ratings.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS report_ratings_update_own ON report_ratings;
CREATE POLICY report_ratings_update_own ON report_ratings
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = report_ratings.case_id AND cases.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS report_ratings_delete_own ON report_ratings;
CREATE POLICY report_ratings_delete_own ON report_ratings
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM cases WHERE cases.id = report_ratings.case_id AND cases.user_id = auth.uid()
  ));

-- ============================================================================
-- 11. profiles — ognuno vede solo se stesso
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- INSERT non permesso da client (creazione profile via trigger auth.users)
-- DELETE non permesso da client (delete account passa per deleteMyAccount con service_role)

-- ============================================================================
-- 12. credit_transactions — ognuno vede solo le proprie
-- ============================================================================

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_transactions_select_own ON credit_transactions;
CREATE POLICY credit_transactions_select_own ON credit_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE solo via service_role (credit-service.ts) — nessuna policy esposta

-- ============================================================================
-- 13. audit_log — utente puo' leggere solo i propri record
-- ============================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select_own ON audit_log;
CREATE POLICY audit_log_select_own ON audit_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT solo via service_role (logAccess in src/lib/audit.ts)
-- UPDATE/DELETE bloccati (immutabilita' audit log)

DROP POLICY IF EXISTS audit_log_no_update ON audit_log;
CREATE POLICY audit_log_no_update ON audit_log
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS audit_log_no_delete ON audit_log;
CREATE POLICY audit_log_no_delete ON audit_log
  FOR DELETE
  USING (false);

-- ============================================================================
-- Comment summary
-- ============================================================================

COMMENT ON TABLE cases IS 'RLS: auth.uid() = user_id su tutte le op';
COMMENT ON TABLE documents IS 'RLS: via cases.user_id (JOIN check)';
COMMENT ON TABLE pages IS 'RLS: via documents.case_id → cases.user_id';
COMMENT ON TABLE events IS 'RLS: via cases.user_id';
COMMENT ON TABLE reports IS 'RLS: via cases.user_id';
COMMENT ON TABLE anomalies IS 'RLS: via cases.user_id';
COMMENT ON TABLE missing_documents IS 'RLS: via cases.user_id';
COMMENT ON TABLE event_images IS 'RLS: via events.case_id → cases.user_id';
COMMENT ON TABLE case_shares IS 'RLS: owner + recipient (shared_with_user_id)';
COMMENT ON TABLE report_ratings IS 'RLS: via cases.user_id';
COMMENT ON TABLE profiles IS 'RLS: auth.uid() = id (own profile only)';
COMMENT ON TABLE credit_transactions IS 'RLS: auth.uid() = user_id (SELECT only, modifiche solo via service_role)';
COMMENT ON TABLE audit_log IS 'RLS: SELECT own, INSERT solo service_role, no UPDATE/DELETE';
