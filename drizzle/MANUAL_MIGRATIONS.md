# Manual Migrations — Drizzle Journal Disallineato

**Stato al 2026-05-11**: il journal `drizzle/meta/_journal.json` e' fermo a
`0017_lying_sugar_man`. Le migration `0018` → `0023` sono state scritte a
mano (non generate via `pnpm db:generate`) e applicate **manualmente** via
Supabase SQL editor — NON sono nella table `__drizzle_migrations` di Drizzle.

## Conseguenze pratiche

- `pnpm db:migrate` non applica e non riconosce queste migration. Lanciarlo
  oggi non rompe nulla (le migration usano `IF [NOT] EXISTS` ovunque, quindi
  sono idempotenti), ma non aggiorna nemmeno la `__drizzle_migrations` table.
- `pnpm db:generate` confronta lo schema Drizzle attuale con l'ultimo
  snapshot in `meta/0017_snapshot.json`. Se generi una nuova migration adesso
  potrebbe ri-includere cambi gia' applicati a mano. **Verifica sempre il
  diff prima di committare.**

## Migration applicate manualmente

| File | Applicata il | Idempotente | Verifica |
|------|--------------|-------------|----------|
| `0018_add_modules.sql` | apr 2026 | si (`IF NOT EXISTS`, `CREATE TYPE` dentro `DO $$`) | controllare `cases.module_id` colonna esiste |
| `0019_backfill_modules.sql` | apr 2026 | si (UPDATE `WHERE module_id IS NULL`) | controllare nessun caso ha `module_id IS NULL` |
| `0020_add_studio_fields.sql` | apr 2026 | si (`ADD COLUMN IF NOT EXISTS`) | controllare `profiles.studio_address` esiste |
| `0021_add_credits.sql` | apr 2026 | si (`CREATE TABLE IF NOT EXISTS`) | controllare table `user_credits` esiste |
| `0022_hybrid_rag_bm25.sql` | 2026-05-05 | parzialmente (DROP FUNCTION + CREATE) | verificato via 5 query SQL |
| `0023_hybrid_rag_multilingua.sql` | 2026-05-11 | parzialmente (DROP COLUMN + ADD) | usare `verify_0023_hybrid_rag_multilingua.sql` |
| `0024_add_document_content_hash.sql` | **DA APPLICARE** | si (`ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`) | usare `verify_0024_add_document_content_hash.sql` |

## Procedura per future migration

**Decisione**: continuare ad usare la procedura manuale finche' non si
risincronizza il journal in modo controllato. Prima di scrivere una nuova
migration:

1. Scrivila a mano in `drizzle/00XX_descrittivo.sql` con `IF [NOT] EXISTS`
   ovunque possibile (idempotente)
2. Aggiungi un file `drizzle/verify_00XX_descrittivo.sql` con CASE WHEN
   checks per ogni oggetto creato/modificato
3. Applica via Supabase SQL editor
4. Lancia il file di verifica e conferma OK su tutti i check
5. Aggiorna **questa tabella** con data e link al verify
6. Aggiorna `MEMORY.md` con stato

**NON lanciare** `pnpm db:migrate` finche' la `__drizzle_migrations` table
non e' allineata. Per sincronizzare bisognerebbe:
- Calcolare l'hash che Drizzle si aspetta per ogni file (algoritmo interno
  drizzle-kit, non triviale da replicare)
- INSERT manuale di 6 righe in `__drizzle_migrations` con quegli hash
- Aggiornare `_journal.json` con le 6 entry mancanti

Da fare in una sessione dedicata, separata, con backup completo del DB
prima.

## Quando rigenerare il journal

Trigger ragionevoli:
- Onboarding di un secondo developer sul progetto
- Setup di un environment di staging che debba ripartire da zero
- Migrazione del DB Supabase a una nuova istanza

Finche' siamo single-user su una sola istanza Supabase production, il debt
e' tollerabile. Documentato qui per visibilita'.
