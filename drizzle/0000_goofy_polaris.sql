CREATE TYPE "public"."case_role" AS ENUM('ctu', 'ctp', 'stragiudiziale');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('bozza', 'in_revisione', 'definitivo', 'archiviato');--> statement-breakpoint
CREATE TYPE "public"."case_type" AS ENUM('ortopedica', 'oncologica', 'ostetrica', 'anestesiologica', 'infezione_nosocomiale', 'errore_diagnostico', 'generica');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('cartella_clinica', 'referto_specialistico', 'esame_strumentale', 'esame_laboratorio', 'lettera_dimissione', 'certificato', 'perizia_precedente', 'altro');--> statement-breakpoint
CREATE TYPE "public"."processing_status" AS ENUM('caricato', 'in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso', 'completato', 'errore');--> statement-breakpoint
CREATE TYPE "public"."date_precision" AS ENUM('giorno', 'mese', 'anno', 'sconosciuta');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('visita', 'esame', 'diagnosi', 'intervento', 'terapia', 'ricovero', 'follow-up', 'referto', 'prescrizione', 'consenso', 'complicanza', 'altro');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('cartella_clinica', 'referto_controllo', 'esame_strumentale', 'esame_ematochimico', 'altro');--> statement-breakpoint
CREATE TYPE "public"."anomaly_severity" AS ENUM('critica', 'alta', 'media', 'bassa');--> statement-breakpoint
CREATE TYPE "public"."anomaly_type" AS ENUM('ritardo_diagnostico', 'gap_post_chirurgico', 'gap_documentale', 'complicanza_non_gestita', 'consenso_non_documentato', 'diagnosi_contraddittoria', 'terapia_senza_followup');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('bozza', 'in_revisione', 'definitivo');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"studio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"patient_initials" text,
	"practice_reference" text,
	"case_type" "case_type" DEFAULT 'generica' NOT NULL,
	"case_role" "case_role" DEFAULT 'ctu' NOT NULL,
	"status" "case_status" DEFAULT 'bozza' NOT NULL,
	"notes" text,
	"document_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"document_type" "document_type" DEFAULT 'altro',
	"processing_status" "processing_status" DEFAULT 'caricato' NOT NULL,
	"processing_error" text,
	"page_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"ocr_text" text,
	"ocr_confidence" real,
	"has_handwriting" text,
	"handwriting_confidence" real,
	"image_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"document_id" uuid,
	"order_number" integer NOT NULL,
	"event_date" date NOT NULL,
	"date_precision" date_precision DEFAULT 'giorno' NOT NULL,
	"event_type" "event_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"diagnosis" text,
	"doctor" text,
	"facility" text,
	"confidence" real DEFAULT 0 NOT NULL,
	"requires_verification" boolean DEFAULT false NOT NULL,
	"reliability_notes" text,
	"expert_notes" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"anomaly_type" "anomaly_type" NOT NULL,
	"severity" "anomaly_severity" NOT NULL,
	"description" text NOT NULL,
	"involved_events" text,
	"suggestion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missing_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"document_name" text NOT NULL,
	"reason" text NOT NULL,
	"related_event" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"format" text NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"report_status" "report_status" DEFAULT 'bozza' NOT NULL,
	"synthesis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_documents" ADD CONSTRAINT "missing_documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;