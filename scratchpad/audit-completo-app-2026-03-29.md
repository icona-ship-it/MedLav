# Audit Completo MedLav — 29 Marzo 2026

## Metodologia
5 agenti paralleli hanno analizzato l'intera app su:
1. Accuratezza medico-legale dei prompt e delle direttive
2. Export e UI — compatibilita con la nuova struttura sezioni
3. GDPR e sicurezza dati sanitari
4. Pipeline OCR e integrita dei dati
5. Backward compatibility dopo ristrutturazione

---

## STATO GENERALE

| Area | Stato | Problemi |
|------|-------|----------|
| **Build/Test/Lint** | ✅ 0 errori, 0 warning, 484 test | — |
| **Struttura report** | ✅ Ristrutturata per ruolo | — |
| **Prompt medico-legali** | ✅ Eccellenti | 2 miglioramenti consigliati |
| **Anti-hallucination** | ✅ Regole forti | 1 chiarimento wording |
| **Export HTML/DOCX** | ✅ Compatibile | Nessuna modifica necessaria |
| **UI componenti** | ✅ Dinamici | Nessuna modifica necessaria |
| **GDPR** | ✅ Quasi completo | 4 gap da colmare |
| **Pipeline OCR** | ⚠️ Rischi dati | 3 critici, 7 alti |
| **Backward compat** | ✅ Nessun breakage | — |

---

## PROBLEMI DA RISOLVERE (ordinati per priorita)

### 🔴 CRITICI (3) — Da risolvere prima di usare in casi reali

#### C1. Conflitti diagnosi auto-risolti silenziosamente
**File:** `src/services/consolidation/event-consolidator.ts:124-131`
**Problema:** Quando due documenti riportano diagnosi diverse per lo stesso evento, il sistema sceglie automaticamente una fonte senza input dell'utente. In ambito medico-legale, diagnosi discordanti possono indicare errore o frode.
**Impatto:** Dato sbagliato nel report → conseguenze legali.
**Fix:** NON auto-risolvere conflitti di diagnosi. Flaggare `confidence: 30, requiresVerification: true`. Nel report, citare ENTRAMBE le fonti.

#### C2. Nomi medici hallucinated non validati
**File:** `src/services/extraction/extraction-service.ts:527-529`
**Problema:** L'estrazione puo' generare nomi di medici/strutture che NON esistono nel testo OCR originale. Nessuna validazione post-estrazione.
**Impatto:** Attribuzione errata in contenzioso.
**Fix:** Validare che ogni `doctor` e `facility` estratto compaia nel `sourceText`. Se non presente, impostare a `null` con `requiresVerification: true`.

#### C3. Inferenza date errate
**File:** `src/services/extraction/extraction-service.ts:355-390` (`inferMissingDates()`)
**Problema:** Date mancanti vengono inferite da eventi vicini sulla stessa pagina. Puo' assegnare date SBAGLIATE (es: intervento datato come la visita precedente).
**Impatto:** Timeline clinica corrotta.
**Fix:** Rimuovere l'inferenza automatica o wrappare con `confidence: 20, requiresVerification: true, datePrecision: 'inferita'`.

---

### 🟠 ALTI (9) — Da risolvere nel prossimo sprint

#### A1. Confidenza OCR troppo permissiva
**File:** `src/services/ocr/ocr-service.ts:344-359`
**Problema:** Minimo confidence 10% — nessun documento viene mai rifiutato. Testo garbled passa senza alert.
**Fix:** Soglia minima per pagina: rifiutare pagine <60%. Alert per documenti con media <70%.

#### A2. Classificazione documenti senza soglia
**File:** `src/services/classification/document-classifier.ts:86-106`
**Problema:** Documenti classificati con 30% confidence usati comunque. Verbale operatorio classificato "altro" = analisi chirurgica mancata.
**Fix:** Soglia minima 70%. Sotto 70%: flag per review manuale.

#### A3. Immagini diagnostiche: rischio misinterpretazione AI
**File:** `src/services/image-analysis/diagnostic-image-analyzer.ts`
**Problema:** Pixtral puo' descrivere patologie inesistenti o mancarne di reali. Confidence default 50%.
**Fix:** Soglia 85% per inclusione nel report. Watermark: "Descrizione AI — richiede conferma specialistica".

#### A4. CSV export senza opzione anonimizzazione
**File:** `src/app/api/cases/[id]/export/csv/route.ts`
**Problema:** HTML e DOCX supportano `?anonymize=true`, CSV no. Dati paziente esposti.
**Fix:** Aggiungere parametro `anonymize` al CSV export.

#### A5. Rate limiting mancante su 4 endpoint
**Files:** `report-ratings/route.ts`, `demo/route.ts`, `stripe/checkout/route.ts`, `stripe/portal/route.ts`
**Fix:** Aggiungere `checkRateLimit()` con limiti appropriati.

#### A6. Cancellazione account senza verifica
**File:** `src/app/(dashboard)/settings/actions.ts`
**Problema:** `deleteMyAccount()` eseguita con singola chiamata API senza conferma email o 2FA.
**Fix:** Richiedere reinserimento password o codice email prima della cancellazione.

#### A7. Hallucination detection assente nell'estrazione
**File:** `src/services/extraction/extraction-service.ts`
**Problema:** Nessun check che il testo citato (`sourceText`) sia effettivamente presente nell'OCR originale.
**Fix:** Verificare che `sourceText` corrisponda (fuzzy match) a un frammento dell'OCR entro 200 chars.

#### A8. Chiarire istruzione "completezza" nei prompt
**File:** `src/services/synthesis/synthesis-prompts.ts:45`
**Attuale:** "Privilegia la completezza alla brevita"
**Fix:** Cambiare in: "Privilegia la completezza alla brevita — riporta TUTTI i fatti documentati senza omissioni, ma NON inventare dettagli per allungare il report"

#### A9. ITT overlap: periodi sovrapposti contati doppi
**File:** `src/services/calculations/medico-legal-calc.ts:216-228`
**Problema:** Ricoveri sovrapposti sommati senza merge dei range temporali.
**Fix:** Merge dei range di date prima della somma.

---

### 🟡 MEDI (6) — Da pianificare

#### M1. ITP senza percentuale
**File:** `src/services/calculations/medico-legal-calc.ts:240-260`
**Problema:** ITP calcolato solo come range date, senza indicazione del grado (%).
**Fix:** Rinominare label a "ITP giorni (grado da determinare dal perito)".

#### M2. Validator non-bloccante
**File:** `src/services/synthesis/report-validator.ts`
**Problema:** Warning (date fantasma, duplicati) non bloccano il salvataggio.
**Fix:** Trattare date fantasma come errori. Richiedere conferma utente per export con warning.

#### M3. Missing doc detection: falsi positivi
**File:** `src/services/validation/missing-doc-detector.ts`
**Problema:** Keyword matching troppo ampio ("dimissione" nel testo narrativo = documento presente).
**Fix:** Usare `documentType` come segnale primario, keywords come secondario.

#### M4. Nessun timeout sessione documentato
**Problema:** Timeout sessione Supabase non configurato esplicitamente.
**Fix:** Documentare default (60 min) o implementare custom.

#### M5. Audit log eliminato con account
**Problema:** GDPR Art. 17 richiede cancellazione, ma elimina anche traccia di audit.
**Fix:** Archiviare audit log anonimizzato prima della cancellazione.

#### M6. Codice morto: getExpectedSectionIds()
**File:** `src/services/synthesis/case-type-templates.ts:64-72`
**Problema:** Funzione esportata ma mai importata.
**Fix:** Rimuovere o marcare come @deprecated.

---

## NESSUN PROBLEMA TROVATO IN

- ✅ **Struttura sezioni per ruolo** (CTU/CTP/Stragiudiziale) — corretta e completa
- ✅ **Placeholder sections** — tutti con isPlaceholder=true, maxTokens=0, testo appropriato
- ✅ **[Ev.N] rimossi** — zero occorrenze residue nei prompt attivi
- ✅ **Token budget** — calibrati per 5-8K parole target
- ✅ **Export HTML/DOCX** — dinamici, nessun nome sezione hardcoded
- ✅ **UI report viewer** — dinamico, supporta qualsiasi struttura sezione
- ✅ **Section parser** — backward compatible con vecchi e nuovi nomi
- ✅ **Source linker** — graceful degradation senza [Ev.N] (fallback su date/titoli)
- ✅ **Anti-hallucination rules** — esemplari per contesto medico-legale
- ✅ **Objectivity rules** — impediscono opinioni AI, corretto per documento di lavoro
- ✅ **Terminologia medica** — ITT, ITP, danno biologico, nesso causale usati correttamente
- ✅ **Terminologia legale** — CTU, CTP, perizia, quesiti, ricorrente/resistente corretti
- ✅ **Cookie consent** — presente con riferimento GDPR Art. 9
- ✅ **Data export/deletion** — Art. 15, 17, 20 implementati
- ✅ **Data retention** — automatica, configurabile, cascading delete
- ✅ **Error messages** — nessun leak PII
- ✅ **Shared reports** — token UUID sicuro, scadenza, view count

---

## PIANO D'AZIONE RACCOMANDATO

### Fase A — Critici (prima dell'uso in casi reali)
1. Fix C1: Conflitti diagnosi → escalation utente
2. Fix C2: Validazione nomi medici vs OCR
3. Fix C3: Rimuovere/limitare inferenza date

### Fase B — Alti (prossimo sprint)
4. Fix A1: Soglia OCR 60%/pagina
5. Fix A2: Soglia classificazione 70%
6. Fix A3: Soglia immagini 85% + watermark
7. Fix A4: Anonimizzazione CSV
8. Fix A5: Rate limiting 4 endpoint
9. Fix A6: Verifica cancellazione account
10. Fix A7: Hallucination detection estrazione
11. Fix A8: Chiarire istruzione completezza
12. Fix A9: Merge ITT overlap

### Fase C — Medi (backlog)
13-18. Fix M1-M6

---

## CONCLUSIONE

L'app e' **ben architettata** con ottime pratiche di sicurezza, GDPR, e anti-hallucination. La ristrutturazione dei report e' stata completata con successo e verificata senza breakage.

I **3 problemi critici** riguardano l'integrita dei dati nella pipeline OCR → estrazione → consolidamento. Sono rischi reali in contesto medico-legale e devono essere risolti prima dell'uso in casi contestati. Non sono bug — sono limiti architetturali del sistema di estrazione AI che richiedono guardrail aggiuntivi.

**Rating complessivo: BUONO con riserve sulla pipeline dati. Pronto per uso interno/review, richiede fix critici per uso in contenzioso.**
