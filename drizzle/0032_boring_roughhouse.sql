CREATE TABLE "pipeline_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"step" text NOT NULL,
	"code" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"detail" jsonb,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_diagnostics" ADD CONSTRAINT "pipeline_diagnostics_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_diagnostics_case_id_idx" ON "pipeline_diagnostics" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_diagnostics_case_step_code_uq" ON "pipeline_diagnostics" USING btree ("case_id","step","code");--> statement-breakpoint
-- RLS (aggiunta manuale, workflow MANUAL_MIGRATIONS): il proprietario del caso
-- legge la diagnostica del proprio caso; le scritture avvengono SOLO dal
-- service role (pipeline server-side), che bypassa RLS per costruzione.
ALTER TABLE "pipeline_diagnostics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pipeline_diagnostics_select_own" ON "pipeline_diagnostics"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM cases c
      WHERE c.id = pipeline_diagnostics.case_id AND c.user_id = auth.uid()
    )
  );
