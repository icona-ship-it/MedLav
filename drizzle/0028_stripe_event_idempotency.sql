-- Migration 0028: stripe_processed_events — webhook idempotency.
--
-- Stripe delivers webhooks AT LEAST ONCE (retries on any network blip / 5xx),
-- so the same event can arrive multiple times. Without dedup, a replayed
-- checkout.session.completed re-grants a credit pack, and a replayed
-- subscription grant re-runs grantMonthlyCredits (which UPSERTs monthly_used=0,
-- resetting the user's quota for free). Both are money leaks.
--
-- The webhook records each Stripe event id here once (PK = event id); a second
-- delivery hits the primary-key conflict and is skipped.
--
-- Idempotente: IF NOT EXISTS. Sicuro da rilanciare.
-- Applica via Supabase SQL editor (vedi drizzle/MANUAL_MIGRATIONS.md).
-- Verifica con: drizzle/verify_0028.sql

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- Retention housekeeping helper (events older than 90 days can be pruned).
CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_processed_at
  ON stripe_processed_events (processed_at);
