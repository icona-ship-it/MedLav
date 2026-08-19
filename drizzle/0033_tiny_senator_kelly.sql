ALTER TABLE "documents" ADD COLUMN "merged_into_document_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "merge_order" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_merged_into_document_id_documents_id_fk" FOREIGN KEY ("merged_into_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Indice sulla FK (audit 2026-07: mai FK senza indice) — parziale: quasi tutti i documenti non sono merged.
CREATE INDEX IF NOT EXISTS "idx_documents_merged_into" ON "documents" ("merged_into_document_id") WHERE "merged_into_document_id" IS NOT NULL;
