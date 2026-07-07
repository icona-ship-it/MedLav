# Deploy & Rollback — Runbook

> Procedura operativa per deploy in produzione e ripristino rapido.
> Vedi anche `docs/BACKUP-STRATEGY.md` (dati) e `drizzle/MANUAL_MIGRATIONS.md` (schema).

## Come funziona il deploy

- **Produzione = branch `main`**. Un push su `main` fa scattare l'**auto-deploy Vercel** (progetto LegMed, region fra1).
- Lo sviluppo vive su **`rc-mvp`**. Il cut-over avviene con fast-forward:
  ```
  git checkout main && git merge --ff-only rc-mvp && git push origin main && git checkout rc-mvp
  ```
- La CI GitHub (`ci`, `e2e`) gira sui branch; **finché la branch protection non è attiva, un push su `main` con CI rossa deploya comunque** (vedi Fase 4 del piano di uscita).

## Regola d'oro sulle migration

**Lo schema si applica e si VERIFICA PRIMA del push del codice che lo usa**, mai come effetto collaterale del deploy.

1. Applicare la migration su **staging**, poi `scripts/verify-db-schema.sh` (schema staging == prod atteso).
2. Applicare su **prod** via SQL editor Supabase (finché il re-sync del journal non è completato — vedi `MANUAL_MIGRATIONS.md`; **mai** `pnpm db:migrate` prima del re-sync).
3. Eseguire il `verify_*.sql` della migration.
4. Solo ORA fare il push del codice che dipende dalla nuova colonna/tabella.

> Il codice deve essere **retrocompatibile** con lo schema vecchio per la finestra tra deploy e migration (o migrare prima, deployare dopo).

## Rollback del CODICE (deploy cattivo, schema invariato)

Il più veloce, senza toccare git:

1. **Vercel Dashboard → Deployments** → individua l'ultimo deploy buono → **⋯ → Promote to Production** (Instant Rollback). Ripristina in secondi il build precedente.
2. Poi allinea git così `main` riflette ciò che è live:
   ```
   git checkout main && git reset --hard <sha-buono> && git push origin main --force-with-lease
   ```
   (o `git revert <sha-cattivo>` se preferisci mantenere la storia).

## Rollback che coinvolge lo SCHEMA (migration andata male)

⚠️ Più delicato: il rollback del codice **non** annulla una migration.

1. **Se la migration ha solo AGGIUNTO** (colonna/tabella nuove, nullable): spesso basta il rollback del codice; gli oggetti nuovi restano inerti. Nessuna azione DB urgente.
2. **Se la migration ha rimosso/alterato in modo distruttivo** e i dati sono compromessi:
   - **PITR Supabase** (Dashboard → Database → Backups → Point in Time): ripristina lo stato al minuto **prima** della migration. ⚠️ Sovrascrive lo stato corrente — perdi le scritture successive.
   - In alternativa, restore da backup off-site su staging (`scripts/restore-db.sh`) per estrarre i dati e re-importare selettivamente.
3. Registrare l'incidente e l'RTO reale.

## Kill-switch (fermare le elaborazioni senza rollback)

Per un incidente Mistral/DB o durante una manutenzione, senza redeploy:

- Impostare la env var **`PROCESSING_PAUSED=true`** su Vercel (Production) → l'endpoint di avvio elaborazione risponde 503 "manutenzione". I run già in corso NON vengono toccati.
- Rimuovere/riportare a `false` per riattivare.

## Checklist pre-deploy prod

- [ ] CI verde sul commit (`gh run list --branch rc-mvp`)
- [ ] Se tocca lo schema: migration applicata e verificata su staging **e** prod
- [ ] Se è un cambio che altera l'output del report: rigenerato almeno un caso e ispezionato
- [ ] So qual è lo `<sha>` buono a cui tornare (annotarlo)
