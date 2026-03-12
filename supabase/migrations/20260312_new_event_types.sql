-- Add new event types for non-clinical documents
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'spesa_medica';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'documento_amministrativo';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'certificato';
