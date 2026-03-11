-- Migration: Add Stripe subscription fields and user preferences to profiles
-- Batch 4 (Stripe) + Batch 6 (email notifications, is_active)

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "subscription_status" text DEFAULT 'trial';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "subscription_plan" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "subscription_period_end" timestamptz;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
