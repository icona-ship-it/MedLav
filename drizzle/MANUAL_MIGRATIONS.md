# Manual Migrations — Stato journal Drizzle

**Stato al 2026-06-10**: il journal `drizzle/meta/_journal.json` include ORA
tutte le migration `0000` → `0030` (incluse quelle scritte a mano). Lo snapshot
`meta/0030_snapshot.json` riflette lo schema Drizzle TS corrente (verificato:
`pnpm db:generate` → "No schema changes"). Resta UN passo manuale per chiudere
il debt: eseguire `drizzle/resync_journal.sql` su Supabase (vedi sotto).

## Come completare il re-sync (azione utente, ~10 min)

1. **Backup**: verificare che il PITR Supabase sia attivo (o fare un dump manuale)
2. **Applicare le 2 migration ancora pendenti** via Supabase SQL editor
   (entrambe idempotenti):
   - `0025_perizie_benchmark.sql` → verificare con `verify_0025_perizie_benchmark.sql`
   - `0030_storage_bucket_size_limit.sql` → verificare con `verify_0030.sql`

   Nota: la **0031_storage_bucket_allowed_mime_types** è stata APPLICATA il
   2026-06-11 (utente, via SQL editor — sblocco upload XML/TXT/WebP; il bucket
   era stato creato a mano con una allowlist più stretta dei validatori app).
   Verificare con `verify_0031.sql`. Il journal e `resync_journal.sql`
   includono già la 0031: dopo il re-sync, `pnpm db:migrate` non la riapplica
   (e se la riapplicasse è idempotente — guard sul contenuto).
3. **Eseguire `drizzle/resync_journal.sql`** via Supabase SQL editor
   (idempotente, ri-eseguibile). Inserisce in `drizzle.__drizzle_migrations` le
   righe mancanti 0018→0030 con `created_at` = `when` del journal e hash
   sha256 dei file. Output atteso del check finale: `total_rows >= 31`,
   `last_created_at = 1780394400000`
4. **Aggiornare questa tabella** (segnare 0025 e 0030 come applicate) e MEMORY.md

Dopo il passo 3, `pnpm db:migrate` torna affidabile: applica solo migration con
`when` maggiore dell'ultimo `created_at` registrato (algoritmo drizzle: confronta
solo `MAX(created_at)`; l'hash e' informativo).

## Cosa è stato fatto nel repo (2026-06-10)

- `meta/_journal.json`: aggiunte le entry 0018→0030 (con `when` crescenti,
  ~date di applicazione reali) e **corretto il tag 0014**: era
  `0014_rich_nicolaos` ma il file su disco e' `0014_add_document_types.sql`
  (senza fix, `pnpm db:migrate` falliva con ENOENT)
- `meta/0030_snapshot.json`: snapshot dello schema TS corrente (generato in
  sandbox con drizzle-kit, poi rinominato). I snapshot intermedi 0018-0029 non
  esistono e NON servono: drizzle-kit usa solo l'ultimo snapshot per il diff
  (verificato — il meta storico aveva gia' "buchi": mancano 0004-0012, 0015, 0016)
- `resync_journal.sql`: INSERT idempotenti (guard `NOT EXISTS` su `created_at`)
  per tutte le 31 entry — le righe 0000-0017 gia' presenti vengono saltate
- Verificato in sandbox + sul repo reale: `pnpm db:generate` → "No schema
  changes, nothing to migrate" (la prossima migration generata sara' `0031_*`)
- **Fix `.gitignore`**: `drizzle/meta/` era ignorato — gli snapshot esistevano
  SOLO su questa macchina (solo `_journal.json` era force-tracked). Rimossa la
  regola: al prossimo commit vanno aggiunti tutti i file `drizzle/meta/*.json`
  (senza gli snapshot lo schema non e' ricostruibile dal repo)

## Limite NON verificato (serve un DB di staging)

La **ricostruzione da zero** (`pnpm db:migrate` su un DB vuoto) non e' stata
testata: richiede un database reale. Due caveat noti:

1. Le migration manuali 0018-0030 non contengono `--> statement-breakpoint`:
   drizzle le esegue come UNA singola query multi-statement. Con il driver
   postgres-js dovrebbe funzionare (simple query protocol per query senza
   parametri), ma va PROVATO su staging prima di fidarsi del rebuild
2. Alcune migration assumono un progetto **Supabase** (schema `storage`,
   ruolo `authenticated`, estensione pgvector): il rebuild target deve essere
   un progetto Supabase, non un Postgres nudo

→ Checklist rebuild staging: nuovo progetto Supabase → `DATABASE_URL` di
staging in `.env` → `pnpm db:migrate` → confrontare lo schema con prod
(`scripts/verify-db-schema.sql`). Se le multi-statement falliscono, aggiungere
`--> statement-breakpoint` tra gli statement dei file 0018-0030 (NON dentro i
blocchi `DO $$`) — innocuo per prod, la dedup usa solo `created_at`.

## Migration applicate manualmente (storico)

| File | Applicata il | Idempotente | Verifica |
|------|--------------|-------------|----------|
| `0018_add_modules.sql` | apr 2026 | si (`IF NOT EXISTS`, `CREATE TYPE` dentro `DO $$`) | controllare `cases.module_id` colonna esiste |
| `0019_backfill_modules.sql` | apr 2026 | si (UPDATE `WHERE module_id IS NULL`) | controllare nessun caso ha `module_id IS NULL` |
| `0020_add_studio_fields.sql` | apr 2026 | si (`ADD COLUMN IF NOT EXISTS`) | controllare `profiles.studio_address` esiste |
| `0021_add_credits.sql` | apr 2026 | si (`CREATE TABLE IF NOT EXISTS`) | controllare table `user_credits` esiste |
| `0022_hybrid_rag_bm25.sql` | 2026-05-05 | parzialmente (DROP FUNCTION + CREATE) | verificato via 5 query SQL |
| `0023_hybrid_rag_multilingua.sql` | 2026-05-11 | parzialmente (DROP COLUMN + ADD) | usare `verify_0023_hybrid_rag_multilingua.sql` |
| `0024_add_document_content_hash.sql` | 2026-05-11 | si | usare `verify_0024_add_document_content_hash.sql` |
| `0025_perizie_benchmark.sql` | **DA APPLICARE — prerequisito del re-sync (passo 2)** | si (`CREATE TABLE IF NOT EXISTS`, RLS, RPC) | usare `verify_0025_perizie_benchmark.sql` |
| `0026_rls_user_owned.sql` | APPLICATA 2026-06-01 (testata in BEGIN…ROLLBACK; 2 bug colonne corretti pre-applicazione) | si | verificata via `pg_policies` |
| `0027_audit_archive.sql` | APPLICATA 2026-06-01 | si | `to_regclass('public.audit_archive')` non-null, RLS=true |
| `0028_stripe_event_idempotency.sql` | APPLICATA 2026-06-01 (+ ENABLE RLS) | si | tabella esiste, RLS=true |
| `0029_add_event_chronology_relevance.sql` | APPLICATA 2026-06-01 | si | usare `verify_0029_event_chronology_relevance.sql` |
| `0030_storage_bucket_size_limit.sql` | **DA APPLICARE — prerequisito del re-sync (passo 2)** | si (`UPDATE` puntuale) | usare `verify_0030.sql` (atteso `104857600`) |
| `0031_*` (future) | — | vedi procedura sotto | — |

## Procedura per future migration (DOPO il re-sync)

Una volta eseguito `resync_journal.sql` su Supabase:

1. Modificare lo schema TS in `src/db/schema/`
2. `pnpm db:generate` → crea `drizzle/0031_<nome>.sql` + snapshot + journal entry
3. Rivedere il SQL generato (drizzle non sa di RLS/policy/RPC: aggiungerle a
   mano nel file se servono, PRIMA di applicare)
4. `pnpm db:migrate` (con `DATABASE_URL` di produzione in `.env`) — oppure
   incollare il file su Supabase SQL editor E POI registrare la riga in
   `__drizzle_migrations` (hash sha256 del file, created_at = `when` del journal)
5. Aggiornare questa tabella

**FINCHE' il re-sync non e' stato eseguito**: NON lanciare `pnpm db:migrate`
(proverebbe ad applicare 0018→0030 in blocco perche' la tracking table e' ferma
a 0017 — i file sono idempotenti ma e' un rischio inutile su prod). Continuare
con la vecchia procedura manuale (SQL editor + verify file + tabella qui sopra).
