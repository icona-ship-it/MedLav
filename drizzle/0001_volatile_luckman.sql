CREATE TYPE "public"."extraction_pass" AS ENUM('both', 'pass1_only', 'pass2_only');--> statement-breakpoint
CREATE TABLE "event_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"image_path" text NOT NULL,
	"page_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_text" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "source_pages" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "extraction_pass" "extraction_pass";--> statement-breakpoint
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;