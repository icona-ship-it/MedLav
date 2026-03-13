-- Add anomaly resolution support (LLM-based anomaly verification)
DO $$ BEGIN
  CREATE TYPE anomaly_status AS ENUM ('detected', 'llm_resolved', 'llm_confirmed', 'user_dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS status anomaly_status NOT NULL DEFAULT 'detected';
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS resolution_note text;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
