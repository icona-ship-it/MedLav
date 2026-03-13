-- Add processing_stage column to cases table
-- Tracks the pipeline state: idle → elaborazione → revisione_anomalie → generazione_report → completato
ALTER TABLE cases ADD COLUMN IF NOT EXISTS processing_stage text NOT NULL DEFAULT 'idle';
CREATE INDEX IF NOT EXISTS idx_cases_processing_stage ON cases(processing_stage);
