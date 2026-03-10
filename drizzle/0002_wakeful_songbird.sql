ALTER TYPE "public"."case_type" ADD VALUE 'rc_auto' BEFORE 'generica';--> statement-breakpoint
ALTER TYPE "public"."case_type" ADD VALUE 'previdenziale' BEFORE 'generica';--> statement-breakpoint
ALTER TYPE "public"."case_type" ADD VALUE 'infortuni' BEFORE 'generica';--> statement-breakpoint
CREATE TABLE "guideline_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guideline_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"section_title" text,
	"embedding" text,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guidelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"year" integer,
	"case_types" jsonb NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "case_types" jsonb;--> statement-breakpoint
ALTER TABLE "guideline_chunks" ADD CONSTRAINT "guideline_chunks_guideline_id_guidelines_id_fk" FOREIGN KEY ("guideline_id") REFERENCES "public"."guidelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_guideline_chunks_guideline_id" ON "guideline_chunks" USING btree ("guideline_id");