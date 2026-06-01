-- Verifica migration 0028 (stripe_processed_events). Incollare nel SQL editor Supabase.

-- 1. Tabella esiste con la PK corretta
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stripe_processed_events') AS table_exists,
  (SELECT data_type FROM information_schema.columns
     WHERE table_name = 'stripe_processed_events' AND column_name = 'event_id') AS event_id_type;

-- 2. event_id è PRIMARY KEY (idempotenza)
SELECT tc.constraint_type, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'stripe_processed_events' AND tc.constraint_type = 'PRIMARY KEY';

-- 3. Indice su processed_at
SELECT indexname FROM pg_indexes
WHERE tablename = 'stripe_processed_events';

-- 4. Smoke: insert + re-insert deve fallire con unique_violation (23505)
--    (eseguire manualmente se si vuole testare; poi DELETE del test)
-- INSERT INTO stripe_processed_events (event_id, event_type) VALUES ('evt_test_0028', 'test');
-- INSERT INTO stripe_processed_events (event_id, event_type) VALUES ('evt_test_0028', 'test'); -- atteso: errore 23505
-- DELETE FROM stripe_processed_events WHERE event_id = 'evt_test_0028';
