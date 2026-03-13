# Architecture Decision Records

## ADR-001: Stack Tecnologico
- **Data**: 2026-02-25
- **Contesto**: Definizione dello stack per una web app medico-legale con elaborazione documenti AI, requisiti GDPR stringenti per dati sanitari, e target 20-100 utenti.
- **Decisione**: Next.js 15 (App Router) + React 19 + TypeScript 5.9 strict + Supabase (EU) + Mistral API (EU) + Inngest + Vercel
- **Alternative considerate**:
  - Nuxt 4 (Vue) — scartato per ecosistema componenti piu limitato per app complesse
  - SvelteKit — scartato per ecosistema UI componenti meno maturo
  - Backend separato Python (FastAPI) — scartato per complessita doppio deploy, Inngest gestisce i job pesanti
- **Conseguenze**: Stack unificato JS/TS, deploy singolo su Vercel, background jobs gestiti da Inngest

---

## ADR-002: Mistral come unico provider AI
- **Data**: 2026-02-25
- **Contesto**: I dati sanitari sotto GDPR Art. 9 non possono transitare fuori dall'EU. Serve un LLM con capacita vision (OCR) e analisi testuale.
- **Decisione**: Usare esclusivamente Mistral API (azienda francese, dati processati in EU). Pixtral Large per vision/immagini diagnostiche, Mistral OCR per estrazione testo documenti, Mistral Large per estrazione strutturata, classificazione documenti, sintesi e generazione report.
- **Alternative considerate**:
  - Claude API (Anthropic) — ottime capacita ma data residency EU non garantita al 100%
  - Azure OpenAI (EU region) — possibile ma Mistral e piu semplice per compliance EU-native
  - OCR dedicato (Azure Document Intelligence) + LLM separato — piu complesso, doppio vendor
- **Conseguenze**: Dipendenza da singolo provider. Se la qualita OCR di Pixtral non e sufficiente per testo manoscritto, valuteremo un OCR dedicato EU-compliant come fallback.

---

## ADR-003: Supabase come piattaforma dati
- **Data**: 2026-02-25
- **Contesto**: Serve database PostgreSQL, storage file, autenticazione e realtime updates. Tutto in EU.
- **Decisione**: Supabase con progetto in EU region (Frankfurt). PostgreSQL per dati strutturati, Supabase Storage per documenti, Supabase Auth per autenticazione, Supabase Realtime per progress updates.
- **Alternative considerate**:
  - PostgreSQL self-hosted + MinIO + custom auth — piu controllo ma molto piu lavoro di setup e manutenzione
  - PlanetScale + Clerk + Uploadthing — buoni servizi ma non tutti EU-native
- **Conseguenze**: Vendor lock-in moderato su Supabase. Drizzle ORM come layer di astrazione rende la migrazione possibile.

---

## ADR-004: Inngest per background jobs su Vercel
- **Data**: 2026-02-25
- **Contesto**: L'elaborazione documenti (OCR + LLM) puo richiedere minuti. Vercel ha timeout di 300s per le serverless functions. Serve un sistema di job queue che funzioni con Vercel.
- **Decisione**: Inngest — si integra nativamente con Vercel, permette job long-running spezzati in step (ogni step < 300s), retry automatico, logging integrato.
- **Alternative considerate**:
  - BullMQ + Redis — richiede un server separato, non funziona su Vercel serverless
  - Trigger.dev — valida alternativa ma Inngest ha community piu ampia
  - Supabase Edge Functions — timeout troppo brevi (150s) per elaborazione documenti grandi
- **Conseguenze**: Dipendenza da Inngest. La pipeline di elaborazione deve essere progettata a step atomici.

---

## ADR-005: Drizzle ORM
- **Data**: 2026-02-25
- **Contesto**: Serve un ORM TypeScript per interagire con PostgreSQL. Deve essere type-safe, leggero, e compatibile con Supabase.
- **Decisione**: Drizzle ORM — type-safe, zero overhead a runtime, schema-as-code, ottimo supporto PostgreSQL.
- **Alternative considerate**:
  - Prisma — piu popolare ma piu pesante, cold start piu lenti su serverless, schema separato
  - Kysely — query builder puro, meno feature di ORM
  - Raw SQL con Supabase client — troppo manuale per le operazioni complesse necessarie
- **Conseguenze**: Schema definito in TypeScript, migration con drizzle-kit.

---

## ADR-006: shadcn/ui per componenti UI
- **Data**: 2026-02-25
- **Contesto**: L'app richiede componenti UI professionali (tabelle, form, dialog, select, tabs) per un'interfaccia medico-legale.
- **Decisione**: shadcn/ui — componenti copiati nel progetto (non dipendenza npm), basati su Radix UI, completamente personalizzabili, Tailwind CSS.
- **Alternative considerate**:
  - Material UI — troppo opinionated, bundle size grande
  - Ant Design — stile non adatto, bundle size grande
  - Headless UI — meno componenti disponibili
- **Conseguenze**: Componenti UI nel progetto sotto src/components/ui/, personalizzabili al 100%.

---

## ADR-007: Pipeline elaborazione documenti con Inngest a step
- **Data**: 2026-02-25
- **Contesto**: Implementazione della pipeline core dell'app: upload → OCR → estrazione eventi → consolidamento → anomalie → doc mancanti → sintesi.
- **Decisione**: Una singola funzione Inngest per caso (`processCaseDocuments`) con 13 step logici (molti più step atomici). Ogni step e atomico e retryable. OCR con `mistral-ocr-latest`, classificazione con `mistral-large-latest`, estrazione con `mistral-large-latest` (streaming), sintesi con `mistral-large-latest`, analisi immagini con `pixtral-large-latest`.
- **Alternative considerate**:
  - 1 funzione Inngest per documento — piu parallelismo ma consolidamento richiede tutti i doc, coordinazione piu complessa
  - Step separati per ogni documento (OCR-doc-1, OCR-doc-2) — vantaggi di retry granulare ma complessita di orchestrazione
  - Pipeline sincrona in API route — impossibile per documenti grandi (timeout Vercel 300s)
- **Conseguenze**:
  - I documenti OCR vengono processati in parallelo (Promise.all su step.run), l'estrazione per chunk è parallela per documento
  - Se un documento fallisce OCR, gli altri continuano (graceful degradation)
  - Admin Supabase client usato negli step Inngest (no cookie utente)
  - Signed URL generate per step per evitare scadenza
  - Polling 3s lato client per progress tracking

---

## ADR-008: Anomaly detection algoritmica con soglie configurabili
- **Data**: 2026-02-25
- **Contesto**: Servono 7 tipi di anomalia medico-legale con soglie specifiche (da REQUIREMENTS.md).
- **Decisione**: Detection puramente algoritmica (no LLM) basata su soglie temporali e confronto eventi. Le soglie sono costanti configurabili.
- **Rationale**: Determinismo, velocita, costo zero (no API calls), risultati prevedibili e verificabili.
- **Conseguenze**: Anomalie limitate a pattern temporali e relazionali. Anomalie semantiche (es. "terapia inappropriata") richiederebbero LLM in futuro.

---

## ADR-009: Report quality guardrails post-generazione
- **Data**: 2026-03-13
- **Contesto**: Il report generato da Mistral Large puo contenere sezioni mancanti, date sentinel leaked (01/01/1900), o eventi omessi dalla cronologia. Senza validazione, questi problemi finiscono nel report salvato.
- **Decisione**: Validatore post-generazione (`report-validator.ts`) che controlla 5 condizioni: report vuoto, troppo corto (<200 parole), sezioni obbligatorie mancanti, date sentinel nel testo, copertura eventi <50%. Non blocca la pipeline — logga warning/errori e salva comunque (meglio un report imperfetto che niente).
- **Rationale**: Determinismo e velocita (regex + conteggi, no LLM). Fornisce metriche osservabili (eventCoverage %) per monitoring qualita nel tempo.
- **Conseguenze**: I log di sintesi ora includono validation errors/warnings e % copertura eventi, utili per identificare pattern di bassa qualita.

---

## ADR-010: OCR parallelo nella pipeline Inngest
- **Data**: 2026-03-13
- **Contesto**: L'OCR dei documenti era sequenziale (for loop con await). Con 5 documenti, il tempo era 5x il singolo OCR.
- **Decisione**: OCR parallelizzato con Promise.all su step.run — stesso pattern gia usato per l'estrazione chunk. Ogni step.run ha il suo budget timeout Inngest indipendente.
- **Alternative considerate**: Mantenere sequenziale per semplicita — scartato perche il guadagno di tempo e significativo senza rischi aggiuntivi (il semaforo nel client Mistral gestisce i rate limit).
- **Conseguenze**: Tempo OCR = max(singolo documento) invece di sum(tutti i documenti). Con 5 documenti, riduzione tipica da ~150s a ~30s.
