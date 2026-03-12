-- Add 'retry' value to extraction_pass enum for retry extraction attempts
ALTER TYPE extraction_pass ADD VALUE IF NOT EXISTS 'retry';
