# Migration pronte da applicare — verifica totale 2026-07-12

SQL **idempotenti**, da incollare nel **Supabase SQL editor** (come le altre manual
migration del progetto). NON toccano il journal Drizzle né lo schema TS, quindi
**non interferiscono col re-sync journal in sospeso** (vedi `../MANUAL_MIGRATIONS.md`).
Applicabili in qualsiasi momento, anche prima del re-sync.

| File | Cosa fa | Rischio |
|---|---|---|
| `2026-07-12_fk_indexes.sql` | Indici sulle FK più interrogate (perf sotto carico) | Nullo (IF NOT EXISTS, tabelle piccole) |
| `2026-07-12_fk_indexes_verify.sql` | Verifica: attese 14 righe | Read-only |
| `2026-07-12_report_exports_rls.sql` | Abilita RLS sulla tabella morta `report_exports` | Nullo (nessun consumer) |

## Procedura
1. Backup/PITR attivo (già lo è).
2. Incolla `2026-07-12_fk_indexes.sql` → esegui.
3. Incolla `2026-07-12_fk_indexes_verify.sql` → verifica 14 righe.
4. Incolla `2026-07-12_report_exports_rls.sql` → esegui.

## Da fare DOPO il re-sync journal (non ora, per non far divergere `db:generate`)
- Riflettere questi indici nello schema Drizzle TS (`src/db/schema/*.ts`, terzo
  argomento di `pgTable`) così restano tracciati.
- Aggiungere `stripe_processed_events` allo schema Drizzle (oggi è fuori: drift
  TS/DB, accesso via stringa raw nel webhook). La tabella esiste già in prod
  (migration 0028), va solo dichiarata in TS per parità.

## NON incluso qui (decisione di prodotto)
- **UNIQUE(user_id, code) su `cases`**: il fix di codice (numerazione dal max
  GLOBALE) già sblocca l'onboarding senza migration. Questa migration servirebbe
  SOLO se si volesse tornare alla numerazione per-utente "001, 002…" per ogni
  utente — è una scelta di prodotto, non un requisito tecnico.
