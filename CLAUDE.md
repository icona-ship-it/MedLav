# MedLav

Web app per medici legali: upload documentazione clinica → report medico-legale strutturato automatico.

## Stack

- **Runtime**: Node.js 22 LTS, Next.js 15 (App Router), React 19, TypeScript 5.7 strict
- **Database**: Supabase PostgreSQL EU (Frankfurt) + pgvector per RAG
- **Auth**: Supabase Auth (email/password, email verification)
- **AI**: Mistral API EU — OCR (`mistral-ocr-latest`), Estrazione/Sintesi (`mistral-large-latest`), Embedding (`mistral-embed`)
- **Jobs**: Inngest (pipeline long-running su Vercel)
- **ORM**: Drizzle ORM | **UI**: shadcn/ui + Tailwind v4 | **Validazione**: Zod
- **Hosting**: Vercel (fra1) | **Export**: docx.js, Papa Parse, HTML

## Comandi

`pnpm dev` | `pnpm build` | `pnpm test` | `pnpm lint` | `pnpm typecheck` | `pnpm db:migrate` | `pnpm db:generate`

## Architettura

```
Browser → Vercel (Next.js) → Supabase (EU) + Inngest (Jobs) + Mistral API (EU)

Pipeline: Upload → OCR → Estrazione eventi → Validazione → Consolidamento → Anomalie → Sintesi → Report
```

### Mappa codice sorgente (`src/`)

| Directory | Scopo | File chiave |
|-----------|-------|-------------|
| `app/(auth)/` | Login, registrazione, forgot-password | `actions.ts` (signUp, signIn, resetPassword) |
| `app/(dashboard)/` | Dashboard, casi, impostazioni | `actions.ts` (CRUD casi/eventi/documenti), `cases/[id]/client.tsx` (UI caso) |
| `app/(admin)/` | Admin panel (stats, audit, processing) | `actions.ts` |
| `app/api/processing/` | API start/cancel/regenerate/regenerate-section | Trigger Inngest, regen report |
| `app/api/cases/[id]/export/` | Export HTML, DOCX, CSV | Usa `services/export/` |
| `app/api/admin/guidelines/` | CRUD linee guida RAG | GET/POST/DELETE |
| `inngest/functions/` | **Pipeline principale** (8 step) | `process-case.ts` |
| `services/ocr/` | OCR Mistral (PDF, immagini, DOCX) | `ocr-service.ts`, `ocr-types.ts` |
| `services/extraction/` | Estrazione eventi da testo OCR | `extraction-service.ts`, `extraction-prompts.ts` |
| `services/synthesis/` | Generazione report medico-legale | `synthesis-service.ts`, `synthesis-prompts.ts`, `role-prompts.ts`, `case-type-templates.ts` |
| `services/validation/` | Anomalie, doc mancanti, source verification | `anomaly-detector.ts`, `missing-doc-detector.ts`, `source-text-verifier.ts` |
| `services/consolidation/` | Merge eventi, dedup cross-doc | `event-consolidator.ts` |
| `services/calculations/` | ITT, ITP, giorni ricovero | `medico-legal-calc.ts` |
| `services/rag/` | RAG linee guida (embedding, retrieval) | `retrieval-service.ts`, `ingestion-service.ts` |
| `services/export/` | Generazione HTML/DOCX/CSV | `html-export.ts`, `docx-export.ts` |
| `lib/mistral/` | Client Mistral (retry, circuit breaker, streaming, semaforo) | `client.ts` |
| `lib/domain-knowledge/` | Knowledge base statica (nesso causale, framework, case-type) | `index.ts`, `case-type/*.ts` |
| `lib/supabase/` | Client Supabase (server, admin, middleware, storage) | |
| `db/schema/` | Schema Drizzle (11 tabelle) | `cases.ts`, `events.ts`, `documents.ts`, `guidelines.ts` |
| `components/` | UI components (shadcn + custom) | `error-boundary.tsx`, `cookie-consent.tsx` |

### Pipeline elaborazione (`process-case.ts` — 8 step Inngest)

1. **fetch-case-metadata** → carica caso + documenti da DB
2. **ocr-doc-{id}** → OCR ogni documento (Mistral OCR, parallelo)
3. **extract-{id}-p{start}-{end}** → estrazione eventi per chunk (parallelo, streaming)
4. **consolidate-events** → ordina cronologicamente, rinumera
5. **link-images-to-events** → collega immagini a eventi via sourcePages
6. **detect-anomalies** → 7 tipi anomalie (algoritmico, no LLM)
7. **generate-synthesis** → report con ruolo adattivo + RAG linee guida + calcoli
8. **finalize** → marca completato, audit log

### Sintesi adattiva per ruolo

| Ruolo | Tono | Anomalie | Conclusioni |
|-------|------|----------|-------------|
| CTU | Neutrale, bilanciate entrambe le parti | Criticità + giustificazioni | "A parere di questo CTU..." |
| CTP | Assertivo pro-paziente | Enfatizzate, no giustificazioni controparte | "Risulta evidente che..." |
| Stragiudiziale | Pragmatico, realistico | Valutate con solidità probatoria | "Il caso presenta fondatezza per..." |

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
- `docs/ARCHITECTURE-DECISIONS.md` — ADR (8 decisioni)
- `docs/VISION.md` — Visione prodotto e obiettivi
- `docs/CONSTRAINTS.md` — Vincoli tecnici e GDPR
- `.claude/rules/` — Regole codice, sicurezza, testing, git
- `.claude/skills/` — Workflow: debug, deploy, new-feature, research
- `.claude/commands/` — Comandi: /plan, /review, /ship
