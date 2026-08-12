# LegMed

Web app per medici legali: upload documentazione clinica → report medico-legale strutturato automatico.

## Stack

- **Runtime**: Node.js 22 LTS, Next.js 15 (App Router), React 19, TypeScript 5.9 strict
- **Database**: Supabase PostgreSQL EU (Frankfurt) + pgvector per RAG
- **Auth**: Supabase Auth (email/password, email verification, password reset)
- **AI**: Mistral API EU — Vision (`pixtral-large-latest`), OCR (`mistral-ocr-latest`), Estrazione/Classificazione/Sintesi (`mistral-large-latest`), Embedding (`mistral-embed`)
- **Jobs**: Inngest (pipeline long-running su Vercel)
- **Payments**: Stripe | **Email**: Resend | **Rate Limiting**: Upstash Redis | **Monitoring**: Sentry
- **ORM**: Drizzle ORM | **UI**: shadcn/ui + Tailwind v4 | **Validazione**: Zod
- **Hosting**: Vercel (fra1) | **Export**: docx.js, Papa Parse, HTML

## Comandi

`pnpm dev` | `pnpm build` | `pnpm test` | `pnpm lint` | `pnpm typecheck` | `pnpm db:migrate` | `pnpm db:generate`

## Database / Migration — IMPORTANTE

**Re-sync journal Drizzle ESEGUITO su Supabase il 2026-07-20** (verificato: `drizzle.__drizzle_migrations` = 32 righe, ultima = 0031). `pnpm db:migrate` è di nuovo il workflow normale.

- **Workflow migration**: modificare `src/db/schema/`, `pnpm db:generate` (rivedere il SQL generato: RLS/policy/RPC vanno aggiunte a mano nel file), applicare, aggiornare `MANUAL_MIGRATIONS.md`
- **Connessione DB da locale/CI**: l'host diretto `db.<ref>.supabase.co` è IPv6-only (ENOTFOUND da reti IPv4) e la password contiene caratteri URL-speciali → usare il **Session pooler** `aws-1-eu-central-1.pooler.supabase.com:5432` con utente `postgres.<ref>` e password percent-encoded (helper gitignored: `scripts/pooler-url-tmp.ts`). Dettagli in `MANUAL_MIGRATIONS.md`
- **Rebuild da zero NON ancora testato** (serve staging): caveat multi-statement + dipendenze Supabase documentati in `MANUAL_MIGRATIONS.md`
- **Verifica idempotente**: ogni migration manuale ha un file `verify_*.sql` da incollare nel SQL editor (es. `verify_0030.sql`)

## Architettura

```
Browser → Vercel (Next.js) → Supabase (EU) + Inngest (Jobs) + Mistral API (EU)

Pipeline: Upload → OCR → Classificazione → Estrazione → Consolidamento → Immagini → Anomalie → Calcoli → Sintesi → Report
```

### Mappa codice sorgente (`src/`)

| Directory | Scopo | File chiave |
|-----------|-------|-------------|
| `app/(auth)/` | Login, registrazione, forgot-password | `actions.ts` (signUp, signIn, resetPassword) |
| `app/(dashboard)/` | Dashboard, casi, impostazioni | `actions.ts` (CRUD casi/eventi/documenti), `cases/[id]/client.tsx` (UI caso) |
| `app/(admin)/` | Admin panel (stats, audit, processing) | `actions.ts` |
| `app/api/processing/` | API start/cancel/regenerate/regenerate-section/confirm-classification | Trigger Inngest, regen report |
| `app/api/cases/[id]/export/` | Export HTML, DOCX, CSV | Usa `services/export/` |
| `app/api/cases/[id]/images/` | Proxy immagini OCR da Supabase Storage (auth + ownership) | `route.ts` |
| `app/api/admin/guidelines/` | CRUD linee guida RAG | GET/POST/DELETE |
| `app/api/stripe/` | Checkout, portal, webhook Stripe | Pagamenti e subscriptions |
| `app/api/report-ratings/` | Rating qualità report | POST rating |
| `inngest/functions/` | **Pipeline principale** (13 step logici) | `process-case.ts` |
| `services/ocr/` | OCR Mistral (PDF, immagini, DOCX) con estrazione immagini base64 | `ocr-service.ts`, `ocr-types.ts` |
| `services/classification/` | Auto-classificazione tipo documento (Mistral Large) | `document-classifier.ts` |
| `services/extraction/` | Estrazione eventi da testo OCR | `extraction-service.ts`, `extraction-prompts.ts` |
| `services/synthesis/` | Generazione report medico-legale + validazione qualità + prompt versioning | `synthesis-service.ts`, `synthesis-prompts.ts`, `role-prompts.ts`, `case-type-templates.ts`, `report-validator.ts`, `prompt-version.ts` |
| `services/validation/` | Anomalie, doc mancanti, source verification | `anomaly-detector.ts`, `missing-doc-detector.ts`, `source-text-verifier.ts` |
| `services/consolidation/` | Merge eventi, dedup cross-doc | `event-consolidator.ts` |
| `services/calculations/` | ITT, ITP, giorni ricovero | `medico-legal-calc.ts` |
| `services/image-analysis/` | Analisi immagini diagnostiche (RX, TAC, RM) con Pixtral, storagePath per embedding | `diagnostic-image-analyzer.ts` |
| `services/rag/` | RAG linee guida (embedding, retrieval) | `retrieval-service.ts`, `ingestion-service.ts` |
| `services/export/` | Generazione HTML/DOCX/CSV + risoluzione immagini OCR | `html-export.ts`, `docx-export.ts`, `image-resolver.ts`, `markdown-to-html.ts` |
| `services/anonymization/` | Pseudonimizzazione GDPR dati nel report | `anonymizer.ts` |
| `services/email/` | Notifiche email (Resend) | `email-service.ts` |
| `lib/mistral/` | Client Mistral (retry, circuit breaker, streaming, semaforo) | `client.ts` |
| `lib/domain-knowledge/` | Knowledge base statica (nesso causale, framework, case-type) | `index.ts`, `case-type/*.ts` |
| `lib/supabase/` | Client Supabase (server, admin, middleware, storage) | |
| `lib/stripe/` | Client Stripe (checkout, portal, webhook) | `client.ts` |
| `lib/logger.ts` | Logging centralizzato con sanitizzazione dati sensibili | |
| `db/schema/` | Schema Drizzle (11 tabelle, reports ha `generation_metadata` JSONB) | `cases.ts`, `events.ts`, `documents.ts`, `reports.ts`, `anomalies.ts`, `guidelines.ts`, `profiles.ts`, `audit.ts`, `event-images.ts`, `case-shares.ts`, `report-ratings.ts` |
| `lib/user-error-messages.ts` | Messaggi errore user-friendly (13 pattern → italiano) | |
| `components/` | UI components (shadcn + custom) | `error-boundary.tsx`, `cookie-consent.tsx`, `onboarding-dialog.tsx`, `markdown-preview.tsx` (con supporto immagini OCR), `linked-report-viewer.tsx` |
| `app/(dashboard)/cases/[id]/` | UI caso: report editor, skeleton, form perizia (con bozza locale) | `report-step.tsx`, `report-skeleton.tsx`, `perizia-form.tsx`, `use-perizia-draft.ts` |

### Pipeline elaborazione (`process-case.ts` — 13 step logici Inngest)

1. **fetch-case-metadata** → carica caso + documenti da DB
2. **ocr-doc-{id}** → OCR tutti i documenti in parallelo (Mistral OCR, Promise.all) + salva immagini estratte su Supabase Storage (`ocr-images/{docId}/p{N}-f{M}.png`) + aggiorna `pages.image_path`
3. **classify-doc-{id}** → auto-classificazione documenti in PARALLELO (un step per doc), cambia tipo solo per "altro" (Mistral Large, step 2.5)
4. **plan-chunks + extract-batch-{idx}** → chunking (20 pagine/chunk, 30K chars max) + estrazione eventi per batch (parallelo, 3 chunk/batch)
5. **consolidate-events** → ordina cronologicamente, dedup cross-doc, rinumera
6. **link-images-to-events** → collega immagini a eventi via `sourcePages` ↔ `pages.image_path`, popola `event_images`
7. **analyze-diagnostic-images** → analisi immagini diagnostiche con Pixtral (step 4.6), restituisce `storagePath` per embedding nel report
8. **detect-anomalies** → 7 tipi anomalie (algoritmico, no LLM)
9. **detect-missing-documents** → documenti mancanti attesi per tipo caso
10. **calculate-periods** → calcoli medico-legali (ITT, ITP, giorni ricovero)
11. **generate-report** → report sezionale per ruolo (CTU 11 sez, CTP 10, Stragiudiziale 7) allineato ai benchmark perizie reali. **Su `rc-mvp` è attivo SOLO il ruolo `stragiudiziale`** (enforcement lato server: `caseRoleSchema = z.enum(['stragiudiziale'])`); CTU/CTP vivono su `main`. Placeholder per sezioni che il perito compila. NO [Ev.N]. RAG linee guida + calcoli + immagini. Report troncati bloccati (throw error, Inngest retries).
12. **finalize** → marca completato, audit log
13. **send-notification** → email notifica completamento (Resend)

### Struttura report per ruolo (section-catalog.ts) — allineata benchmark 2026-05-04

| Ruolo | Sezioni | LLM | Placeholder | Note |
|-------|---------|-----|-------------|------|
| CTU | 11 | 8 (condizionali) | 3 (Operazioni Peritali, Considerazioni ML, Osservazioni Bozza) | Include Quesiti. Risposte ai Quesiti integrate dentro Considerazioni ML. |
| CTP | 10 | 8 | 2 (come CTU senza Osservazioni Bozza) | Stesso schema CTU senza valutazione osservazioni. |
| Stragiudiziale | 7 | 6 | 1 (Visita Clinica) | Schema Antoniazzi: Intestazione, Anamnesi, Fatto+Storia, Doc Sanitaria, Spese, Visita Clinica, Epicrisi (finale). |

**Epicrisi** = solo in stragiudiziale, sintesi fatti + ITT/ITP (perito aggiunge giudizi). Nei CTU/CTP la sintesi entra in Considerazioni ML (placeholder).
**Considerazioni Medico-Legali (CTU/CTP)** = placeholder unico che contiene: sintesi clinica, analisi nesso/condotta, valutazione danno, risposte ai quesiti del giudice.
**Operazioni Peritali (CTU/CTP)** = placeholder unico che contiene: verbale operazioni + visita del periziando (allineato benchmark "I Dati dell'Incontro con le Parti").
**NO [Ev.N]** = citazioni per tipo documento, autore e data.
**Token budget**: 20K HUGE (doc sanitaria, target ~50% report), 10K LARGE (pareri tecnici), 6K MEDIUM (premesse, doc atti, bibliografia, epicrisi, fatto+storia), 4K SMALL (anamnesi, quesiti), 2K TINY (intestazione, spese tabella).
**Citazioni testuali**: `formatEventsForPrompt` include il `sourceText` 200-char estratto, così il LLM ha l'anchor per riprodurre virgolettate fedelmente le citazioni richieste in `documentazione_sanitaria`.

### Data integrity safeguards (extraction + consolidation)

- **Diagnosi discordanti**: mai auto-risolte, escalate al perito (confidence cap 30%)
- **Nomi medici/strutture**: validati vs testo OCR originale (hallucination prevention)
- **Date inferite**: confidence cap 25%, nota "[AUTO] INFERITA"
- **Date formato**: normalizzazione DD.MM.YYYY → YYYY-MM-DD
- **Report troncati**: bloccati dal salvataggio (throw error → Inngest retry)

## Principi

1. Semplicità > complessità | 2. Immutabilità (spread, mai mutare) | 3. GDPR Art. 9 (dati sanitari sensibili)
4. Decisioni in `docs/ARCHITECTURE-DECISIONS.md` | 5. TDD (RED → GREEN → REFACTOR)

## Cosa NON fare

- `any` in TypeScript — mai, usare `unknown` + type guard
- Loggare dati sensibili (nomi pazienti, dati clinici) — solo ID/codici
- Committare .env, secrets, node_modules
- console.log in produzione
- Duplicare logica — riusare
- File > 300 righe — splittare

## Documentazione

- `docs/REQUIREMENTS.md` — Requisiti funzionali completi
- `docs/ARCHITECTURE-DECISIONS.md` — ADR
- `docs/VISION.md` — Visione prodotto e obiettivi
- `docs/CONSTRAINTS.md` — Vincoli tecnici e GDPR
- `docs/DPIA.md` — Data Protection Impact Assessment (GDPR Art. 9)
- `docs/DPA-MISTRAL.md` — Data Processing Agreement Mistral
- `docs/BACKUP-STRATEGY.md` — Backup e data retention policy
- `docs/ROADMAP.md` — Roadmap e feature future
- `docs/GUIDA-COMPLETA-FUNZIONALITA-LEGMED.md` — Guida utente completa
- `docs/PRESENTAZIONE.md` — Presentazione prodotto
- `docs/TODO-WORLD-CLASS.md` — TODO prioritizzato per miglioramenti futuri
- `.claude/rules/` — Regole codice, sicurezza, testing, git
- `.claude/skills/` — Workflow: debug, deploy, new-feature, research
- `.claude/commands/` — Comandi: /plan, /review, /ship
