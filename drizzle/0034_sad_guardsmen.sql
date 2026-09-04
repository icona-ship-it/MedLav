-- 0034: ambito temporale di un evento (feedback medici 2026-08-19 Mail 2 +
-- collaudo 2026-09-04): un referto di visita di 3 pagine veniva esploso in
-- 12 eventi cronologici (visita + 8 fatti anamnestici + 1 esame programmato)
-- con intestazione-blocco "dal 27.02 al 18.06". Il campo distingue ciò che
-- ACCADE nel documento (corrente) da ciò che vi è RIFERITO (retrospettivo) o
-- PREVISTO (programmato). Non elimina mai un evento: pilota la resa
-- (sotto-elenco "riferito nel documento") e, per i soli 'programmato', i
-- calcoli medico-legali.
--
-- Default 'corrente' = comportamento storico: nessuna riga esistente cambia
-- posto o sparisce. text + CHECK invece di pgEnum: idempotente, niente ALTER TYPE.
-- Idempotent: safe to run multiple times.
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "temporal_scope" text DEFAULT 'corrente' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_temporal_scope_check'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_temporal_scope_check"
      CHECK ("temporal_scope" IN ('corrente', 'retrospettivo', 'programmato'));
  END IF;
END $$;
