ALTER TYPE "public"."case_type" ADD VALUE 'perizia_assicurativa' BEFORE 'generica';--> statement-breakpoint
ALTER TYPE "public"."case_type" ADD VALUE 'analisi_spese_mediche' BEFORE 'generica';--> statement-breakpoint
ALTER TYPE "public"."case_type" ADD VALUE 'opinione_prognostica' BEFORE 'generica';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'spese_mediche' BEFORE 'altro';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'memoria_difensiva' BEFORE 'altro';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'perizia_ctp' BEFORE 'altro';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'perizia_ctu' BEFORE 'altro';--> statement-breakpoint
ALTER TYPE "public"."processing_status" ADD VALUE 'classificazione_completata' BEFORE 'estrazione_in_corso';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'spesa_medica' BEFORE 'altro';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'documento_amministrativo' BEFORE 'altro';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'certificato' BEFORE 'altro';--> statement-breakpoint
ALTER TYPE "public"."extraction_pass" ADD VALUE 'retry';--> statement-breakpoint
ALTER TYPE "public"."anomaly_type" ADD VALUE 'valore_clinico_critico';--> statement-breakpoint
ALTER TYPE "public"."anomaly_type" ADD VALUE 'sequenza_temporale_violata';--> statement-breakpoint
CREATE TABLE "report_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_ratings_report_user_unique" UNIQUE("report_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "case_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone NOT NULL,
	"view_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "subscription_status" text DEFAULT 'trial';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "subscription_plan" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "subscription_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "email_notifications" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "gdpr_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "privacy_policy_version" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "data_retention_days" integer DEFAULT 365;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "classification_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "report_ratings" ADD CONSTRAINT "report_ratings_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_ratings" ADD CONSTRAINT "report_ratings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_shares" ADD CONSTRAINT "case_shares_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_shares" ADD CONSTRAINT "case_shares_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;