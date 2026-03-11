-- GDPR consent fields for profiles table
-- Tracks when user accepted terms, which privacy policy version, and data retention preference

ALTER TABLE profiles ADD COLUMN gdpr_consent_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN privacy_policy_version TEXT;
ALTER TABLE profiles ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN data_retention_days INTEGER DEFAULT 365;

-- Add comments for documentation
COMMENT ON COLUMN profiles.gdpr_consent_at IS 'Timestamp when user gave GDPR Art. 9 consent for health data processing';
COMMENT ON COLUMN profiles.privacy_policy_version IS 'Version of privacy policy accepted by user (e.g. 2026-03-11)';
COMMENT ON COLUMN profiles.terms_accepted_at IS 'Timestamp when user accepted Terms of Service';
COMMENT ON COLUMN profiles.data_retention_days IS 'User-chosen data retention period in days (default 365)';
