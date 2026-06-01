-- Verifica 0029 — incollare nel SQL editor di Supabase.
-- Atteso: una riga → is_relevant_for_chronology | boolean | NO | true
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'events'
  AND column_name = 'is_relevant_for_chronology';

-- Atteso: 0 → nessun evento esistente con flag NULL (il default true ha riempito tutto).
SELECT count(*) AS eventi_con_flag_null
FROM events
WHERE is_relevant_for_chronology IS NULL;
