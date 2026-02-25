# MedLav

Web app per medici legali: caricamento documentazione clinica → cronistoria medico-legale strutturata automatica per relazioni peritali.

## Stack & Ambiente

- Runtime: Node.js 22 LTS
- Framework: Next.js 16 (App Router) + React 19 + TypeScript 5.9 (strict)
- Database: Supabase PostgreSQL (EU region - Frankfurt)
- Storage: Supabase Storage (EU region)
- Auth: Supabase Auth (email/password)
- AI/LLM: Mistral API EU (Pixtral Large per OCR, Mistral Large per analisi/estrazione)
- Job Queue: Inngest (background jobs long-running su Vercel)
- ORM: Drizzle ORM
- UI: shadcn/ui + Tailwind CSS v4 + Radix UI
- Validazione: Zod
- Hosting: Vercel (function region EU - fra1)
- Export: docx.js (DOCX), Papa Parse (CSV), HTML nativo

## Comandi

- Dev: `pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`
- Type check: `pnpm typecheck`
- DB migrate: `pnpm db:migrate`
- DB generate: `pnpm db:generate`

## Struttura Progetto

- `/src` — Codice sorgente (Next.js App Router)
- `/docs` — Documentazione di progetto (leggere PRIMA di task complesse)
- `/docs/REQUIREMENTS.md` — Requisiti funzionali dettagliati dell'app
- `/scratchpad` — Area note temporanee di Claude

## Principi di Decisione

Claude ha piena autonomia su architettura e implementazione. Quando deve decidere:

1. Privilegiare semplicita e manutenibilita
2. Scegliere soluzioni battle-tested (no bleeding edge senza motivo)
3. Scrivere codice che si auto-documenta
4. Ogni decisione rilevante va loggata in `docs/ARCHITECTURE-DECISIONS.md`
5. **Immutabilita**: creare sempre nuovi oggetti, mai mutare (spread operator)
6. **Sicurezza GDPR**: dati sanitari sensibili — crittografia, RLS, audit log, no dati in chiaro nei log

## Workflow

1. **Prima di iniziare qualsiasi task complessa**, leggere i file rilevanti in `/docs`
2. Per task nuove, scrivere un piano in `/scratchpad/plan-[nome].md` prima di codificare
3. Committare con messaggi conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
4. Dopo ogni milestone, aggiornare `docs/ARCHITECTURE-DECISIONS.md`
5. **TDD**: scrivere test PRIMA dell'implementazione (RED → GREEN → REFACTOR)
6. **Code Review**: verificare sicurezza e qualita dopo ogni modifica significativa

## Architettura Core

```
Browser → Vercel (Next.js 16) → Supabase (EU) + Inngest (Jobs) + Mistral API (EU)
```

Pipeline elaborazione documenti (Inngest steps):
Upload → Download → OCR (Mistral Pixtral) → Estrazione eventi (Mistral Large) → Validazione → Report

## IMPORTANTE: Cosa NON fare

- NON leggere file non necessari al task corrente
- NON generare codice boilerplate quando un generatore/CLI esiste
- NON chiedere permesso per decisioni tecniche — decidere e documentare
- NON duplicare logica — se qualcosa esiste gia, riusarla
- NON usare `any` in TypeScript — mai
- NON loggare dati sensibili (nomi pazienti, dati clinici) — usare ID/codici
- NON committare file .env, secrets, o node_modules
- NON usare console.log in codice di produzione
