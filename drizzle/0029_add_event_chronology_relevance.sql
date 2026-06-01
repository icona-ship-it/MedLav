-- 0029: per-event flag to include/exclude an event from the EXPORTED chronology.
--
-- Why: the chronology document must contain only events relevant to the case,
-- but we must NEVER hide a potentially-important event automatically. So the
-- default is TRUE (every event is in the chronology) and the perito explicitly
-- opts an event OUT. The event always stays in the general events list — only
-- its presence in the exported "Cronistoria" is controlled by this flag.
--
-- Idempotent: safe to run multiple times.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_relevant_for_chronology BOOLEAN NOT NULL DEFAULT true;
