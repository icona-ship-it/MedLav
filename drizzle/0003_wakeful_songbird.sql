-- Migration 0003: Add new case types + case_types column
-- NOTE: guideline_chunks and guidelines tables are created in 0002_rag_guidelines.sql
-- with the correct vector(1024) type. Do NOT recreate them here.

ALTER TYPE "public"."case_type" ADD VALUE 'rc_auto' BEFORE 'generica';--> statement-breakpoint
ALTER TYPE "public"."case_type" ADD VALUE 'previdenziale' BEFORE 'generica';--> statement-breakpoint
ALTER TYPE "public"."case_type" ADD VALUE 'infortuni' BEFORE 'generica';--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "case_types" jsonb;
