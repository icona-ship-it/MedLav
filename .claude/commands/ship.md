---
description: Prepara il codice per il deploy. Verifica test, build, sicurezza e genera changelog.
---

Prepara il progetto per il deploy su Vercel.

## Step

1. **Verifica test**: esegui `pnpm test` — TUTTI devono passare
2. **Verifica build**: esegui `pnpm build` — nessun errore
3. **Verifica tipi**: esegui `pnpm typecheck` — nessun errore
4. **Verifica lint**: esegui `pnpm lint` — nessun warning critico
5. **Code review**: esegui /review per verificare sicurezza e qualita
6. **Changelog**: genera un riassunto delle modifiche dall'ultimo deploy
7. **Pre-deploy checklist**: verifica env vars, migration DB, RLS policies

Se tutto passa, conferma che il codice e pronto per il deploy.
Se qualcosa fallisce, segnala il problema e suggerisci la fix.

$ARGUMENTS
