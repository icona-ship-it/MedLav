-- Migration 0030: allinea il limite di dimensione del bucket Storage 'documents'.
--
-- L'app rifiuta i file > 100 MB lato server (saveDocumentMetadata controlla la
-- dimensione REALE del blob, non quella dichiarata dal client). Ma se il bucket
-- Storage consente upload più grandi (es. 500 MB o nessun limite), un client
-- malevolo può comunque PIAZZARE in Storage un file enorme prima del nostro
-- controllo applicativo, consumando banda/spazio e — se mai sfuggisse a un check —
-- costo OCR. Allineare il limite del bucket a 100 MB sposta il rifiuto al confine
-- di Storage (prima del nostro codice), così l'upload del file gigante fallisce
-- subito. Difesa-in-profondità coerente col cap applicativo.
--
-- 100 MB = 104857600 byte.
--
-- Idempotente: UPDATE puntuale, sicuro da rilanciare.
-- Applica via Supabase SQL editor (vedi drizzle/MANUAL_MIGRATIONS.md).
-- Verifica con: drizzle/verify_0030.sql

UPDATE storage.buckets
SET file_size_limit = 104857600  -- 100 MB
WHERE id = 'documents';
