-- Add studio/practice fields to profiles for DOCX/HTML export headers
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS studio_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS studio_phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS studio_pec TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS studio_title TEXT;
