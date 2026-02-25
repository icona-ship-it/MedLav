# MedLav

**La documentazione clinica diventa una cronistoria strutturata in pochi minuti.**

---

## Cos'e MedLav?

MedLav e un'applicazione web pensata per i **medici legali** (CTU, CTP, consulenti stragiudiziali).

Quando un medico legale riceve un incarico, deve leggere decine o centinaia di pagine di documentazione clinica (cartelle cliniche, referti, esami del sangue, radiografie) e ricostruire a mano la **cronistoria** del paziente: cosa e successo, quando, chi l'ha fatto, in quale struttura.

Questo lavoro richiede ore. MedLav lo fa in **pochi minuti**.

---

## Come funziona?

Il processo e semplice, in 3 passaggi:

### 1. Carica i documenti

Il medico legale trascina i file nella piattaforma: PDF, immagini, scansioni. Anche documenti di bassa qualita o con parti scritte a mano.

### 2. L'intelligenza artificiale analizza

Il sistema:
- **Legge** ogni documento (anche quelli scritti a mano) grazie all'OCR
- **Identifica** ogni evento clinico: visite, esami, interventi, diagnosi, terapie
- **Ordina** tutto in sequenza cronologica
- **Segnala** anomalie (es. un ritardo diagnostico, un gap nella documentazione)
- **Indica** quali documenti mancano rispetto al quadro clinico

### 3. Report pronto

Il medico legale riceve:
- Una **cronistoria strutturata** con tutti gli eventi in ordine
- Un elenco di **anomalie** rilevate automaticamente
- Una lista di **documenti mancanti**
- Una **sintesi medico-legale** pronta da inserire nelle relazioni peritali
- Tutto **esportabile** in DOCX (Word), CSV (Excel) o HTML

---

## Cosa lo rende speciale?

| Caratteristica | Descrizione |
|---|---|
| **OCR intelligente** | Legge anche documenti scritti a mano, timbri, scansioni di bassa qualita |
| **Cronistoria automatica** | Ogni evento ha data, tipo, fonte, medico, struttura e livello di affidabilita |
| **Rilevamento anomalie** | Trova ritardi diagnostici, gap documentali, incongruenze tra documenti |
| **Documenti mancanti** | Segnala automaticamente cosa manca rispetto al quadro clinico |
| **Modifiche manuali** | Il medico puo modificare, eliminare o aggiungere eventi a mano |
| **Export multi-formato** | DOCX per le relazioni, CSV per analisi dati, HTML per consultazione rapida |
| **Tracciamento elaborazione** | Barra di progresso che mostra in tempo reale lo stato dell'analisi |
| **Annullamento** | Possibilita di annullare un'elaborazione in qualsiasi momento |

---

## Sicurezza e privacy

MedLav tratta **dati sanitari sensibili** (protetti dal GDPR, Articolo 9). La sicurezza non e un optional, e il fondamento:

- **Tutti i dati restano in Europa** (server a Francoforte, Germania)
- **L'intelligenza artificiale e europea** (Mistral AI, azienda francese — i dati non escono mai dall'UE)
- **Crittografia** su tutti i dati in transito e a riposo
- **Autenticazione** con email e password
- **Isolamento dei dati** — ogni utente vede solo i propri casi (Row Level Security)
- **Audit log** — ogni azione e registrata per tracciabilita
- **Nessun dato sensibile nei log** — solo codici e ID, mai nomi o diagnosi

---

## Tecnologie utilizzate

### Spiegazione semplice

| Cosa fa | Tecnologia | A cosa serve |
|---|---|---|
| **Il sito web** | Next.js + React | Costruisce le pagine che vedi nel browser |
| **L'aspetto grafico** | Tailwind CSS + shadcn/ui | Rende tutto bello e facile da usare |
| **Il database** | Supabase (PostgreSQL) | Salva tutti i dati: casi, documenti, eventi |
| **Lo storage dei file** | Supabase Storage | Conserva i PDF e le immagini caricate |
| **L'accesso utente** | Supabase Auth | Gestisce login, registrazione, sicurezza |
| **L'intelligenza artificiale** | Mistral AI (Francia) | Legge i documenti e estrae le informazioni |
| **I lavori lunghi** | Inngest | Gestisce l'elaborazione che dura minuti senza bloccare il sito |
| **L'hosting** | Vercel | Mette il sito online, veloce e affidabile |
| **Il linguaggio** | TypeScript | Il linguaggio di programmazione, rigoroso e sicuro |

### Dettaglio tecnico

Per chi vuole saperne di piu:

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript strict
- **UI Components**: shadcn/ui + Radix UI (componenti accessibili)
- **Styling**: Tailwind CSS v4
- **Database**: Supabase PostgreSQL (regione EU - Francoforte)
- **File Storage**: Supabase Storage (regione EU)
- **Autenticazione**: Supabase Auth (email/password)
- **AI - OCR**: Mistral OCR (mistral-ocr-latest) per leggere documenti
- **AI - Visione**: Mistral Pixtral Large per leggere immagini e manoscritti
- **AI - Analisi**: Mistral Large per estrarre eventi e generare sintesi
- **Job Queue**: Inngest (elaborazione asincrona a step, con retry automatico)
- **ORM**: Drizzle ORM (query tipizzate e sicure)
- **Validazione**: Zod (validazione input a ogni confine di sistema)
- **Export**: docx.js (DOCX), Papa Parse (CSV), HTML nativo
- **Hosting**: Vercel (regione EU - Francoforte)

---

## Architettura

```
Utente (Browser)
    |
    v
Vercel (Next.js) -----> Supabase (Database + Storage + Auth)
    |                         [Francoforte, EU]
    |
    +---> Inngest (Job Queue) ---> Mistral AI (OCR + Analisi)
                                        [Francia, EU]
```

**Flusso di elaborazione:**

```
Upload documenti
    |
    v
In coda --> OCR (lettura) --> Estrazione eventi --> Validazione --> Completato
                                    |
                                    v
                            Consolidamento eventi
                            Rilevamento anomalie
                            Documenti mancanti
                            Generazione sintesi
```

Ogni passaggio e **indipendente e riprovabile**: se uno fallisce, viene ritentato automaticamente senza ricominciare da zero.

---

## A chi si rivolge?

- **Medici legali** (CTU e CTP nominati dai tribunali)
- **Consulenti stragiudiziali** (perizie per studi legali e assicurazioni)
- **Studi medico-legali** che gestiscono molti casi contemporaneamente

---

## Numeri

- Un caso che richiede **ore di lavoro manuale** viene elaborato in **pochi minuti**
- Supporta **PDF, immagini, scansioni** di qualsiasi qualita
- **100% dei dati** trattati in Europa
- Progettato per **20-100 utenti** nel primo anno

---

*MedLav — Trasforma la documentazione clinica in conoscenza strutturata.*
