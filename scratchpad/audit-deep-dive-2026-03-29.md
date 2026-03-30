# Deep Dive Audit MedLav — 29 Marzo 2026 (Round 2)

## Metodologia
3 agenti paralleli hanno scavato in profondita su:
1. Prompt di estrazione, schemi JSON, validazione dati
2. Client Mistral, error handling, resilienza API
3. Copertura test e gap critici

---

## NUOVI PROBLEMI TROVATI

### 🔴 CRITICI (da risolvere subito)

#### D1. Report troncati salvati silenziosamente nel DB
**File:** `src/services/synthesis/synthesis-service.ts:406`
**Problema:** Quando il LLM ritorna `finishReason='length'` (report troncato), il sistema logga l'errore ma **salva comunque il report nel DB** e marca il caso come "completato". Il perito vede un report incompleto senza saperlo.
**Fix:** Bloccare il salvataggio se il report e' troncato. Lanciare errore → Inngest riprova con budget token piu' alto, o marcare caso come "errore_generazione".

#### D2. Document summaries fallite sostituite con placeholder
**File:** `src/services/synthesis/document-summarizer.ts:119-128`
**Problema:** Se la summarizzazione di un documento fallisce, il sistema inserisce `"[Riassunto non disponibile — errore: ...]"` come summary. La sintesi usa questo placeholder come se fosse contenuto reale.
**Fix:** Lanciare errore su fallimento summary → Inngest riprova il batch. NON usare placeholder come input per la sintesi.

#### D3. RAG guidelines fallite silenziosamente
**File:** `src/services/synthesis/section-generator.ts:204-206`
**Problema:** Se il retrieval delle linee guida RAG fallisce, ritorna stringa vuota. Il report viene generato senza linee guida ma senza segnalazione.
**Fix:** Loggare warning nel report metadata `generation_metadata.ragFailed: true`. Il perito deve sapere se le linee guida non sono state considerate.

---

### 🟠 ALTI (prossimo sprint)

#### D4. Nessuna validazione formato date nell'estrazione
**File:** `src/services/extraction/extraction-schemas.ts:8-9`
**Problema:** Il campo `eventDate` e' `z.string()` senza regex. Accetta qualsiasi stringa, incluse date in formato italiano DD/MM/YYYY o DD.MM.YYYY che poi rompono i calcoli downstream.
**Fix:** `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` oppure validazione post-parse.

#### D5. Stall detection solo su contenuto vuoto
**File:** `src/lib/mistral/client.ts:346-350`
**Problema:** Lo stall detection (stream bloccato per 90s) si attiva solo se `content.length === 0`. Se il LLM genera 500 token e poi si blocca, il contenuto parziale viene accettato silenziosamente.
**Fix:** Tracciare tempo dall'ultimo token ricevuto, non solo dal contenuto totale.

#### D6. Model versions non pinnate (-latest)
**File:** `src/lib/mistral/client.ts:23-32`
**Problema:** Tutti i modelli usano `-latest` alias. Mistral puo' aggiornare il modello senza preavviso, cambiando qualita/stile del report.
**Fix:** Pinnare a versioni specifiche dopo test. Aggiungere check periodico versione.

#### D7. Confidence scoring vago nel prompt di estrazione
**File:** `src/services/extraction/extraction-prompts.ts:163`
**Problema:** Il prompt conflate qualita OCR (testo chiaro/illeggibile) con confidence estrazione (certezza del LLM). Il perito non sa se confidence 60 significa "testo poco leggibile" o "LLM poco sicuro".
**Fix:** Separare in `ocrQuality` (0-100) e `extractionConfidence` (0-100).

#### D8. Validazione nomi medici: edge case con parole comuni
**File:** `src/services/extraction/extraction-service.ts:590-603`
**Problema:** La validazione cerca singole parole >= 3 chars nell'OCR. "Rossi" in "Rossiglione" matcha. "Prof" matcha ovunque. Nomi composti ("De Luca") controllati parola per parola.
**Fix:** Usare word boundary matching (`\brossi\b`) invece di `includes()`.

---

### 🟡 MEDI

#### D9. extraction_reasoning non validato
**File:** `src/services/extraction/extraction-service.ts:511-513`
**Problema:** Il campo `extraction_reasoning` e' obbligatorio nel prompt ma non validato nel parser. Eventi senza reasoning accettati silenziosamente.

#### D10. Nessun supporto esplicito multi-lingua
**File:** `src/services/extraction/extraction-prompts.ts:144-149`
**Problema:** Il prompt non menziona documenti in tedesco (comuni in Alto Adige, come nel benchmark Resch).

#### D11. Abbreviazioni mediche non validate
**File:** `src/services/extraction/extraction-prompts.ts:162`
**Problema:** Il LLM espande abbreviazioni ma le espansioni non sono verificate contro dizionario medico.

---

## GAP DI TEST CRITICI

### Funzioni senza NESSUN test (rischio medico-legale):

| Funzione | File | Rischio |
|----------|------|---------|
| `validateExtractedNamesAgainstOcr()` | extraction-service.ts | Nomi hallucinated nel report |
| `inferMissingDates()` (con fix confidence=25) | extraction-service.ts | Date errate nella timeline |
| `findDiscrepancyInGroup()` (fix C1) | event-consolidator.ts | Conflitti diagnosi non escalati |
| `deduplicateWithinDocument()` | extraction-service.ts | Eventi legittimi mergiati |
| `safeJsonParse()` (3-level repair) | extraction-service.ts | JSON troncato accettato |
| OCR service completo | ocr-service.ts | Testo garbled nell'estrazione |
| Export DOCX/HTML con placeholder | docx-export.ts, html-export.ts | Sezioni placeholder non renderizzate |

### Test da scrivere con priorita CRITICA:

**1. validateExtractedNamesAgainstOcr** — 5 test case:
- Nome medico NON nell'OCR → nullificato
- Nome medico nell'OCR → preservato
- Struttura NON nell'OCR → nullificata
- OCR vuoto → eventi invariati
- Partial match (solo cognome) → preservato

**2. inferMissingDates con confidence cap** — 5 test case:
- Data inferita da stessa pagina → confidence <= 25
- Data inferita da pagina adiacente → confidence <= 25
- Nessun donor disponibile → data resta sentinel
- Tutti eventi senza data → nessuna inferenza
- reliabilityNotes contiene "[AUTO] Data INFERITA"

**3. Discrepancy escalation (C1)** — 4 test case:
- Diagnosi discordante → confidence 30, requiresVerification true
- Medico discordante → requiresVerification true
- Fonti concordi → discrepancy "presente in piu documenti"
- Stesso documento → nessuna discrepancy

---

## PIANO D'AZIONE

### Immediato (oggi)
- **D1**: Bloccare salvataggio report troncati ← CRITICO
- Test per `validateExtractedNamesAgainstOcr` ← CRITICO
- Test per `inferMissingDates` con cap ← CRITICO
- Test per discrepancy escalation ← CRITICO

### Prossimo sprint
- D2: Fallimento summary → errore non placeholder
- D3: RAG failure → flag in metadata
- D4: Validazione formato date Zod
- D5: Stall detection migliorato
- D8: Word boundary per nomi
- Test per OCR service, export, section generator

### Backlog
- D6: Pin model versions
- D7: Separare ocrQuality da extractionConfidence
- D9-D11: Reasoning, multi-lingua, abbreviazioni

---

## STATO COMPLESSIVO

L'infrastruttura e' solida (retry, circuit breaker, anti-hallucination rules). I problemi sono concentrati in due aree:

1. **Silent degradation**: il sistema preferisce produrre un risultato imperfetto piuttosto che fallire. Per un'app consumer va bene. Per un'app medico-legale NO — meglio un errore esplicito che un report sbagliato silenziosamente.

2. **Test gap sui fix critici**: i 3 fix C1/C2/C3 applicati oggi NON hanno test dedicati. Devono essere scritti prima di considerare il codice production-ready.
