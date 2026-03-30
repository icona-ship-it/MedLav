# MedLav Pipeline — Technical Deep Dive

## Architecture Overview

```
┌─────────┐     ┌──────────────┐     ┌────────────────┐     ┌─────────────┐
│ Browser  │────▶│ Next.js API  │────▶│   Inngest      │────▶│ Mistral API │
│ (React)  │     │ (Vercel fra1)│     │ (Orchestrator) │     │ (EU only)   │
└─────────┘     └──────┬───────┘     └───────┬────────┘     └─────────────┘
                       │                     │
                       ▼                     ▼
                ┌──────────────┐     ┌──────────────┐
                │  Supabase    │     │  Supabase    │
                │  PostgreSQL  │     │  Storage     │
                │  (Frankfurt) │     │  (images)    │
                └──────────────┘     └──────────────┘
```

**Durable execution model**: Inngest non esegue la pipeline in un singolo processo Node.js. Ogni `step.run()` è una richiesta HTTP separata al serverless function su Vercel. Tra uno step e l'altro, lo stato è persistito da Inngest e il processo muore. Al prossimo step, Inngest ri-invoca la funzione e gli step già completati vengono saltati (memoizzati) — i risultati cached vengono iniettati senza riesecuzione.

> **In parole semplici**: la pipeline non è un programma che gira dall'inizio alla fine. È una sequenza di mini-programmi indipendenti coordinati da Inngest. Se uno fallisce, viene ritentato senza ricominciare tutto da capo.

---

## Step-by-Step Pipeline

### Step 0: `mark-elaborazione`
**Cosa fa**: Aggiorna `cases.processing_stage` → `'elaborazione'` nel DB.

**Perché**: La UI mostra uno spinner/progress bar basato su questo campo. Senza questo update, l'utente non saprebbe che l'elaborazione è iniziata.

> **Semplice**: "Dice al database: sto lavorando su questo caso."

---

### Step 1: `fetch-case-metadata`
**File**: `src/inngest/steps/fetch-metadata.ts`

**Cosa fa**:
1. Legge `cases` + `documents` da Supabase con admin client (bypassa RLS)
2. Verifica ownership (`caseRow.user_id === userId`)
3. Marca tutti i documenti come `'in_coda'`
4. Costruisce `CaseMetadata` (tipo caso, ruolo, iniziali paziente, metadata perizia)

**Output**: `{ metadata: CaseMetadata, documents: DocumentInfo[] }`

**Guard**: Se 0 documenti → `throw Error('No documents to process')` → Inngest marca il caso come errore tramite `onFailure`.

> **Semplice**: "Legge le informazioni del caso e la lista dei documenti caricati. Controlla che il caso appartenga all'utente."

---

### Step 2: `ocr-doc-{id}` (PARALLELO)
**File**: `src/inngest/steps/ocr-document.ts`

**Cosa fa**: Per ogni documento, in parallelo (`Promise.all` su `step.run`):
1. Marca documento come `'ocr_in_corso'`
2. Genera signed URL da Supabase Storage
3. Chiama `ocrDocument()` → Mistral OCR API (`mistral-ocr-latest`)
4. Salva le pagine OCR nel DB (`pages` table: `page_number`, `ocr_text`, `ocr_confidence`, `has_handwriting`)
5. Se OCR ha estratto immagini (`includeImageBase64: true`):
   - Upload base64 → Supabase Storage (`ocr-images/{docId}/p{N}-f{M}.png`)
   - Max 20 immagini per documento
   - Aggiorna `pages.image_path` (semicolon-separated paths)
6. Aggiorna `documents.page_count`

**Parallelismo**: N documenti → N step Inngest concorrenti. Tempo = max(singolo documento), non somma. Limit: 5 step concorrenti su piano free Inngest.

**Error handling**: Se OCR fallisce → `return null` (non throw). I documenti falliti vengono filtrati, la pipeline continua con quelli riusciti. Se tutti falliscono → `throw Error('All documents failed OCR')`.

**Modello Mistral**: `mistral-ocr-latest` — modello specializzato per OCR, supporta PDF e immagini nativamente. Restituisce testo strutturato per pagina + immagini embedded.

> **Semplice**: "Manda ogni documento a Mistral che lo legge (OCR) e restituisce il testo pagina per pagina. Tutti i documenti vengono letti contemporaneamente per risparmiare tempo."

---

### Step 2.5: `classify-documents`
**File**: `src/inngest/steps/classify-documents.ts`

**Cosa fa**:
1. Prende i risultati OCR (primi 500 chars di ogni doc)
2. Chiama Mistral Large (`mistral-large-latest`, `temperature: 0`) per classificare il tipo di ogni documento
3. Applica classificazione SOLO ai documenti con tipo `'altro'` (non sovrascrive tipi espliciti dell'utente)
4. Se la confidence è ≥70% ma il tipo suggerito è diverso da quello dell'utente → marca come `mismatch_warning` nel DB

**Logica**: `classifyDocumentsStep()` → ritorna array di classificazioni. `applyClassifications()` viene chiamata FUORI da `step.run()` per applicare le classificazioni agli `ocrResults` in-memory (necessario perché Inngest memoizza i risultati degli step, e le modifiche in-memory andrebbero perse al retry).

**Modello Mistral**: `mistral-large-latest` con `temperature: 0` per massima consistenza.

> **Semplice**: "L'AI legge le prime righe di ogni documento e capisce che tipo è (referto, cartella clinica, esame...). Se l'utente aveva già detto il tipo, lo lascia stare."

---

### Step 2.6-2.7: Classification Review Gate
**File**: `src/inngest/functions/process-case.ts`

**Cosa fa**:
1. `mark-classification-ready`: marca documenti come `'classificazione_completata'`
2. `mark-revisione-classificazione`: marca caso come `'revisione_classificazione'`
3. `waitForEvent('case/classification.confirmed')`: **PAUSA** — aspetta fino a 7 giorni che l'utente confermi la classificazione dalla UI
4. Dopo conferma: `refresh-doc-types` rilegge i tipi dal DB (l'utente potrebbe averli cambiati)

**Meccanismo**: Inngest `step.waitForEvent()` — il processo muore, Inngest lo risveglia quando riceve l'evento `case/classification.confirmed` via API (POST da `/api/processing/confirm-classification`).

> **Semplice**: "Mette in pausa tutto e chiede all'utente: 'Ho classificato i documenti così, va bene?'. L'utente può correggere. Quando conferma, si riparte."

---

### Step 3: `extract-{docId}-p{start}-{end}` (PARALLELO per chunk)
**File**: `src/inngest/steps/extract-events.ts`

**Cosa fa**: Per ogni documento:
1. `planChunks()`: divide le pagine in chunk da 10 pagine
2. Per ogni chunk, in parallelo:
   - Legge le pagine OCR dal DB (non dall'output Inngest — evita serializzazione di dati grandi)
   - Filtra pagine vuote
   - Formatta: `[PAGE_START:N]\n{text}\n[PAGE_END:N]`
   - Chiama `extractEventsFromChunk()` → Mistral Large (`temperature: 0`)
   - Se 0 eventi e testo >50 chars → retry con prompt rafforzato
   - Normalizza enum (`eventType`, `sourceType`) con alias fuzzy (40+ mapping)
   - Salva eventi nel DB (`events` table)

**Dedup intra-documento**: `deduplicateWithinDocument()` usa Jaccard similarity >0.6 su titolo+descrizione per eliminare duplicati tra chunk sovrapposti. In caso di tie, vince l'evento con confidence*10 + description.length più alto.

**Parallelismo**: I chunk di uno stesso documento girano in parallelo. Documenti diversi sono processati sequenzialmente (il for-loop esterno è sequenziale, i chunk interni sono paralleli).

> **Semplice**: "Ogni documento viene diviso in pezzi da 10 pagine. L'AI legge ogni pezzo e ne estrae gli eventi clinici (visite, esami, interventi...). I pezzi di uno stesso documento vengono analizzati contemporaneamente."

---

### Step 4: `consolidate-events`
**File**: `src/inngest/steps/consolidate-events.ts`

**Cosa fa**:
1. Legge TUTTI gli eventi dal DB per il caso (`events WHERE case_id = X AND is_deleted = false`)
2. Sort deterministico: `event_date ASC` → `event_type ASC` → `created_at ASC`
3. Riassegna `orderNumber` sequenziale (1, 2, 3...)
4. Aggiorna `order_number` nel DB
5. Marca documenti come `'validazione_in_corso'`

**Determinismo**: Il sort a 3 livelli garantisce che lo stesso set di eventi produca sempre lo stesso ordinamento. Prima di questo fix, eventi con stessa data potevano apparire in ordine diverso.

> **Semplice**: "Prende tutti gli eventi di tutti i documenti, li mette in ordine cronologico e li numera 1, 2, 3..."

---

### Step 4.5: `link-images-to-events`
**File**: `src/inngest/steps/link-images.ts`

**Cosa fa**:
1. Legge eventi con `source_pages` (le pagine da cui ogni evento è stato estratto)
2. Legge pagine con `image_path` (immagini OCR salvate in Step 2)
3. Cancella vecchi `event_images` per evitare duplicati
4. Per ogni evento, se le sue `sourcePages` corrispondono a pagine con immagini → crea riga in `event_images`

**Tabella `event_images`**: junction table `event_id ↔ page_id ↔ image_path ↔ page_number`

> **Semplice**: "Collega le immagini estratte dall'OCR (RX, TAC, RM...) agli eventi clinici corrispondenti."

---

### Steps 4.6 + 5 + 6 + 7a: PARALLELO (Promise.all)

Questi 4 step sono **read-only** e indipendenti tra loro. Girano in parallelo:

#### `analyze-diagnostic-images`
**File**: `src/inngest/steps/link-images.ts:94`

- Scarica max 3 immagini da Storage
- Le invia a Mistral Pixtral Large (`pixtral-large-latest`) per descrizione oggettiva
- Ritorna `ImageAnalysisResult[]` con descrizione + `storagePath` per embedding nel report

**Modello**: `pixtral-large-latest` — modello vision multimodale.

> **Semplice**: "L'AI guarda le immagini diagnostiche (radiografie, TAC...) e le descrive oggettivamente."

#### `detect-anomalies`
**File**: `src/inngest/steps/detect-issues.ts:15`

- Cancella anomalie precedenti dal DB
- Esegue `detectAnomalies()` — **algoritmico, nessuna chiamata LLM**
- 7 tipi: gap temporali, date future, duplicati, sequenza illogica, diagnosi discordanti, confidence bassa, dati mancanti
- Salva anomalie nel DB (`anomalies` table)

> **Semplice**: "Controlla automaticamente se ci sono cose strane negli eventi: buchi temporali, date impossibili, diagnosi contraddittorie..."

#### `detect-missing-documents`
**File**: `src/inngest/steps/detect-issues.ts:54`

- Cancella missing docs precedenti
- `detectMissingDocuments()` — **algoritmico, no LLM**
- `checkCompleteness()` — checklist per tipo caso (ortopedica necessita RX, oncologica necessita istologico, etc.)
- Salva nel DB (`missing_documents` table)

> **Semplice**: "Controlla se mancano documenti importanti per quel tipo di caso. Es: per un caso ortopedico serve una radiografia."

#### `calculate-periods`
**File**: `src/inngest/steps/generate-report.ts:21`

- **Istantaneo** (<1ms), puro calcolo
- Calcola ITT (invalidità temporanea totale), ITP (parziale), giorni ricovero
- Basato su date ricovero/dimissione/intervento negli eventi

> **Semplice**: "Calcola i giorni di invalidità temporanea e ricovero dalle date degli eventi."

---

### Step 5.5: `resolve-anomalies`
**File**: `src/inngest/steps/resolve-anomalies.ts`

**DEVE aspettare** `detect-anomalies` (dipende da `rawAnomalies`).

**Cosa fa**:
1. Per ogni anomalia, legge le pagine OCR coinvolte
2. Chiama Mistral Large: "c'è evidenza nel testo originale che risolve questa anomalia?"
3. Se risolta (confidence alta) → marca come `'llm_resolved'`
4. Se confermata → marca come `'llm_confirmed'`
5. Ritorna solo le anomalie NON risolte

> **Semplice**: "L'AI ricontrolla ogni anomalia leggendo il testo originale. Se trova una spiegazione, la elimina. Se la conferma, la tiene."

---

### Step 7a.5: Anomaly Review Gate (condizionale)

**Solo se** ci sono anomalie o documenti mancanti:
1. Marca caso come `'revisione_anomalie'`
2. `waitForEvent('case/anomaly-review.confirmed')` — PAUSA fino a 7 giorni
3. Dopo conferma: rilegge anomalie dal DB (utente potrebbe averne archiviate alcune)

> **Semplice**: "Se ci sono problemi, mette in pausa e chiede all'utente di rivederli. L'utente può ignorare le anomalie che ritiene irrilevanti."

---

### Step 7b-7f: Report Generation

#### `check-synthesis-split`
- Conta caratteri totali eventi. Se >40K chars → attiva **split mode** (2 chiamate LLM invece di 1)

#### Normal mode: `generate-and-save-report`
- Costruisce `SynthesisParams` con: eventi, anomalie, missing docs, calcoli, immagini, metadata perizia
- `generateSynthesis()` → Mistral Large con:
  - **System prompt adattivo per ruolo** (CTU neutrale, CTP pro-paziente, stragiudiziale pragmatico)
  - **Template per tipo caso** (13 tipi: ortopedica, oncologica, rc_auto, previdenziale...)
  - **RAG**: retrieval linee guida cliniche da pgvector (se presenti)
  - **Calcoli ITT/ITP** integrati nel prompt
  - **Immagini diagnostiche** come `![caption](ocr-image:path)` nel markdown
- **Validazione post-generazione**: controlla sezioni mancanti, date sentinel, copertura eventi <50%, report vuoto/corto
- **Prompt versioning**: hash SHA-256 del system prompt salvato in `generation_metadata` per audit trail
- Salva report nel DB (`reports` table) con version incrementale
- Il testo del report **non esce mai** dall'`step.run()` (evita serializzazione Inngest per report grandi)

#### Split mode: `generate-synthesis-chronology` → `generate-summary-and-save-report`
- Prima genera la cronologia (parte più lunga)
- Poi genera il resto del report usando la cronologia come input
- Stesso salvataggio e validazione del normal mode

> **Semplice**: "L'AI scrive il report medico-legale completo. Per casi grandi, lo fa in due pezzi. Il report viene validato automaticamente e salvato nel database."

---

### Step 8: `finalize`
**File**: `src/inngest/steps/finalize.ts`

1. Marca tutti i documenti come `'completato'`
2. Marca il caso come `'completato'`
3. Scrive riga in `audit_log` con statistiche (no dati sensibili — solo conteggi e ID)

> **Semplice**: "Segna tutto come completato e registra un log di cosa è successo."

---

### Step 9: `send-notification`
**File**: `src/inngest/steps/finalize.ts:75`

- Legge il codice caso dal DB
- Chiama `sendReportReadyEmail()` via Resend API
- Non-blocking: se fallisce, il caso è comunque completato

> **Semplice**: "Manda un'email all'utente: 'Il tuo report è pronto'."

---

## Data Flow Diagram

```
Step 0   mark-elaborazione
         │
Step 1   fetch-case-metadata ──────────────────────────┐
         │                                              │
Step 2   ┌─── ocr-doc-A ───┐                          │
         │    ocr-doc-B     │  (parallel)              │
         │    ocr-doc-C     │                          │
         └──────────────────┘                          │
         │                                              │
Step 2.5 classify-documents                            │
         │                                              │
Step 2.7 ═══ WAIT: user confirms classification ═══    │
         │                                              │
Step 3   ┌─── extract-A-p1-10 ──┐                     │
         │    extract-A-p11-20   │  (parallel/doc)     │
         └──────────────────────┘                      │
         ┌─── extract-B-p1-10 ──┐                     │
         │    extract-B-p11-15   │                     │
         └──────────────────────┘                      │
         │                                              │
Step 4   consolidate-events                            │
         │                                              │
Step 4.5 link-images-to-events                         │
         │                                              │
         ┌─── analyze-images ────┐                     │
         │    detect-anomalies   │  (parallel)         │
         │    detect-missing     │                     │
         │    calculate-periods  │                     │
         └──────────────────────┘                      │
         │                                              │
Step 5.5 resolve-anomalies (needs detect-anomalies)    │
         │                                              │
Step 7a.5 ═══ WAIT: user reviews anomalies ═══ (if any)│
         │                                              │
Step 7   generate-and-save-report ◀────────────────────┘
         │                          (uses ALL upstream data)
Step 8   finalize
         │
Step 9   send-notification
```

## Error Handling & Retry

| Livello | Meccanismo | Dettaglio |
|---------|-----------|-----------|
| **Inngest function** | `retries: 1` | Tutta la funzione viene ritentata 1 volta. Gli step già completati sono memoizzati. |
| **Inngest step** | Memoizzazione | Ogni step completato non viene mai rieseguito. Solo lo step fallito viene ritentato. |
| **OCR step** | `return null` | Documento fallito viene saltato, pipeline continua. |
| **Extraction step** | Retry con prompt semplificato | Se 0 eventi da testo non vuoto → retry con prompt rafforzato. |
| **Extraction step** | Rethrow transient errors | 502, 503, 429, timeout → rethrow per far ritentare Inngest. |
| **Mistral client** | Circuit breaker + retry | 3 retry con exponential backoff, circuit breaker dopo 5 errori consecutivi. |
| **Pipeline failure** | `onFailure` handler | Marca il caso come `'errore'` nel DB (se non già `'idle'` o `'completato'`). |

> **Semplice**: "Se qualcosa va storto, il sistema riprova automaticamente. Se un singolo documento fallisce, gli altri vengono comunque elaborati. Se tutto fallisce, il caso viene segnato come 'errore'."

## Determinism Notes

**Cosa è deterministico** (stesso input → stesso output, garantito):
- Ordinamento eventi (3 livelli: data → tipo → titolo)
- Anomaly detection (algoritmico, no LLM)
- Missing document detection (algoritmico, no LLM)
- Calcoli ITT/ITP (puro calcolo)
- Dedup intra-documento (Jaccard deterministic con tie-breaking per score)

**Cosa NON è deterministico** (LLM-based, può variare tra run):
- OCR (`mistral-ocr-latest`) — testo estratto può variare leggermente
- Estrazione eventi (`mistral-large-latest`) — numero e contenuto eventi può variare
- Classificazione documenti (`mistral-large-latest`) — tipo suggerito può variare
- Risoluzione anomalie (`mistral-large-latest`) — anomalie confermate/risolte possono variare
- Analisi immagini (`pixtral-large-latest`) — descrizioni possono variare
- Generazione report (`mistral-large-latest`) — testo report varia

`temperature: 0` riduce la variabilità ma non la elimina. I modelli LLM non sono funzioni pure: floating point, GPU routing, batching server-side e model update silenti introducono non-determinismo irriducibile.

## Concurrency Limits

| Risorsa | Limite |
|---------|--------|
| Pipeline concorrenti | 3 (`concurrency: [{ limit: 3 }]`) |
| Step concorrenti (Inngest free) | 5 |
| Step concorrenti (Inngest pro) | 100+ |
| Immagini OCR per documento | 20 |
| Immagini diagnostiche analizzate | 3 |
| Pagine per chunk estrazione | 10 |
| Timeout waitForEvent | 7 giorni |
