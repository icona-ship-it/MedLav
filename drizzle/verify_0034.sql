-- Verifica idempotente migration 0034 (ambito temporale eventi).
-- Attese: 1 colonna text NOT NULL default 'corrente' + 1 CHECK. Incollare nel SQL editor.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'temporal_scope'
      AND is_nullable = 'NO' AND column_default LIKE '''corrente''%') AS colonna_attesa_1,
  (SELECT count(*) FROM pg_constraint
    WHERE conname = 'events_temporal_scope_check') AS check_atteso_1,
  (SELECT count(*) FROM events WHERE temporal_scope NOT IN ('corrente', 'retrospettivo', 'programmato')) AS righe_fuori_enum_attese_0;
