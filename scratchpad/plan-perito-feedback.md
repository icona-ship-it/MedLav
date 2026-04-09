# Piano: Fix Cronistoria Incompleta + Spese Mediche

## Overview

Due problemi segnalati dal perito reale (Dott. Lavini):
1. La sezione "Documentazione Medica" omette documenti (es. Pronto Soccorso) perché il filtro OCR nella generazione report usa un'allowlist troppo restrittiva
2. Il modulo "Analisi Spese Mediche" non analizza le spese — fa solo una cronistoria — perché il flusso `expenses_only` bypassa il report e l'analyzer è solo regex senza LLM

---

## PROBLEMA 1 — Cronistoria Incompleta

### Causa Root

In `src/services/synthesis/section-generator.ts:338-344`, `MEDICAL_DOC_TYPES` è un'allowlist che include solo 5 tipi:
```
cartella_clinica, referto_specialistico, esame_strumentale, esame_laboratorio, lettera_dimissione
```

Quando viene generata la sezione `documentazione_sanitaria`, il filtro `filterOcrForSection()` passa al LLM solo il testo OCR dei documenti con questi tipi. Documenti con tipo `pronto_soccorso`, `referto_controllo`, o qualsiasi tipo non in lista vengono esclusi.

Gli **eventi** estratti dal Pronto Soccorso passano il filtro (hanno `eventType: 'visita'`), ma senza il **testo OCR originale** il LLM non può riprodurre il contenuto dettagliato e li omette o li riduce a una riga.

### Fix

**Invertire la logica**: invece di un'allowlist di tipi medici, usare una **blocklist** di tipi NON medici. Tutto ciò che non è esplicitamente non-medico viene incluso nella documentazione sanitaria.

### File da modificare

1. **`src/services/synthesis/section-generator.ts`** (linee 332-370)
   - Rimuovere `MEDICAL_DOC_TYPES`
   - Cambiare `filterOcrForSection()` per la sezione `documentazione_sanitaria`: includere TUTTI i documenti TRANNE quelli in `NON_MEDICAL_DOC_TYPES` e `PERIZIA_DOC_TYPES`
   - La blocklist `NON_MEDICAL_DOC_TYPES` resta: `memoria_difensiva`, `documento_amministrativo`, `certificato`
   - Aggiungere `spese_mediche` alla blocklist medica (le spese non sono documentazione sanitaria)

2. **`src/services/synthesis/section-generator.test.ts`** (o file test esistente)
   - Test: documento `pronto_soccorso` viene incluso nella sezione documentazione sanitaria
   - Test: documento `memoria_difensiva` viene escluso
   - Test: documento `altro` viene incluso (già funziona, verify)

### Impatto stimato
- ~20 righe di codice modificate
- Rischio basso — la logica diventa più inclusiva, non più restrittiva

---

## PROBLEMA 2 — Spese Mediche Non Funzionano

### Cause Root (multiple)

1. **Schema estrazione**: nessun campo specifico per spese (importo, numero ricevuta, tipo farmaco) — i dati finiscono nel campo `description` come testo libero
2. **Analyzer** (`expense-analyzer.ts`): puro regex/keyword, no LLM — non può valutare congruità, classificare farmaci, o estrarre numeri ricevuta
3. **UI**: `expenses_only` trattato identico a `extraction_only` — mostra solo cronistoria
4. **Export HTML**: sempre timeline per entrambi i modi
5. **Export DOCX**: ha un branch per spese ma le colonne sono limitate
6. **Nessun export CSV/Excel** con le colonne che il perito vuole
7. **Domain knowledge** (`analisi-spese-mediche.ts`): esiste una spec dettagliata ma non viene usata perché il report è bypassato

### Strategia

Il perito vuole una **tabella strutturata** (Excel), non un report narrativo. La strategia è:

**A) Aggiungere un estrazione LLM dedicata per spese** che produce dati strutturati (importo, descrizione, numero scontrino, tipo farmaco, nesso con diagnosi)

**B) Mostrare i risultati nella UI** come tabella interattiva

**C) Export CSV/Excel** con le colonne richieste dal perito

### File da creare

1. **`src/services/expenses/expense-extractor.ts`** — NEW
   - Servizio LLM dedicato per estrarre spese da testo OCR
   - Schema output strutturato: `{ items: [{ date, description, amount, receiptNumber, drugType, category, facility, linkedDiagnosis, isJustified: null }] }`
   - Prompt specializzato per riconoscere scontrini farmacia, fatture, ricevute
   - `isJustified` sempre `null` — il perito decide la congruità

2. **`src/services/expenses/expense-extractor.test.ts`** — NEW
   - Test con mock di scontrini, fatture, ricevute farmacia

### File da modificare

3. **`src/services/expenses/expense-analyzer.ts`**
   - Integrare con il nuovo `expense-extractor.ts`
   - Mantenere backward compat con la struttura `ExpenseAnalysisResult`
   - Aggiungere i nuovi campi alla `ExpenseItem` interface

4. **`src/inngest/functions/process-case.ts`** (branch `expenses_only`)
   - Dopo OCR + estrazione standard, aggiungere step `extract-expenses` che chiama il nuovo extractor LLM sul testo OCR dei documenti `spese_mediche`
   - Salvare risultato in `perizia_metadata.expenseAnalysis`

5. **`src/app/(dashboard)/cases/[id]/client.tsx`**
   - Per `expenses_only`: mostrare tab "Spese" con tabella invece di sola cronistoria
   - Colonne: Data, Descrizione, Importo, N. Ricevuta, Tipo Farmaco, Categoria, Congruità (editabile dal perito)

6. **`src/app/api/cases/[id]/export/csv/route.ts`** (o equivalente)
   - Export CSV con le colonne richieste dal perito
   - Formato Excel-compatibile (UTF-8 BOM, separatore punto e virgola per locale IT)

7. **`src/app/api/cases/[id]/export/html/route.ts`**
   - Branch per `expenses_only`: generare tabella HTML invece di timeline

8. **`src/app/api/cases/[id]/export/docx/route.ts`**
   - Aggiornare colonne tabella DOCX con i nuovi campi

### Schema dati spese (nuovo)

```typescript
interface ExpenseItem {
  date: string;                    // data documento/scontrino
  description: string;             // descrizione prestazione/farmaco
  amount: number | null;           // importo in euro
  receiptNumber: string | null;    // numero scontrino/fattura/ricevuta
  drugType: string | null;         // tipo farmaco (dal codice scontrino)
  category: ExpenseCategory;       // farmaci, visite, esami, fisioterapia...
  facility: string | null;         // struttura/farmacia
  linkedDiagnosis: string | null;  // diagnosi correlata
  isJustified: boolean | null;     // null = da valutare dal perito
  notes: string | null;            // note aggiuntive
}
```

### Step di implementazione (ordinati)

#### Fase 1 — Fix cronistoria (Problema 1) — URGENTE
1. Fix `filterOcrForSection()` in section-generator.ts
2. Test
3. Commit

#### Fase 2 — Expense extractor LLM
4. Creare `expense-extractor.ts` con prompt + schema
5. Test con mock
6. Aggiornare `ExpenseItem` interface in `expense-analyzer.ts`

#### Fase 3 — Pipeline integration
7. Aggiungere step `extract-expenses` nel branch `expenses_only` di process-case.ts
8. Salvare risultato strutturato in perizia_metadata

#### Fase 4 — UI
9. Creare componente tabella spese in `cases/[id]/`
10. Integrare in client.tsx per `expenses_only`

#### Fase 5 — Export
11. CSV export con colonne richieste
12. Fix HTML export per expenses
13. Aggiornare DOCX export

---

## Strategia di Testing

- **Problema 1**: Unit test su `filterOcrForSection` con doc tipo `pronto_soccorso`
- **Problema 2**: 
  - Unit test expense-extractor con mock LLM
  - Unit test CSV export format
  - Integration test pipeline expenses_only
  - E2E: upload scontrino → tabella spese visibile

## Considerazioni GDPR

- Gli importi delle spese mediche sono dati personali ma NON categoria speciale (Art. 9)
- Il tipo di farmaco PUÒ rivelare condizioni di salute → trattare come dato sensibile
- Logging: mai loggare importi, numeri ricevuta, nomi farmaci — solo conteggi
- Export CSV: avvertimento che contiene dati personali

## Rischi e Mitigazioni

| Rischio | Mitigazione |
|---------|-------------|
| LLM non riconosce formato scontrino farmacia | Prompt con esempi di formati comuni italiani |
| Importo estratto errato | Validazione range + warning se outlier |
| Troppe spese per un singolo caso | Paginazione + limite 500 items |
| Tipo farmaco non identificabile | Campo nullable, perito completa |
| Cronistoria: troppi doc ora inclusi | Nessun rischio — il perito vuole TUTTI i doc |
