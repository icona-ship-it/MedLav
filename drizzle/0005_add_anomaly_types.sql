-- Add new anomaly types for clinical value validation and sequence validation
ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'valore_clinico_critico';
ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'sequenza_temporale_violata';
