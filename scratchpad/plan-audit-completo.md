# Audit Completo MedLav — 2026-03-26

## Stato Generale

| Check | Risultato |
|-------|-----------|
| **TypeScript typecheck** | ✅ PASS — zero errori |
| **Build Next.js** | ✅ PASS — 44 pagine, 75s |
| **Test suite** | ✅ PASS — 486 test su 42 file, 1.3s |
| **ESLint** | ⚠️ 1 warning (dependency array) |
| **`any` in codice** | ✅ Zero occorrenze |
| **console.log in prod** | ✅ Zero occorrenze |
| **Sicurezza generale** | ✅ Solida — nessuna vulnerabilità critica |

---

## 1. PROBLEMI CRITICI (da risolvere prima del go-live)

### 1.1 Pipeline: `Promise.all()` senza isolamento errori
**File:** `src/inngest/functions/process-case.ts`
- **Riga ~108 (OCR):** `Promise.all()` crasha l'intera pipeline se UN documento fallisce l'OCR
- **Riga ~260 (Extraction batches):** singolo batch fallito cancella tutte le estrazioni parallele
- **Riga ~308 (Analisi parallele):** 4 step critici in parallelo — se uno fallisce, pipeline intera fallisce

**Fix:** Sostituire con `Promise.allSettled()` + gestione risultati parziali.

### 1.2 Pipeline: Nessun timeout su step individuali
**File:** `src/inngest/functions/process-case.ts`
- Step come `fetch-case-metadata`, `classify-documents`, `consolidate-events`, `detect-anomalies` non hanno timeout
- Solo il timeout globale Inngest protegge (default 10 min)

**Fix:** Aggiungere timeout espliciti a ogni `step.run()`.

### 1.3 Pipeline: Retry globale troppo aggressivo
**File:** `src/inngest/functions/process-case.ts` (riga 74)
- `retries: 1` = solo 2 tentativi totali per una pipeline da 30+ minuti
- Un singolo timeout LLM = restart INTERA pipeline

**Fix:** Configurare retry per-step con backoff esponenziale.

### 1.4 Pipeline: Nessuna idempotency key sulle estrazioni
**File:** `src/inngest/steps/extract-events.ts`
- Retry di un batch reinserisce eventi duplicati nel DB
- Nessun meccanismo di dedup su reinserimento

**Fix:** Aggiungere idempotency key o verifica duplicati prima dell'inserimento.

### 1.5 Migrazioni Drizzle: indice duplicato
**File:** `drizzle/meta/_journal.json`
- Due migrazioni con index 13: `0013_aspiring_skrulls.sql` e `0013_add_retry_extraction_pass.sql`
- Possibile corruzione della sequenza di migrazione

**Fix:** Riordinare gli indici nel journal e verificare che le migrazioni siano applicate correttamente.

---

## 2. PROBLEMI ALTI (da risolvere a breve)

### 2.1 Export routes senza try-catch
**File:**
- `src/app/api/cases/[id]/export/html/route.ts`
- `src/app/api/cases/[id]/export/csv/route.ts`
- `src/app/api/cases/[id]/export/pct/route.ts`

Errori non gestiti → 500 generico senza logging. Il route DOCX ha l'error handling, gli altri no.

### 2.2 Formato errori API inconsistente
- La maggior parte dei route usa `{ success: false, error: "..." }`
- `api/cases/[id]/images/route.ts` e `api/stripe/webhook/route.ts` usano `{ error: "..." }` senza `success`

### 2.3 Rate limiting mancante su GET endpoints
- `GET /api/cases/[id]/share` — nessun rate limit
- `GET /api/admin/guidelines` — nessun rate limit
- `GET /api/cases/[id]/images` — nessun rate limit (proxy immagini)

### 2.4 Admin guidelines: manca controllo ruolo admin
**File:** `src/app/api/admin/guidelines/route.ts`
- Il GET verifica solo autenticazione (`user`), non che sia admin
- Qualsiasi utente autenticato può leggere le guidelines

### 2.5 Nessuna validazione env vars all'avvio
- Tutti i servizi usano `process.env.X` direttamente
- Variabile mancante = errore runtime, non errore all'avvio
- `DATABASE_URL` essenziale per Drizzle ma non in `.env.example`

### 2.6 Race condition upload immagini OCR
**File:** `src/inngest/steps/ocr-document.ts`
- Upload immagini con `Promise.allSettled()` ma errori silenziati
- Se upload fallisce ma `page.image_path` viene aggiornato → path punta a file inesistente

### 2.7 Consolidamento eventi: errori silenziati
**File:** `src/inngest/steps/consolidate-events.ts`
- Riga ~83-85: logga errore ma non lancia eccezione se DB ha 0 eventi dopo inserimento
- Inserimenti parziali falliti ignorati silenziosamente

### 2.8 ESLint warning: dependency array incompleto
**File:** `src/app/(dashboard)/cases/[id]/anomaly-review-step.tsx:109`
- `useCallback` manca `onGenerateStarted` nelle dipendenze
- Potenziale stale closure

---

## 3. PROBLEMI MEDI (da pianificare)

### 3.1 File troppo grandi (23 file > 300 righe)

| File | Righe | Priorità split |
|------|-------|----------------|
| `services/export/html-export.ts` | 1126 | Alta |
| `services/export/docx-export.ts` | 998 | Alta |
| `services/synthesis/synthesis-prompts.ts` | 986 | Media (template) |
| `cases/[id]/anomalies-section.tsx` | 776 | Alta |
| `services/extraction/extraction-service.ts` | 700 | Media |
| `settings/page.tsx` | 571 | Media |
| `services/synthesis/synthesis-service.ts` | 519 | Media |
| `inngest/functions/process-case.ts` | 505 | Media |
| + 15 altri file tra 350-450 righe | | Bassa |

### 3.2 Stripe webhook: userId non validato come UUID
**File:** `src/app/api/stripe/webhook/route.ts`
- `session.metadata?.userId` usato senza validazione Zod

### 3.3 `processing_stage` è `text` invece di enum
**File:** `drizzle/0016_add_processing_stage.sql`
- Nessun constraint DB — qualsiasi valore può essere inserito

### 3.4 CSP usa `unsafe-inline`
**File:** `src/lib/supabase/middleware.ts`
- Necessario per Next.js App Router, ma riduce protezione XSS
- Monitorare supporto nonce in future versioni Next.js

### 3.5 Circuit breaker solo in-memory
**File:** `src/lib/mistral/client.ts`
- Stato circuit breaker perso tra invocazioni serverless
- Non distribuito — ogni cold start riparte da zero

### 3.6 Rate limit fallback in-memory in produzione
**File:** `src/lib/rate-limit.ts`
- Se Redis non è disponibile, il fallback in-memory è inefficace su serverless (stato perso tra invocazioni)
- Nessun warning quando Redis non è raggiungibile

### 3.7 Boilerplate duplicato nei route API
- Pattern auth check + rate limit + feature gate ripetuto in 20+ route
- Estraibile in middleware composabile

---

## 4. PROBLEMI BASSI (nice-to-have)

### 4.1 `console.error` invece di `logger` in un file
**File:** `src/app/(dashboard)/actions/report-actions.ts:24`

### 4.2 TODO non risolto
**File:** `src/lib/mistral/client.ts:1`
- "TODO: pin to exact version IDs after verifying with Mistral List Models API"

### 4.3 Cascade delete orfani
- Tabella `event_images`: se un evento viene eliminato, immagini orfane restano su Storage

### 4.4 Classification review timeout 7 giorni
**File:** `src/inngest/functions/process-case.ts`
- Se l'utente non conferma mai la classificazione, pipeline resta sospesa per 7 giorni

### 4.5 Messaggi errore Mistral troncati a 200 chars
**File:** `src/lib/mistral/client.ts:194`
- Contesto completo dell'errore perso — complica il debugging

---

## 5. SICUREZZA E GDPR — Stato Eccellente ✅

| Area | Stato |
|------|-------|
| Auth + Middleware | ✅ Tutte le route protette, deactivation check |
| RLS (Row-Level Security) | ✅ Tutti i query filtrano per `user_id` |
| Input Validation (Zod) | ✅ Tutti gli endpoint POST validati |
| Dati sensibili nei log | ✅ Nessun dato paziente nei log |
| CSRF Protection | ✅ Double-submit cookie su tutte le mutation |
| Security Headers | ✅ HSTS, CSP, X-Frame-Options, Referrer-Policy |
| Env vars separation | ✅ Secrets mai esposti al client |
| File upload | ✅ Validazione, compressione, path traversal prevention |
| SQL Injection | ✅ Zero raw SQL, tutto parametrizzato via PostgREST/Drizzle |

---

## 6. PIANO D'AZIONE RACCOMANDATO

### Fase 1 — Critici (prima del go-live)
1. Pipeline resilience: `Promise.allSettled()` + timeout + retry per-step
2. Idempotency key nelle estrazioni
3. Fix migration journal duplicato
4. Validazione env vars all'avvio

### Fase 2 — Alti (sprint successivo)
5. Error handling export routes
6. Standardizzare formato errori API
7. Rate limit su GET endpoints mancanti
8. Admin role check su guidelines
9. Fix race condition immagini OCR
10. Fix ESLint warning

### Fase 3 — Medi (backlog)
11. Split file grandi (iniziare da html-export e docx-export)
12. Validazione UUID webhook Stripe
13. Enum DB per `processing_stage`
14. Middleware composabile per route API

### Fase 4 — Bassi (quando c'è tempo)
15. Sostituire console.error con logger
16. Pin versioni modelli Mistral
17. Cleanup immagini orfane
18. Timeout classificazione gestito

---

## Note

- **486 test passano** — ottima base per refactoring sicuro
- **Zero `any`** — disciplina TypeScript eccellente
- **Architettura solida** — pipeline sezionale, domain knowledge, RAG funzionanti
- I problemi principali sono nella **resilienza della pipeline** (error handling, retry, idempotency), non nella logica di business
