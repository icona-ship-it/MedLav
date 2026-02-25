---
name: deploy
description: Workflow per deploy di MedLav su Vercel + Supabase. Usare quando si prepara un rilascio.
---

# Deploy Workflow

## Pre-Deploy Checklist

- [ ] Tutti i test passano (`pnpm test`)
- [ ] Build senza errori (`pnpm build`)
- [ ] Type check pulito (`pnpm typecheck`)
- [ ] Lint pulito (`pnpm lint`)
- [ ] Nessun `console.log` nel codice
- [ ] Nessun dato sensibile hardcodato
- [ ] Variabili d'ambiente documentate
- [ ] Migration database pronte (`pnpm db:generate`)

## Step 1: Database
1. Verificare migration Drizzle pendenti
2. Eseguire migration su Supabase staging (se disponibile)
3. Verificare RLS policies attive su tutte le tabelle

## Step 2: Environment Variables
1. Verificare che tutte le env vars siano configurate su Vercel
2. Env vars richieste:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MISTRAL_API_KEY`
   - `INNGEST_EVENT_KEY`
   - `INNGEST_SIGNING_KEY`

## Step 3: Deploy
1. Push su branch main
2. Vercel build automatico
3. Verificare deploy logs
4. Test smoke su produzione

## Step 4: Post-Deploy
1. Verificare che le API rispondano
2. Verificare che Inngest riceva eventi
3. Verificare upload e elaborazione documenti
4. Aggiornare `docs/ARCHITECTURE-DECISIONS.md` se cambiamenti infra
