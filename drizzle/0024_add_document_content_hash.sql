-- Wave D.2 (post-Lavini hardening): dedup uploads via SHA-256 content hash.
-- Prevents the perito from accidentally double-uploading the same cartella
-- clinica (race condition: two clicks, same file in two folders, etc.) which
-- would inflate event counts ~200% and skew ITT/ITP calculations.
--
-- The hash is calculated client-side (Web Crypto API) before upload, then
-- re-checked server-side on insert. The partial UNIQUE index protects against
-- race conditions at the DB layer.
--
-- Backward-compat: documents created before this migration have NULL
-- content_hash. They are not deduplicated (impossible without re-downloading
-- + re-hashing every existing file from Storage, which is not worth it).
-- Future uploads will all carry a hash.

-- 1. Add content_hash column. NULLABLE for backward-compat with pre-existing docs.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content_hash text;

-- 2. Partial UNIQUE index: enforces (case_id, content_hash) uniqueness only
--    for rows where content_hash is set. Existing NULL rows are not affected.
--    This is the safety net for race conditions where two simultaneous
--    uploads of the same file slip past the application-level check.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_case_content_hash_unique
  ON documents(case_id, content_hash)
  WHERE content_hash IS NOT NULL;
