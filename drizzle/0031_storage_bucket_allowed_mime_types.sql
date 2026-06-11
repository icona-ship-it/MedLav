-- Migration 0031: allinea la allowlist MIME del bucket Storage 'documents'
-- ai formati accettati dall'applicazione.
--
-- Il bucket era stato creato a mano sul dashboard con una allowlist che NON
-- includeva i formati testo (text/xml, application/xml, text/plain — supporto
-- aggiunto il 2026-06-11 per i referti HL7/CDA e i file del fascicolo
-- telematico) né image/webp (già accettato dai validatori server in
-- src/lib/file-validators.ts). Risultato: Storage rifiutava l'upload PRIMA
-- del nostro codice, con un "errore imprevisto" generico in UI.
--
-- La difesa in profondità resta: la allowlist del bucket continua a esistere
-- (non viene azzerata) e i validatori applicativi (MIME + magic bytes/check
-- testo) restano il controllo principale.
--
-- Idempotente: il WHERE esclude il rilancio se i tipi sono già presenti.
-- Applica via Supabase SQL editor (vedi drizzle/MANUAL_MIGRATIONS.md).
-- Verifica con: drizzle/verify_0031.sql

UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY['text/xml','application/xml','text/plain','image/webp']
WHERE id = 'documents'
  AND NOT (allowed_mime_types @> ARRAY['text/xml']);
