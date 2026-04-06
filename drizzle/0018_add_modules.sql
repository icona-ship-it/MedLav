-- Add module system columns to cases table
-- Module ID and category are nullable initially for backward compatibility with existing cases

DO $$ BEGIN
  CREATE TYPE "pipeline_mode" AS ENUM ('full', 'extraction_only', 'expenses_only', 'anonymize_only');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "module_id" text;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "module_category" integer;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "pipeline_mode" "pipeline_mode" DEFAULT 'full';
