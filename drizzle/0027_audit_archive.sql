-- Migration 0027: audit_archive — forensic-grade audit table that survives
-- account/profile deletion. Required for GDPR Art. 17 compliance with
-- legal-obligation override (Art. 6(1)(c) + Codice Privacy Art. 6).
--
-- Idempotente: usa IF NOT EXISTS dappertutto. Sicuro da rilanciare.
--
-- Aplica via Supabase SQL editor (vedi drizzle/MANUAL_MIGRATIONS.md).
-- Verifica con: drizzle/verify_0027.sql

-- ============================================================================
-- Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_archive (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NB: no FK a profiles — sopravvive alla cancellazione utente by design.
  user_id      uuid NOT NULL,
  action       text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  metadata     jsonb,
  ip_address   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indices (per query forensiche)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_audit_archive_user_id
  ON audit_archive (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_archive_created_at
  ON audit_archive (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_archive_action
  ON audit_archive (action);

-- ============================================================================
-- RLS — solo service_role puo' INSERT, nessuno puo' DELETE
-- ============================================================================

ALTER TABLE audit_archive ENABLE ROW LEVEL SECURITY;

-- Policy: nessuna lettura da anon/authenticated (solo admin via service_role)
DROP POLICY IF EXISTS audit_archive_no_read ON audit_archive;
CREATE POLICY audit_archive_no_read ON audit_archive
  FOR SELECT
  USING (false);

-- Policy: nessun UPDATE possibile
DROP POLICY IF EXISTS audit_archive_no_update ON audit_archive;
CREATE POLICY audit_archive_no_update ON audit_archive
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- Policy: nessuna DELETE possibile
DROP POLICY IF EXISTS audit_archive_no_delete ON audit_archive;
CREATE POLICY audit_archive_no_delete ON audit_archive
  FOR DELETE
  USING (false);

-- INSERT permesso solo via service_role (bypassa RLS per design Supabase).
-- Non serve policy esplicita per service_role.

COMMENT ON TABLE audit_archive IS
  'Forensic audit log — sopravvive a profile.delete per GDPR Art. 6(1)(c). Retention: 5 anni minimo (configurabile via job di cleanup). Solo INSERT via service_role.';
