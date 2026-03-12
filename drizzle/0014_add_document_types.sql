-- Add new document types for legal and financial documents
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'spese_mediche';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'memoria_difensiva';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'perizia_ctp';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'perizia_ctu';
