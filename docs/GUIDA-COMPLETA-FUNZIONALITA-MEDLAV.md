# Guida Completa Funzionalità MedLav

## Cos'è MedLav

MedLav è una web application per **medici legali** (CTU, CTP, stragiudiziale) che automatizza la creazione di relazioni peritali. Il medico carica la documentazione clinica di un caso e l'app genera automaticamente:

- **Cronologia medico-legale** strutturata con tutti i fatti clinici
- **Report completo** con riassunto del caso e analisi
- **Anomalie** rilevate nella gestione clinica
- **Documentazione mancante** identificata

---

## Stack Tecnologico

| Componente | Tecnologia | Dove |
|------------|-----------|------|
| Frontend | Next.js 15 + React 19 + TypeScript | Vercel (fra1 - Frankfurt) |
| Database | PostgreSQL | Supabase (EU - Frankfurt) |
| Storage file | Supabase Storage | EU - Frankfurt |
| Autenticazione | Supabase Auth | EU |
| OCR documenti | Mistral OCR (`mistral-ocr-latest`) | Mistral API EU |
| Estrazione eventi | Mistral Large (`mistral-large-latest`) | Mistral API EU |
| Generazione report | Mistral Large (`mistral-large-latest`) | Mistral API EU |
| Job Queue | Inngest | Cloud (orchestrazione step) |
| UI Components | shadcn/ui + Tailwind CSS v4 | - |

> Tutti i dati restano in EU (GDPR compliance per dati sanitari Art. 9)

---

## Flusso Utente nell'App

### 1. Login / Registrazione
- Email + password via Supabase Auth
- Sessione gestita con cookie httpOnly

### 2. Dashboard
- Lista dei casi attivi con statistiche (casi attivi, in revisione, bozze)
- Accesso rapido a: I Miei Casi, Nuovo Caso, Archivio

### 3. Creazione Caso
- Dati obbligatori: tipo incarico (CTU/CTP/Stragiudiziale), tipologia caso
- Dati facoltativi: iniziali paziente, riferimento pratica, note
- Genera codice univoco: `CASO-2026-001`

### 4. Dettaglio Caso (Wizard a 3 Step)

#### Step 1 — Documenti
- Upload documenti clinici (PDF, DOCX, immagini)
- Lista documenti caricati con stato
- Possibilità di eliminare documenti
- Bottone "Procedi all'elaborazione" quando ci sono documenti pronti

#### Step 2 — Elaborazione
- Avvia l'analisi automatica
- Mostra progresso in tempo reale (stepper visuale)
- Tempo stimato: 2-5 minuti per documento
- Polling automatico ogni 5 secondi per aggiornamenti

#### Step 3 — Risultati
- **Tab Eventi**: cronologia eventi clinici estratti, modificabili
- **Tab Report**: report medico-legale con export (HTML, CSV, DOCX)
- **Tab Anomalie**: problemi rilevati nella gestione clinica
- **Tab Doc. Mancanti**: documentazione assente ma necessaria

---

# PARTE TECNICA — Backend di Analisi

## Panoramica Codebase Backend

Il backend di analisi è composto da **3.226 righe** distribuite su 17 file:

```
src/
├── lib/mistral/
│   └── client.ts                    (65 righe)  — Client Mistral + retry
├── inngest/functions/
│   └── process-case.ts              (609 righe) — Pipeline orchestrazione
├── services/
│   ├── ocr/
│   │   ├── ocr-service.ts           (260 righe) — OCR documenti
│   │   └── ocr-types.ts             (26 righe)  — Tipi OCR
│   ├── extraction/
│   │   ├── extraction-service.ts    (326 righe) — Estrazione eventi
│   │   ├── extraction-prompts.ts    (176 righe) — Prompt LLM
│   │   ├── extraction-schemas.ts    (30 righe)  — Schemi dati
│   │   ├── table-detector.ts        (142 righe) — Rilevamento tabelle
│   │   └── image-event-linker.ts    (70 righe)  — Collegamento immagini
│   ├── validation/
│   │   ├── event-validator.ts       (181 righe) — Validazione eventi
│   │   ├── source-text-verifier.ts  (235 righe) — Verifica testo sorgente
│   │   ├── coverage-analyzer.ts     (228 righe) — Analisi copertura
│   │   ├── anomaly-detector.ts      (337 righe) — Rilevamento anomalie
│   │   └── missing-doc-detector.ts  (182 righe) — Documenti mancanti
│   ├── consolidation/
│   │   └── event-consolidator.ts    (246 righe) — Consolidamento eventi
│   └── synthesis/
│       ├── synthesis-service.ts     (63 righe)  — Generazione report
│       └── synthesis-prompts.ts     (158 righe) — Prompt report
```

---

## 1. Client Mistral (`lib/mistral/client.ts`)

### Configurazione
```
Modelli disponibili:
  PIXTRAL_LARGE  = 'pixtral-large-latest'    → Vision (riservato uso futuro)
  MISTRAL_LARGE  = 'mistral-large-latest'     → Estrazione + Sintesi (56 token/s output)
  MISTRAL_SMALL  = 'mistral-small-latest'     → Estrazione veloce (~150 token/s, non usato attualmente)
  OCR            = 'mistral-ocr-latest'       → OCR dedicato

Timeout singola chiamata API: 120.000 ms (2 minuti)
```

### Meccanismo di Retry (`withMistralRetry`)
```
Tentativi massimi: 3
Delay base: 2.000 ms
Strategia: backoff esponenziale (2s → 4s → 8s)

Errori classificati come "transitori" (vengono riprovati):
  - HTTP: 500, 502, 503, 429 (rate limit)
  - Rete: fetch failed, ECONNRESET, ECONNREFUSED, ETIMEDOUT, socket hang up
  - Timeout: timeout, aborted, Unexpected ending
  - Server: Service unavailable, internal_server_error, overloaded, Bad gateway

Errori NON transitori (falliscono immediatamente):
  - 400 Bad Request (prompt invalido)
  - 401 Unauthorized (API key sbagliata)
  - 404 Not Found (modello non esiste)
```

### Creazione Client
- Un nuovo client `Mistral` viene creato per ogni chiamata (`getMistralClient()`)
- Nessun singleton — evita connessioni stale in ambiente serverless dove ogni invocazione Inngest è una nuova function

---

## 2. Servizio OCR (`services/ocr/ocr-service.ts`)

### Formati Supportati
| Formato | MIME Type | Metodo API |
|---------|-----------|------------|
| PDF | `application/pdf` | `client.ocr.process()` con `type: 'document_url'` |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `client.ocr.process()` con `type: 'document_url'` |
| Word legacy | `application/msword` | `client.ocr.process()` con `type: 'document_url'` |
| JPEG | `image/jpeg` | `client.ocr.process()` con `type: 'image_url'` |
| PNG | `image/png` | `client.ocr.process()` con `type: 'image_url'` |
| TIFF | `image/tiff` | `client.ocr.process()` con `type: 'image_url'` |
| WebP | `image/webp` | `client.ocr.process()` con `type: 'image_url'` |

### Parametro Chiave
```
includeImageBase64: false
```
Motivo: con `true`, la risposta include le immagini in base64 (decine di MB per documenti lunghi), causando timeout e crash per memoria. Con `false` la risposta contiene solo testo (~100KB anche per 100+ pagine).

### Flusso OCR
```
1. Riceve: documentId, fileName, fileType, signedUrl (da Supabase Storage)
2. Seleziona metodo in base al MIME type (ocrPdf / ocrImage / ocrDocx)
3. Chiama Mistral OCR API con retry automatico
4. Processa la risposta tramite mapOcrResponseToResult():
   - Per ogni pagina: estrai testo markdown, stima confidence, rileva manoscritto
   - Costruisci fullText con marker pagina: [PAGE_START:N]...[PAGE_END:N]
   - Calcola averageConfidence (media di tutte le pagine)
```

### Stima Confidence (`estimateConfidence`)
```
Algoritmo:
  base = 90
  penalty = min(count("[ILLEGGIBILE]") × 5, 40)
  bonus = min(wordCount / 10, 10)
  result = clamp(base - penalty + bonus, 10, 100)

Esempio:
  Testo pulito 500 parole, 0 illeggibili: 90 - 0 + 10 = 100
  Testo con 3 illeggibili, 200 parole: 90 - 15 + 10 = 85
  Testo con 8 illeggibili, 50 parole: 90 - 40 + 5 = 55
```

### Rilevamento Manoscritto (`detectHandwriting`)
```
Cerca tag [MANOSCRITTO] nel testo OCR (inseriti dal modello Mistral)
  0 tag → hasHandwriting: null
  stimatedChars / totalLength > 0.5 → hasHandwriting: 'yes', confidence: 60
  altrimenti → hasHandwriting: 'partial', confidence: 70
```

### Struttura Output (`OcrDocumentResult`)
```typescript
{
  documentId: string;
  fileName: string;
  pageCount: number;
  pages: [{
    pageNumber: number;      // 1-indexed
    text: string;            // Testo markdown della pagina
    confidence: number;      // 0-100
    hasHandwriting: 'yes' | 'partial' | null;
    handwritingConfidence: number | null;
    images: OcrImageResult[];
  }];
  averageConfidence: number;
  fullText: string;          // Testo completo con marker [PAGE_START:N]...[PAGE_END:N]
  images: OcrImageResult[];  // Vuoto (includeImageBase64: false)
}
```

---

## 3. Rilevamento Tabelle (`services/extraction/table-detector.ts`)

### Scopo
Pre-processa il testo OCR per annotare tabelle con marker `[TABLE_START]`/`[TABLE_END]` PRIMA di inviarlo all'LLM. Questo aiuta il modello a trattare i dati tabulari correttamente.

### Algoritmo
Nessuna chiamata LLM — puro processing deterministico.

```
1. Dividi il testo in blocchi per pagina ([PAGE_START:N]...[PAGE_END:N])
2. Per ogni blocco, dividi in sotto-blocchi separati da righe vuote
3. Per ogni sotto-blocco con ≥3 righe, applica 3 euristiche:
```

#### Euristica 1: Tabelle Markdown
```
Condizione: la riga contiene ≥2 caratteri pipe "|" O è una riga separatrice (---|---)
Esempio rilevato:
  | Esame | Valore | Unità |
  |-------|--------|-------|
  | Emoglobina | 13.5 | g/dL |
```

#### Euristica 2: Tabelle Numeriche Allineate
```
Regex: /^(\S[\w\s]{2,}?)\s{2,}(\d+[.,]?\d*)\s*(\S+)?$/
Condizione: ≥2 righe su ≥3 matchano il pattern "Parola  Numero  Unità"
Esempio rilevato:
  Emoglobina      13.5 g/dL
  Leucociti       8200 /mm³
  Piastrine       245000 /mm³
```

#### Euristica 3: Struttura Ripetitiva
```
Algoritmo:
  1. Tokenizza ogni riga in pattern: W (parola), N (numero), P (punteggiatura)
  2. Calcola frequenza di ogni pattern
  3. Se un pattern appare ≥4 volte → è una tabella

Esempio:
  Riga "Glucosio 95 mg/dL" → pattern "WNW" (parola, numero, parola)
  Se 4+ righe hanno lo stesso pattern "WNW" → tabella rilevata
```

---

## 4. Servizio Estrazione (`services/extraction/extraction-service.ts`)

### Architettura Chunking
```
MAX_CHUNK_CHARS = 20.000 caratteri (~10 pagine mediche)

Documento → prepareExtractionChunks():
  1. Pre-processa: annotateTablesInText() aggiunge marker tabelle
  2. Se testo ≤ 20K chars → 1 chunk (tutto il documento)
  3. Se testo > 20K chars → split in chunk multipli
```

### Algoritmo di Split (`splitTextIntoChunks`)
```
1. Cerca marker di pagina [PAGE_START:N]...[PAGE_END:N]

SE presenti (split page-aware):
  - Accumula pagine finché il chunk non supera 20K chars
  - Overlap: l'ultima pagina del chunk precedente è ripetuta nel successivo
  - Se una singola pagina supera 20K chars → fallback character-based

SE assenti (fallback character-based):
  - Taglia a 20K chars cercando il boundary naturale più vicino:
    1. Priorità: doppio newline (\n\n) nelle ultime 1000 chars
    2. Fallback: singolo newline (\n)
    3. Ultimo resort: taglia al carattere esatto
  - Overlap: 2.000 chars dal chunk precedente
```

### Chiamata LLM (`extractEventsFromChunk`)
```
Modello: mistral-large-latest
Formato risposta: json_object
Temperatura: 0.1 (deterministica)
Max token output: 8.192
Timeout: 120 secondi (dal client Mistral)
Retry: 3 tentativi con backoff esponenziale

Input:
  - System prompt: ~1.200 token (regole estrazione + guida caso + esempio JSON)
  - User prompt: testo del chunk + metadati documento

Output atteso: JSON con array "events" + opzionale "abbreviations"
```

### Parser Risposta (`parseExtractionResponse`)
Parser ultra-resiliente che gestisce tutte le variazioni del modello:

```
Fase 1 — Parse JSON
  JSON.parse(content) → se fallisce, log errore e return []

Fase 2 — Trova array eventi
  Cerca nelle chiavi (in ordine): "events", "Events", "eventi", "EVENTS"
  Se nessuna trovata: cerca in TUTTE le chiavi top-level un array
  di oggetti che contengano "eventDate" o "title" o "description"

Fase 3 — Parse ogni evento individualmente
  Per ogni elemento dell'array:
  - Requisito minimo: deve avere "title" O "description"
  - Ogni campo ha un default sicuro se mancante:
    eventDate → '1900-01-01'
    datePrecision → 'sconosciuta'
    eventType → 'altro'
    confidence → 70
    sourcePages → [1]
  - Gestisce sia camelCase che snake_case:
    eventDate / event_date
    sourceType / source_type
    requiresVerification / requires_verification
  - Confidence clampata a 0-100
  - Campi nullable (diagnosis, doctor, facility): null se assenti
```

---

## 5. Prompt di Estrazione (`services/extraction/extraction-prompts.ts`)

### System Prompt — Struttura
```
1. RUOLO: "Sei un assistente medico-legale specializzato..."

2. REGOLE FONDAMENTALI (7 regole):
   - ZERO DISCARD: non scartare MAI nessun evento
   - COPIA FEDELE E DETTAGLIATA: descrizione lunga e completa
   - DATE: formato YYYY-MM-DD con precisione
   - ABBREVIAZIONI: espandi tutte (PA → Pressione Arteriosa)
   - AFFIDABILITÀ: scoring 80-100 / 50-79 / 10-49
   - VERIFICA: requiresVerification per dati incerti
   - ANCORAGGIO: sourceText max 200 char + sourcePages

3. REGOLE PER TIPO FONTE (A/B/C/D):
   A — Cartella clinica: 7 sotto-categorie (ingresso, esami, anamnesi,
       operatoria, anestesiologica, diario, dimissione)
   B — Referti controlli: visite, follow-up, certificati
   C — Referti radiologici: RX, TAC, RM, ECG, ecografie
   D — Esami ematochimici: tutti i valori con unità

4. GUIDA SPECIFICA PER TIPO CASO:
   - Ortopedica: focus su interventi, protesi, complicanze, imaging
   - Oncologica: focus su tempi diagnostici, staging, markers
   - Ostetrica: focus su CTG, partogramma, APGAR, parto
   - Anestesiologica: focus su ASA score, farmaci, monitoraggio
   - Infezione nosocomiale: focus su colturali, antibiotici, markers
   - Errore diagnostico: focus su sequenza esami, diagnosi nel tempo
   - Generica: estrazione senza filtri prioritari

5. REGOLA TABELLE: tratta [TABLE_START]...[TABLE_END] riga per riga

6. ATTENZIONE SPECIALE: eventi indiretti, tabelle, manoscritto,
   header/footer, informazioni implicite

7. FORMATO OUTPUT: esempio JSON concreto con tutti i campi
```

### Esempio JSON nel Prompt
Il prompt include un esempio completo di output atteso per guidare il modello:
```json
{
  "events": [{
    "eventDate": "2024-01-15",
    "datePrecision": "giorno",
    "eventType": "ricovero",
    "title": "Ricovero per intervento chirurgico",
    "description": "Paziente ricoverato presso reparto di ortopedia...",
    "sourceType": "cartella_clinica",
    "diagnosis": "Coxartrosi destra",
    "doctor": "Dr. Rossi",
    "facility": "Ospedale San Giovanni",
    "confidence": 90,
    "requiresVerification": false,
    "reliabilityNotes": null,
    "sourceText": "Ricovero presso reparto ortopedia per coxartrosi dx",
    "sourcePages": [1]
  }],
  "abbreviations": [
    {"abbreviation": "PA", "expansion": "Pressione Arteriosa"}
  ]
}
```

---

## 6. Validazione Eventi (`services/validation/event-validator.ts`)

### Validazioni Singolo Evento
| Check | Azione | Severità |
|-------|--------|----------|
| Data futura | Auto-fix: imposta a oggi | warning, autoFixed |
| Formato data invalido | Segnala | error |
| Descrizione < 20 chars | Segnala | warning |
| Titolo > 150 chars | Auto-fix: tronca | warning, autoFixed |
| Confidence fuori range | Auto-fix: clamp 0-100 | warning, autoFixed |

### Validazioni Cross-Evento
| Check | Azione |
|-------|--------|
| Duplicati esatti (stessa data + titolo + descrizione) | Rimuove il duplicato |
| Sequenze impossibili (follow-up prima dell'intervento correlato) | Segnala warning |

### Relazione tra Titoli (`titlesRelated`)
```
Algoritmo:
  1. Split titoli in parole
  2. Filtra parole > 4 caratteri
  3. Conta sovrapposizione
  4. Se ≥2 parole in comune → i titoli sono correlati
```

---

## 7. Verifica Testo Sorgente (`services/validation/source-text-verifier.ts`)

### Scopo
Verifica che il `sourceText` di ogni evento esista davvero nel testo OCR originale. Rileva allucinazioni dell'LLM.

### 3 Livelli di Matching

#### Livello 1: Match Esatto
```
fullText.includes(sourceText) → matchLevel: 'exact'
```

#### Livello 2: Match Normalizzato
```
Normalizzazione:
  - Lowercase
  - Collassa whitespace multipli in singolo
  - Rimuove marker [PAGE_START:N], [PAGE_END:N]
  - Rimuove marker [TABLE_START], [TABLE_END]

normalizedFull.includes(normalizedSource) → matchLevel: 'normalized'
```

#### Livello 3: LCS (Longest Common Subsequence)
```
Algoritmo:
  1. Split sourceText in parole
  2. Split fullText in finestra scorrevole (window = sourceWords.length × 3)
  3. Per ogni posizione della finestra:
     - Calcola LCS con DP space-optimized (2 righe invece di matrice NxM)
     - ratio = lcsLength / sourceWordsCount
     - Se ratio ≥ 0.70 → matchLevel: 'lcs', exit early
  4. Se nessuna finestra supera 0.70 → matchLevel: 'unverified'

Complessità: O(sourceWords × windowSize × fullTextWindows)
Ottimizzazione: early exit appena ratio ≥ 0.70
```

### Output per Evento
```typescript
{
  matchLevel: 'exact' | 'normalized' | 'lcs' | 'unverified';
  verified: boolean;    // true se matchLevel ≠ 'unverified'
  matchRatio?: number;  // solo per livello LCS
}
```

---

## 8. Analisi Copertura (`services/validation/coverage-analyzer.ts`)

### Scopo
Calcola quale percentuale del testo OCR originale è "coperta" dagli eventi estratti. Identifica blocchi di testo significativi non coperti.

### Algoritmo
```
1. findCoveredRanges()
   Per ogni evento con sourceText:
   - Trova la posizione nel fullText (match normalizzato)
   - Registra range [start, end] nel fullText

2. mergeRanges()
   Ordina ranges per start, unisci sovrapposti
   Calcola coveredLength = somma dei range dopo merge

3. coveragePercent = (coveredLength / totalTextLength) × 100

4. findUncoveredBlocks()
   Per ogni gap tra range coperti:
   - Se gap > 200 chars → è un blocco non coperto
   - Scansiona per termini medici italiani (40 termini):
     diagnosi, terapia, intervento, esame, complicanza,
     ricovero, dimissione, pressione, emoglobina, ...
   - Se contiene termini medici → uncoveredWithMedicalTerms++
```

### Output
```typescript
{
  coveragePercent: number;        // 0-100
  totalTextLength: number;
  coveredLength: number;
  uncoveredBlocks: [{
    text: string;                 // Primi 500 chars del blocco
    startPosition: number;
    length: number;
    containsMedicalTerms: boolean;
  }];
  uncoveredWithMedicalTerms: number;
  warnings: string[];            // Es: "Copertura bassa (35%)"
}
```

---

## 9. Consolidamento Eventi (`services/consolidation/event-consolidator.ts`)

### Scopo
Quando un caso ha più documenti, unisce gli eventi di tutti i documenti in una timeline unica, eliminando duplicati e segnalando discrepanze.

### Algoritmo di Consolidamento (`consolidateEvents`)
```
1. Flatten: raccogli tutti gli eventi da tutti i documenti
2. Ordina per: eventDate ASC, poi eventType ASC
3. Deduplicazione:
   Per ogni coppia di eventi:
   - isSimilarEvent() → se simili, tieni quello con confidence più alta
4. Assegna orderNumber sequenziale (1, 2, 3, ...)
5. markDiscrepancies(): segnala eventi in documenti diversi
   con diagnosi o medico diverso
```

### Similarità tra Eventi (`isSimilarEvent`)
```
Condizione 1 — Stessa data + titoli simili:
  eventDate uguale
  AND calculateSimilarity(titleA, titleB) > 0.6

Condizione 2 — Stessa data + keywords mediche condivise:
  eventDate uguale
  AND ≥3 keyword mediche condivise nelle descrizioni

calculateSimilarity(): Jaccard Index
  wordsA = set di parole > 3 chars
  wordsB = set di parole > 3 chars
  overlap = |wordsA ∩ wordsB|
  union = |wordsA ∪ wordsB|
  similarity = overlap / union
  threshold: > 0.6

extractMedicalKeywords():
  - Split descrizione in parole
  - Filtra stopwords italiane (il, lo, la, di, in, per, ...)
  - Cap a 30 keywords max
```

### Consolidamento Incrementale (`consolidateNewWithExisting`)
```
Per ri-elaborazioni parziali:
1. Prende eventi nuovi (da documenti appena elaborati)
2. Prende eventi esistenti (già nel DB da elaborazioni precedenti)
3. Deduplicazione: nuovi vs esistenti
4. Aggiunge solo eventi veramente nuovi
5. Ri-numera tutta la timeline
```

---

## 10. Rilevamento Anomalie (`services/validation/anomaly-detector.ts`)

### Soglie Conservative (evitano falsi positivi)
```
RITARDO_DIAGNOSTICO:     90 giorni
GAP_POST_CHIRURGICO:     60 giorni
GAP_DOCUMENTALE_WARNING: 180 giorni (6 mesi)
GAP_DOCUMENTALE_CRITICO: 365 giorni (1 anno)
DIAGNOSI_CONTRADDITTORIA: 60 giorni
TERAPIA_SENZA_FOLLOWUP:  30 giorni
MIN_EVENTS_FOR_GAP:       5 eventi (sotto questo numero, gap analysis è disattivata)
```

### 7 Tipi di Anomalie

#### 1. Ritardo Diagnostico
```
Trigger: >90 giorni tra PRIMA visita e PRIMA diagnosi
Severità: media (91-120gg), alta (121-180gg), critica (>180gg)
Logica: solo prima visita → prima diagnosi (no combinatoria)
```

#### 2. Gap Post-Chirurgico
```
Trigger: >60 giorni dopo intervento senza follow-up/visita/esame
Severità: media (61-120gg), alta (>120gg)
Nota: non segnala se l'intervento è l'ultimo evento (potrebbe essere recente)
```

#### 3. Gap Documentale
```
Trigger: >180 giorni tra due eventi consecutivi
Severità: media (181-365gg), alta (>365gg)
Prerequisito: almeno 5 eventi totali (con meno dati non è significativo)
```

#### 4. Complicanza Non Gestita
```
Trigger: evento tipo 'complicanza' senza trattamento (terapia/intervento) entro 14 giorni
Severità: alta
```

#### 5. Consenso Non Documentato
```
Trigger: procedura chirurgica senza evento 'consenso' documentato
Prerequisito: almeno 2 fonti documentali diverse (con 1 solo doc, il consenso potrebbe essere in un altro documento non caricato)
Severità: media
Nota: segnala UN'UNICA anomalia generica, non una per ogni procedura
```

#### 6. Diagnosi Contraddittoria
```
Trigger: diagnosi diverse entro 60 giorni con <20% sovrapposizione parole
Prerequisito: entrambe le diagnosi devono avere ≥3 parole significative e ≥10 caratteri
Limite: massimo 20 diagnosi analizzate (evita O(n²) esplosione)
Severità: media
```

#### 7. Terapia Senza Follow-up
```
Trigger: terapia senza visita/esame/follow-up entro 30 giorni
Prerequisito: almeno 2 fonti documentali + eventi successivi alla terapia
Severità: bassa
```

### Deduplicazione Anomalie
```
Chiave: anomalyType + description.slice(0, 100)
Se duplicato → scartato
```

---

## 11. Documenti Mancanti (`services/validation/missing-doc-detector.ts`)

### Logica
Per ogni tipo di caso, il sistema ha una lista di documenti "attesi". Scansiona gli eventi estratti per verificare se le evidenze di quei documenti sono presenti.

### Documenti Attesi per Tipo Caso
| Tipo Caso | Documenti Attesi |
|-----------|-----------------|
| Ortopedica | Consenso informato, Descrizione operatoria, Cartella anestesiologica, Lettera dimissione, Follow-up post-operatorio, Esami pre-operatori, Imaging pre/post |
| Oncologica | Referti bioptici/istologici, Imaging diagnostico, Markers tumorali, Follow-up oncologico |
| Ostetrica | Cartella ostetrica, CTG (cardiotocografia), Cartella neonatale, Consenso parto, Partogramma |
| Anestesiologica | Cartella anestesiologica, Valutazione pre-operatoria, Monitoraggio parametri, Consenso anestesia |
| Infezione nosocomiale | Colturali/antibiogrammi, Diario clinico, Terapia antibiotica, Lettera dimissione |
| Errore diagnostico | Referti diagnostici sequenziali, Imaging, Visite specialistiche |
| Generica | Consenso informato, Lettera dimissione |

### Metodo di Rilevamento (`analyzeDocumentPresence`)
```
Per ogni documento atteso:
  1. Definisci keywords di ricerca (es. per "consenso": ["consenso", "informato"])
  2. Scansiona tutti i titoli e descrizioni degli eventi
  3. Se almeno un evento contiene le keywords → documento presente
  4. Se nessun evento le contiene → documento mancante, aggiungi a lista
```

---

## 12. Generazione Report (`services/synthesis/`)

### Chiamata LLM
```
Modello: mistral-large-latest (ragionamento complesso)
Temperatura: 0.3 (bilanciamento creatività/determinismo)
Max token output: 16.384 (report lungo con cronologia completa)
```

### Struttura Prompt di Sintesi

#### System Prompt
Definisce 3 parti obbligatorie:

**Parte 1 — RIASSUNTO DEL CASO** (300-500 parole)
```
- Presentazione paziente e motivo ricovero
- Decorso clinico con passaggi critici
- Interventi e loro esiti
- Complicanze insorte
- Stato attuale e prognosi
- Elementi critici per valutazione medico-legale
- Nesso causale tra gestione e danni
```

**Parte 2 — CRONOLOGIA MEDICO-LEGALE** (senza limiti)
```
Elenco cronologico COMPLETO di tutti i fatti medici:
- Data formato DD/MM/YYYY
- Categoria fonte tra parentesi: (A), (B), (C) o (D)
- Contenuto copiato fedelmente

Categorie:
  (A) CARTELLA CLINICA
  (B) REFERTI CONTROLLI MEDICI
  (C) REFERTI RADIOLOGICI ED ESAMI STRUMENTALI
  (D) ESAMI EMATOCHIMICI
```

**Parte 3 — ELEMENTI DI RILIEVO MEDICO-LEGALE** (200-400 parole)
```
- Punti critici per valutazione peritale
- Omissioni o ritardi
- Anomalie nella gestione clinica
- Documentazione mancante
```

#### User Prompt
```
Include:
- Tipo caso (label descrittiva)
- Ruolo perito (CTU/CTP/STRAGIUDIZIALE)
- Iniziali paziente
- Numero eventi e periodo documentato
- TUTTI gli eventi in ordine cronologico con:
  orderNumber, data, fonte (A/B/C/D), tipo evento, titolo,
  descrizione completa, diagnosi, medico, struttura
- Anomalie rilevate con severità
- Documentazione mancante
```

---

## 13. Collegamento Immagini (`services/extraction/image-event-linker.ts`)

### Algoritmo
```
1. Indicizza pagine per (documentId:pageNumber) → pagine con immagini
2. Per ogni evento:
   - Prendi i suoi sourcePages
   - Per ogni pagina sorgente:
     - Cerca se quella pagina ha immagini (image_path nel DB)
     - Se sì: split percorsi separati da ";" in link individuali
     - Crea EventImageLink: { eventId, pageId, imagePath, pageNumber }
3. Ritorna array flat di tutti i link per inserimento bulk nel DB
```

---

## 14. Pipeline Inngest (`inngest/functions/process-case.ts`)

### Configurazione Function
```
id: 'process-case-documents'
retries: 1 (Inngest riprova 1 volta in caso di fallimento)
concurrency: limite 3 (max 3 casi elaborati contemporaneamente)
cancelOn: evento 'case/process.cancelled' (matchato per caseId)
trigger: evento 'case/process.requested'
```

### Step Dettagliati

#### Step 1: `fetch-case-metadata`
```
Input: caseId, userId (dall'evento Inngest)
Azioni:
  1. Query caso dal DB, verifica ownership (user_id === userId)
  2. Query documenti con status 'caricato' o 'in_coda'
  3. Marca tutti come 'in_coda' con timestamp aggiornato
Output: metadata caso + lista documenti (id, fileName, fileType, storagePath)
Durata: ~1 secondo
```

#### Step 2: `ocr-doc-{documentId}` (uno per documento)
```
Input: documento (id, storagePath, fileName, fileType)
Azioni:
  1. Marca documento come 'ocr_in_corso'
  2. Genera signed URL da Supabase Storage (scadenza breve)
  3. Chiama Mistral OCR API con retry
  4. Salva pagine nel DB (tabella 'pages') con testo, confidence, manoscritto
  5. Aggiorna page_count sul documento
Output: { documentId, fullText, pageCount, averageConfidence }
Durata: ~10-30 secondi per documento
Nota: fullText passa attraverso Inngest (necessario per il chunking)
```

#### Step 3a: `plan-chunks-{documentId}` (uno per documento)
```
Input: documentId, pageCount
Azioni:
  1. Marca documento come 'estrazione_in_corso'
  2. Calcola ranges di pagine (10 pagine per chunk)
     Es. 101 pagine → [{1,10}, {11,20}, ..., {91,101}]
Output: array di ranges (dati microscopici, ~50 bytes)
Durata: istantaneo
```

#### Step 3b: `extract-{docId}-p{start}-{end}` (PARALLELO, uno per chunk)
```
Input: range pagine (start, end)
Azioni:
  1. Legge testo pagine dal DB (tabella 'pages')
  2. Assembla testo con marker [PAGE_START:N]...[PAGE_END:N]
  3. Chiama extractEventsFromChunk() → Mistral Large
  4. Parsa risposta JSON con handler resiliente
  5. Salva eventi DIRETTAMENTE nel DB (tabella 'events')
Output: { count: N } (solo il numero, ~10 bytes)
Durata: ~30-90 secondi per chunk

ARCHITETTURA CHIAVE:
  Tutti i chunk dello stesso documento girano IN PARALLELO
  via Promise.all(). 10 chunk = ~60-90 secondi totali
  (il tempo del chunk più lento, non la somma).
  Nessun dato grande passa attraverso Inngest:
  - Input: letto dal DB
  - Output: salvato nel DB
  - Inngest vede solo { count: 8 }
```

#### Step 4: `consolidate-events`
```
Input: nessuno (legge dal DB)
Azioni:
  1. Fetch tutti gli eventi dal DB per il caso
  2. Ordina per event_date ASC
  3. Ri-assegna order_number sequenziale
  4. Aggiorna status documenti a 'validazione_in_corso'
Output: { allEvents, newEventsCount }
Durata: ~2 secondi
```

#### Step 5: `link-images-to-events`
```
Input: nessuno (legge dal DB)
Azioni:
  1. Fetch eventi con source_pages non null
  2. Fetch pagine con image_path non null
  3. Elimina vecchi link (event_images)
  4. Crea nuovi link basati su corrispondenza sourcePages ↔ pageNumber
  5. Inserisce bulk in tabella event_images
Output: nessuno
Durata: ~1-2 secondi
```

#### Step 6: `detect-anomalies`
```
Input: allEvents (dal consolidamento)
Azioni:
  1. Elimina anomalie precedenti per il caso
  2. Esegue 7 controlli anomalie (vedi sezione dedicata)
  3. Deduplicazione risultati
  4. Inserisce nuove anomalie nel DB
Output: array anomalie (usato dallo step sintesi)
Durata: ~2 secondi
```

#### Step 7: `detect-missing-documents`
```
Input: allEvents + caseType
Azioni:
  1. Elimina documenti mancanti precedenti
  2. Controlla presenza per tipo caso
  3. Inserisce nuovi documenti mancanti nel DB
Output: array documenti mancanti (usato dallo step sintesi)
Durata: ~1 secondo
```

#### Step 8: `generate-synthesis`
```
Input: allEvents + anomalies + missingDocs + metadata caso
Azioni:
  1. Chiama Mistral Large con prompt di sintesi
  2. Ottiene versione corrente del report (per incremento)
  3. Inserisce nuovo report nel DB con version = max + 1
Output: { synthesis, wordCount, reportId, reportVersion }
Durata: ~30-60 secondi
```

#### Step 9: `finalize`
```
Input: extractionResults + metadata
Azioni:
  1. Marca tutti i documenti processati come 'completato'
  2. Aggiorna timestamp caso
  3. Inserisce audit log con metriche:
     documentsProcessed, newEventsInserted, totalEvents,
     anomaliesDetected, missingDocuments, reportVersion,
     synthesisWordCount
Output: nessuno
Durata: ~2 secondi
```

### Principio Architetturale: "Zero Data Through Inngest"
```
                     Supabase DB
                    ↗ READ   ↘ WRITE
     ┌──────────────────────────────────────┐
     │          Inngest Orchestrazione      │
     │  (vede solo: ID, conteggi, flags)    │
     └──────────────────────────────────────┘
                    ↕ HTTP (tiny responses)
              Vercel Serverless Functions
                    ↕ HTTP
                 Mistral API EU
```

Ogni step:
- **Legge** dati grandi (testo, pagine) direttamente dal DB
- **Scrive** risultati (eventi, report) direttamente nel DB
- **Ritorna** a Inngest solo conteggi e flag (~10-50 bytes)

Questo elimina il rischio di "connection reset" causato da risposte HTTP grandi.

---

## Tempi di Elaborazione Tipici

| Documento | Pagine | OCR | Estrazione | Report | Totale |
|-----------|--------|-----|------------|--------|--------|
| Referto singolo | 1-3 | ~5s | ~30-60s | ~30s | ~1-2 min |
| Cartella clinica breve | 10-20 | ~15s | ~60s | ~30s | ~2-3 min |
| Cartella clinica media | 30-50 | ~30s | ~60-90s | ~45s | ~3-4 min |
| Cartella clinica grande | 100+ | ~60s | ~60-90s (parallelo) | ~60s | ~4-5 min |

> I tempi dipendono dal carico dei server Mistral e dalla complessità del documento.
> L'estrazione scala sub-linearmente grazie al parallelismo dei chunk.

---

## Gestione Errori e Resilienza

### Retry automatico su errori Mistral API
- 3 tentativi con backoff esponenziale (2s, 4s, 8s)
- Copre: errori 500, 502, 503, 429 (rate limit)
- Copre: errori di rete (fetch failed, ECONNRESET, timeout)
- Timeout per singola chiamata API: 120 secondi

### Timeout Vercel
- maxDuration: 800 secondi (max piano Pro con Fluid Compute)
- Ogni step Inngest ha il suo timeout indipendente
- Se uno step fallisce, Inngest riprova automaticamente

### Polling frontend
- L'app controlla lo stato ogni 5 secondi
- Avviso "potenzialmente bloccato" dopo 15 minuti senza aggiornamenti

---

## Sicurezza

- **GDPR Art. 9**: tutti i dati sanitari in EU (Supabase Frankfurt, Mistral EU)
- **RLS** (Row Level Security): ogni utente vede solo i propri dati
- **Autenticazione**: su ogni route protetta
- **Validazione**: Zod su ogni input API/form
- **No dati sensibili nei log**: solo ID e codici caso
- **Rate limiting**: su endpoint di upload e processing
- **Headers sicuri**: CSP, HSTS, X-Frame-Options

---

## Amministrazione

### Pannello Admin (`/admin`)
- Statistiche sistema (utenti, casi, documenti, eventi)
- Monitor elaborazioni in corso e bloccate
- Log errori recenti
- Audit log completo

### API Admin
- `POST /api/admin/reset` — reset completo dati (richiede auth admin)

---

## Formati di Export

| Formato | Contenuto |
|---------|-----------|
| **HTML** | Report completo formattato per browser/stampa |
| **CSV** | Tabella eventi per analisi in Excel |
| **DOCX** | Documento Word per relazione peritale |
