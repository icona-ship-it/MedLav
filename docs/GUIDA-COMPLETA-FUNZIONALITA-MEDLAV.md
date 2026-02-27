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

## Pipeline di Elaborazione (Dettaglio Tecnico)

Quando l'utente clicca "Avvia Elaborazione", si attiva una pipeline orchestrata da Inngest con i seguenti step:

```
[Upload file] → [Avvia] → Inngest Pipeline:

  Step 1: fetch-case-metadata
     │    Legge caso + documenti dal DB
     │    Marca documenti come "in_coda"
     │    Durata: ~1 secondo
     │
  Step 2: ocr-doc-{id} (uno per documento)
     │    Per ogni documento:
     │    1. Genera URL firmato da Supabase Storage
     │    2. Chiama Mistral OCR API (mistral-ocr-latest)
     │    3. Riceve testo OCR per ogni pagina
     │    4. Salva pagine nel DB (tabella "pages")
     │    5. Aggiorna conteggio pagine sul documento
     │    Durata: ~10-30 secondi per documento
     │
  Step 3a: plan-chunks-{id}
     │    Calcola quante "fette" servono per il documento
     │    (10 pagine per chunk)
     │    Durata: istantaneo
     │
  Step 3b: extract-{id}-p{start}-{end} (IN PARALLELO)
     │    Per ogni chunk di 10 pagine, contemporaneamente:
     │    1. Legge il testo delle pagine dal DB
     │    2. Chiama Mistral Large (mistral-large-latest) con json_object
     │    3. Il prompt chiede di estrarre TUTTI gli eventi clinici
     │    4. Parsa la risposta JSON con handler robusto
     │    5. Salva gli eventi DIRETTAMENTE nel DB (tabella "events")
     │    6. Ritorna solo il conteggio a Inngest
     │    Durata: ~30-90 secondi per chunk
     │    NOTA: tutti i chunk girano in parallelo!
     │
  Step 4: consolidate-events
     │    Legge tutti gli eventi dal DB
     │    Riordina cronologicamente
     │    Aggiorna i numeri d'ordine
     │    Durata: ~2 secondi
     │
  Step 5: link-images-to-events (se ci sono immagini)
     │    Collega immagini OCR agli eventi tramite sourcePages
     │    Durata: ~1-2 secondi
     │
  Step 6: detect-anomalies
     │    Analisi algoritmica degli eventi per rilevare:
     │    - Ritardo diagnostico (>90 giorni)
     │    - Gap post-chirurgico (>60 giorni senza follow-up)
     │    - Gap documentale (>6 mesi senza documentazione)
     │    - Complicanza non gestita
     │    - Consenso non documentato (solo con più documenti)
     │    - Diagnosi contraddittorie
     │    - Terapia senza follow-up (solo con più documenti)
     │    Salva anomalie nel DB
     │    Durata: ~2 secondi
     │
  Step 7: detect-missing-documents
     │    Identifica documentazione assente ma clinicamente attesa
     │    in base al tipo di caso e agli eventi trovati
     │    Durata: ~1 secondo
     │
  Step 8: generate-synthesis
     │    Chiama Mistral Large per generare il report completo:
     │
     │    PARTE 1 — RIASSUNTO DEL CASO (300-500 parole)
     │      Sintesi narrativa: paziente, decorso, interventi,
     │      complicanze, stato attuale, criticità
     │
     │    PARTE 2 — CRONOLOGIA MEDICO-LEGALE
     │      Elenco cronologico completo categorizzato:
     │      (A) Cartella clinica
     │      (B) Referti controlli medici
     │      (C) Referti radiologici/strumentali
     │      (D) Esami ematochimici
     │
     │    PARTE 3 — ELEMENTI DI RILIEVO MEDICO-LEGALE
     │      Criticità, anomalie, nesso causale
     │
     │    Salva report nel DB (tabella "reports")
     │    Durata: ~30-60 secondi
     │
  Step 9: finalize
         Marca tutti i documenti come "completato"
         Aggiorna timestamp caso
         Scrive audit log
         Durata: ~2 secondi

[Pipeline completata → risultati visibili nell'app]
```

---

## Dettaglio Estrazione Eventi

### Cosa viene estratto

Per ogni documento, il sistema estrae eventi clinici strutturati con:

| Campo | Descrizione |
|-------|-------------|
| `eventDate` | Data dell'evento (YYYY-MM-DD) |
| `datePrecision` | Precisione: giorno, mese, anno, sconosciuta |
| `eventType` | Tipo: visita, esame, diagnosi, intervento, terapia, ricovero, follow-up, referto, prescrizione, consenso, complicanza, altro |
| `title` | Titolo descrittivo breve |
| `description` | Descrizione completa e fedele dal documento |
| `sourceType` | Fonte: cartella_clinica (A), referto_controllo (B), esame_strumentale (C), esame_ematochimico (D), altro |
| `diagnosis` | Diagnosi associata (se presente) |
| `doctor` | Nome del medico |
| `facility` | Struttura sanitaria |
| `confidence` | Affidabilità 0-100 |
| `requiresVerification` | Se necessita revisione manuale |
| `sourceText` | Frase chiave dal testo originale (max 200 char) |
| `sourcePages` | Numeri di pagina sorgente |

### Regole di estrazione per tipo di fonte

**(A) CARTELLA CLINICA** — il sistema estrae:
- Diagnosi di ingresso, peso, altezza, parametri vitali
- Esami ematochimici con TUTTI i valori numerici e unità di misura
- Anamnesi patologica e terapie (farmaco, dosaggio, via, frequenza)
- Descrizione operatoria INTEGRALE (tipo, operatori, tecnica, tempi)
- Cartella anestesiologica (ASA score, farmaci, parametri)
- Diario medico/infermieristico (SOLO eventi avversi e complicanze)
- Lettera di dimissione (diagnosi, condizioni, terapia, follow-up)

**(B) REFERTI CONTROLLI MEDICI** — estratti integralmente:
- Visite specialistiche, follow-up, visite ambulatoriali
- Per ogni referto: data, specialista, contenuto completo, conclusioni

**(C) REFERTI RADIOLOGICI ED ESAMI STRUMENTALI** — estratti integralmente:
- RX, TAC/TC, RM, ecografie, ECG, scintigrafie
- Per ogni esame: data, tipo, distretto, descrizione, conclusioni

**(D) ESAMI EMATOCHIMICI** — tutti i valori:
- Emocromo, biochimica, coagulazione, markers
- Per ogni esame: data, tutti i valori numerici con unità di misura

### Chunking per documenti grandi

Documenti con più di ~10 pagine vengono divisi in "chunk" di 10 pagine ciascuno:
- Ogni chunk viene elaborato **in parallelo** (contemporaneamente)
- Un documento da 100 pagine → 10 chunk → tutti processati insieme → ~60-90 secondi totali
- Senza parallelismo sarebbero 10-15 minuti

---

## Dettaglio Report Generato

Il report medico-legale ha 3 parti obbligatorie:

### Parte 1 — Riassunto del Caso (300-500 parole)
Sintesi narrativa che include:
- Presentazione del paziente e motivo del ricovero
- Decorso clinico con passaggi critici
- Interventi effettuati e loro esiti
- Complicanze insorte
- Stato attuale e prognosi
- Elementi critici per valutazione medico-legale

### Parte 2 — Cronologia Medico-Legale (senza limiti)
Elenco cronologico **completo** di TUTTI i fatti medici:
- Ogni voce con: data, categoria fonte (A/B/C/D), contenuto fedele
- NON una sintesi, ma copia organizzata delle evidenze cliniche
- SENZA citazione di numeri di pagina
- In ordine cronologico

### Parte 3 — Elementi di Rilievo Medico-Legale (200-400 parole)
- Punti critici per la valutazione peritale
- Eventuali omissioni o ritardi
- Anomalie nella gestione clinica
- Documentazione mancante rilevante
- Nesso causale tra gestione e danni

---

## Anomalie Rilevate Automaticamente

| Tipo | Soglia | Descrizione |
|------|--------|-------------|
| Ritardo diagnostico | >90 giorni | Tra prima visita e diagnosi |
| Gap post-chirurgico | >60 giorni | Senza follow-up dopo intervento |
| Gap documentale | >6 mesi | Periodo senza documentazione (richiede min. 5 eventi) |
| Complicanza non gestita | 14 giorni | Complicanza senza trattamento documentato |
| Consenso non documentato | - | Solo con documenti da più fonti |
| Diagnosi contraddittoria | 60 giorni | Diagnosi diverse con <20% sovrapposizione |
| Terapia senza follow-up | 30 giorni | Solo con documenti da più fonti |

> Le anomalie sono **conservative** — segnalano solo problemi chiari per evitare falsi positivi.

---

## Formati di Export

| Formato | Contenuto |
|---------|-----------|
| **HTML** | Report completo formattato per browser/stampa |
| **CSV** | Tabella eventi per analisi in Excel |
| **DOCX** | Documento Word per relazione peritale |

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
- **Reset dati**: pulisce tutto il DB tranne gli utenti

### API Admin
- `POST /api/admin/reset` — reset completo dati (richiede auth admin)

---

## Tempi di Elaborazione Tipici

| Documento | Pagine | OCR | Estrazione | Totale |
|-----------|--------|-----|------------|--------|
| Referto singolo | 1-3 | ~5s | ~30-60s | ~1 min |
| Cartella clinica breve | 10-20 | ~15s | ~60s | ~2 min |
| Cartella clinica media | 30-50 | ~30s | ~60-90s | ~3 min |
| Cartella clinica grande | 100+ | ~60s | ~60-90s (parallelo) | ~3-5 min |

> I tempi dipendono dal carico dei server Mistral e dalla complessità del documento.

---

## Architettura Chiave

```
Browser (React 19)
    ↕ HTTPS
Vercel (Next.js 15, fra1)
    ↕ SQL + Auth          ↕ HTTP
Supabase (Frankfurt)    Mistral API (EU)
    ↕ Events
Inngest (Cloud, orchestrazione step)
    ↕ HTTP callbacks
Vercel (serverless functions)
```

### Principio "Zero data through Inngest"
Inngest orchestra gli step ma **nessun dato grande** passa attraverso le sue risposte HTTP:
- Il testo OCR è nel DB (tabella `pages`)
- Gli eventi estratti vanno direttamente nel DB (tabella `events`)
- Il report va direttamente nel DB (tabella `reports`)
- Inngest vede solo: ID, conteggi, flag di successo/errore
