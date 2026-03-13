-- Add 'user_confirmed' to anomaly_status enum
-- This value is needed for users to confirm anomalies for inclusion in the report
ALTER TYPE anomaly_status ADD VALUE IF NOT EXISTS 'user_confirmed';

-- Add UPDATE RLS policy on anomalies table
-- Without this, confirm/dismiss actions fail silently via user-scoped Supabase client
CREATE POLICY "Users can update own anomalies"
  ON anomalies FOR UPDATE TO authenticated
  USING (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()))
  WITH CHECK (case_id IN (SELECT id FROM cases WHERE user_id = auth.uid()));
