# Checklist di rilascio — LegMed (rc-mvp → main)

Cadenza: **un rilascio a settimana** (o prima, se un fix per i medici è pronto). Un fix fermo in
locale per settimane non esiste per i medici: la produzione è ciò che vedono (lezione 2026-08/09:
i fix del 19/08 sono arrivati in produzione dopo 16 giorni).

## Prima del push su `main`

1. **Checklist meccanica** (tutto verde, nessuna eccezione): `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`.
2. **Giro avversariale già fatto PER FIX** (`.claude/rules/definition-of-done.md`): nessun commit senza.
3. **Migration**: se il rilascio ne porta una, è già applicata su Supabase (`drizzle/MANUAL_MIGRATIONS.md`, `verify_*.sql` ok) e il codice ha il fallback se la colonna manca.
4. **Gate gold** (obbligatorio se il rilascio tocca prompt, estrazione, consolidamento, calcoli, tabelle, export): rigenerare i 3 casi gold (GOLD-2026-A/B/C: copie con eventi ad ambito temporale, `scripts` locali) → skill `confronto-rc-gold` → `pnpm gate:rc`. La scorecard `benchmark/scores/rc-gate-<data>.md` va citata nel messaggio di rilascio con i tre punteggi, anche se rossi: il numero è la verità, non un ostacolo.
5. **`PIPELINE_CHANGED_AT`** aggiornato all'ora prevista del deploy se l'output della pipeline cambia (`.claude/rules/code-style.md`).
6. **Smoke e2e** sul build di produzione locale (`pnpm build` con dev spento → `pnpm start` → `pnpm test:e2e`): il caso dimostrativo, gli export e l'anonimizzato devono passare.
7. **ADR** scritto per ogni decisione di prodotto (`docs/ARCHITECTURE-DECISIONS.md`).

## Rilascio

```
git push origin rc-mvp          # CI verde (obbligatorio)
git push origin rc-mvp:main     # Vercel builda main → produzione (founder)
```

## Dopo il deploy (entro 10 minuti)

- `GET /api/health` → `build.sha` = ultimo commit; footer "LegMed · versione <sha>".
- Aprire un caso reale completato: banner "riavvia l'analisi" presente solo se il rilascio cambia l'output.
- Caso dimostrativo (bottone in dashboard) → export HTML con trascrizione e appendice.
- Messaggio ai beta tester con: cosa cambia per loro, quali casi rielaborare, i tre punteggi del gate.

## Se qualcosa non torna

Rollback = `git push origin <sha-precedente>:main` (mai force push su main). Le migration sono
idempotenti e additive: non vanno mai ritirate in un rollback.
