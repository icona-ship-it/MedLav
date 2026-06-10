-- ============================================================================
-- resync_journal.sql — Riallineamento __drizzle_migrations (2026-06-10)
-- ============================================================================
--
-- SCOPO: registrare nella tracking table di Drizzle le migration 0018→0030
-- applicate a mano via Supabase SQL editor (vedi drizzle/MANUAL_MIGRATIONS.md).
-- Dopo questo script `pnpm db:migrate` torna affidabile: applichera' SOLO le
-- migration con `when` (journal) > MAX(created_at) registrato qui.
--
-- PREREQUISITO OBBLIGATORIO: applicare PRIMA le due migration ancora pendenti
--   1. drizzle/0025_perizie_benchmark.sql      (+ verifica con verify_0025_perizie_benchmark.sql)
--   2. drizzle/0030_storage_bucket_size_limit.sql (+ verifica con verify_0030.sql)
-- perche' questo script le marca come APPLICATE. Entrambe sono idempotenti.
--
-- IDEMPOTENTE: ogni INSERT e' guardato da NOT EXISTS su created_at —
-- ri-eseguirlo non duplica righe. Le righe gia' presenti (0000-0017) vengono
-- saltate.
--
-- NOTA HASH: drizzle calcola hash = sha256(contenuto file .sql). La dedup di
-- `migrate` usa SOLO created_at (= `when` del journal); l'hash e' informativo.
-- Gli hash qui sotto sono calcolati sui file del repo al commit di questo
-- script. NB: la riga 0014 eventualmente gia' presente in DB ha l'hash del
-- vecchio file `0014_rich_nicolaos.sql` (rinominato poi in
-- `0014_add_document_types.sql`) — innocuo, viene saltata dal guard.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS "drizzle";

CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- 0000_goofy_polaris (when = 1771976916762 ≈ 2026-02-24 23:48 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'd096501a422083d1b02a79e31939751ebf0cdc0f194f07cf1de5c0fc80874509', 1771976916762
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1771976916762
);

-- 0001_volatile_luckman (when = 1772022676453 ≈ 2026-02-25 12:31 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '35022b7f63430b94ad3c2544c303c23d866e6c5a98e2399bd511acddb4957747', 1772022676453
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1772022676453
);

-- 0002_rag_guidelines (when = 1772641486000 ≈ 2026-03-04 16:24 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '91c03464613ee3d7bfa54d518dc7169f752e1ab290d6ef410b29ad9ea2158b26', 1772641486000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1772641486000
);

-- 0003_wakeful_songbird (when = 1773163595597 ≈ 2026-03-10 17:26 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'ccffcc596d9d2c6b6b65ad292b11495361a844672583ca0a0f14e2f0e5907287', 1773163595597
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773163595597
);

-- 0004_oval_captain_universe (when = 1773165910673 ≈ 2026-03-10 18:05 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '990dd13140aa5c134219a90620c30ac36939808dc92f66e0c2724f547cba3211', 1773165910673
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773165910673
);

-- 0005_update_rag_rpc (when = 1773231348000 ≈ 2026-03-11 12:15 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'f4b2e96000863102ab21d2600511c1a8d32adf8d26e2b9c8856b4508b480bf9a', 1773231348000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773231348000
);

-- 0006_add_anomaly_types (when = 1773232000000 ≈ 2026-03-11 12:26 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '047deeb30976067432e3fef1855f9c9494ff74b6a91fb04766e9531f7fa9de01', 1773232000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773232000000
);

-- 0007_add_report_ratings (when = 1773233000000 ≈ 2026-03-11 12:43 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'b066d5b28212a84a2c6df4d707d23585169eb9b78932d65ba65751a13109f9e8', 1773233000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773233000000
);

-- 0008_add_case_shares (when = 1773234000000 ≈ 2026-03-11 13:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'da39ec153a5d49df8f3c391fb0eaeb838f8b051c2fa064397836cf34c4df3535', 1773234000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773234000000
);

-- 0009_add_stripe_and_user_prefs (when = 1773235000000 ≈ 2026-03-11 13:16 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'df282d3de5f44f5c346aa390a7a62fc689ff3f0ff37f63c1a7e3d2057c4f6b98', 1773235000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773235000000
);

-- 0010_gdpr_consent (when = 1773245705000 ≈ 2026-03-11 16:15 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'ef2443fd8925eb06b8b725b72d1ee84989fc3734115acf152ffe6cdfa18c815c', 1773245705000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773245705000
);

-- 0011_new_case_types (when = 1773360000000 ≈ 2026-03-13 00:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '6189d5d45bef41216adce8a6dbba6b7b5a945c62782fa029810b92df2faa76b2', 1773360000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773360000000
);

-- 0012_new_event_types (when = 1773490000000 ≈ 2026-03-14 12:06 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'b700a1d391a0fb582d3e13df3fab0a2d258d78652c8e741927ec793d6acb27cb', 1773490000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773490000000
);

-- 0013_aspiring_skrulls (when = 1773362170950 ≈ 2026-03-13 00:36 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '6dc52f534949f08dd38613c1237d0e056d7933fa6772eba6d3ed6da057d314c9', 1773362170950
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773362170950
);

-- 0014_add_document_types (when = 1773433279755 ≈ 2026-03-13 20:21 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '9cb273fc887d8342d0482efe0bdb364686b08e406d0c8daebd137504493c780a', 1773433279755
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773433279755
);

-- 0015_add_anomaly_resolution (when = 1773500000000 ≈ 2026-03-14 14:53 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'a99d56680825052895324a285227a748527efb0ea895457abbc7dee2ce8c33ad', 1773500000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773500000000
);

-- 0016_add_processing_stage (when = 1773600000000 ≈ 2026-03-15 18:40 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'dfce0e791fca79684569ae5852913369903bd221ae2352a331b8195011112fa9', 1773600000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1773600000000
);

-- 0017_lying_sugar_man (when = 1774899608654 ≈ 2026-03-30 19:40 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'b70340b5196d93e8d958ae893ceaf004e17e837ff127f35bc4ecffa4dbdc898f', 1774899608654
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1774899608654
);

-- 0018_add_modules (when = 1775815200000 ≈ 2026-04-10 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'd198f0ff8130d5622129b53bf2d2aa2a7847761374f8e42cee6bc0cb60a2064c', 1775815200000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1775815200000
);

-- 0019_backfill_modules (when = 1775815500000 ≈ 2026-04-10 10:05 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'a2422e64524782894a23c82ff0331a1bee170d8908da0f2d9f4b445c8a738eaa', 1775815500000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1775815500000
);

-- 0020_add_studio_fields (when = 1775988000000 ≈ 2026-04-12 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'b28e42421a6f77344deb39fe4a179d74ae4cbc48f6397b46d603d29a05c231da', 1775988000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1775988000000
);

-- 0021_add_credits (when = 1776160800000 ≈ 2026-04-14 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'c8e54f0a1dd42862c996fe4911100dcdde7d72db7e52ed563a0d3d82bccd68aa', 1776160800000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1776160800000
);

-- 0022_hybrid_rag_bm25 (when = 1777975200000 ≈ 2026-05-05 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'd01934b3fce9f7f9c818212020025d32135cf1c933078aef7f7a886e283c314e', 1777975200000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1777975200000
);

-- 0023_hybrid_rag_multilingua (when = 1778493600000 ≈ 2026-05-11 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'c2debf1fa016ad2bdc50af63182e477a5837397cee52c5dd16242a4832da3a6f', 1778493600000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1778493600000
);

-- 0024_add_document_content_hash (when = 1778497200000 ≈ 2026-05-11 11:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'ae94bfaa37b72157baa18f3d9104894af1642153e5f0b9981d9cc9f017e28e66', 1778497200000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1778497200000
);

-- 0025_perizie_benchmark (when = 1779271200000 ≈ 2026-05-20 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '2732722705e34a578e42d6249b85491048b20e4ca13abbba2feade4f10ae7fb7', 1779271200000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1779271200000
);

-- 0026_rls_user_owned (when = 1780308000000 ≈ 2026-06-01 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '33e6234cdeccb75b2ccb0b4ac3f66d42f74eee859e31892136912ecb4beb3133', 1780308000000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1780308000000
);

-- 0027_audit_archive (when = 1780308600000 ≈ 2026-06-01 10:10 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT 'c49d3d3c5a773694b50ea0b9d33526b35d1a6d8eb98109feaf2e36e831cb9adb', 1780308600000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1780308600000
);

-- 0028_stripe_event_idempotency (when = 1780309200000 ≈ 2026-06-01 10:20 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '066c2ece0a9220ae1ce4b69a12772a5c9fe5d57c5613371e6b92b634d28d5ecf', 1780309200000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1780309200000
);

-- 0029_add_event_chronology_relevance (when = 1780309800000 ≈ 2026-06-01 10:30 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '9508c8ea3669a9dba4e56ad1e7152cca380b47e228befbd23ad00591e08d1d6a', 1780309800000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1780309800000
);

-- 0030_storage_bucket_size_limit (when = 1780394400000 ≈ 2026-06-02 10:00 UTC)
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
SELECT '6d2a73f24ca175c163dfb97c241cc6227ea3a2b24bf1b804206825100b7db0fa', 1780394400000
WHERE NOT EXISTS (
  SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1780394400000
);

-- ── Verifica finale ─────────────────────────────────────────────────────────
-- Atteso: total_rows >= 31 e last_created_at = 1780394400000 (0030).
SELECT count(*) AS total_rows, max(created_at) AS last_created_at
FROM "drizzle"."__drizzle_migrations";
