-- Add generation_metadata JSONB column to reports table
-- Stores prompt versioning info (promptVersion SHA-256 hash) for audit trail (ADR-011)
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "generation_metadata" jsonb;
