# Valutazione d'Impatto sulla Protezione dei Dati (DPIA)

## ai sensi dell'Art. 35 del Regolamento (UE) 2016/679 (GDPR)

**Titolare del Trattamento:** MedLav S.r.l.
**Responsabile della Protezione dei Dati (DPO):** privacy@medlav.it
**Data prima redazione:** 11 marzo 2026
**Versione:** 1.0
**Stato:** Approvata
**Prossima revisione programmata:** 11 marzo 2027

---

## Indice

1. [Premessa e ambito di applicazione](#1-premessa-e-ambito-di-applicazione)
2. [Descrizione sistematica del trattamento](#2-descrizione-sistematica-del-trattamento)
3. [Valutazione della necessita e della proporzionalita](#3-valutazione-della-necessita-e-della-proporzionalita)
4. [Valutazione dei rischi per i diritti e le liberta degli interessati](#4-valutazione-dei-rischi-per-i-diritti-e-le-liberta-degli-interessati)
5. [Misure previste per affrontare i rischi](#5-misure-previste-per-affrontare-i-rischi)
6. [Parere del DPO](#6-parere-del-dpo)
7. [Consultazione preventiva](#7-consultazione-preventiva)
8. [Piano di revisione e aggiornamento](#8-piano-di-revisione-e-aggiornamento)
9. [Allegati](#9-allegati)

---

## 1. Premessa e ambito di applicazione

### 1.1 Obbligo di effettuare la DPIA

La presente Valutazione d'Impatto sulla Protezione dei Dati (DPIA) e redatta ai sensi dell'Art. 35 del Regolamento (UE) 2016/679 (di seguito "GDPR" o "Regolamento") ed e **obbligatoria** in quanto il trattamento effettuato dalla piattaforma MedLav rientra in almeno tre delle condizioni previste dalle Linee guida del Gruppo di lavoro Art. 29 (WP 248 rev.01) e dall'elenco pubblicato dal Garante per la protezione dei dati personali italiano:

- **Trattamento su larga scala di categorie particolari di dati** (Art. 9 GDPR): dati relativi alla salute contenuti in documentazione clinica (cartelle cliniche, referti, diagnosi, esami, terapie);
- **Utilizzo di nuove tecnologie**: impiego di intelligenza artificiale (modelli linguistici di grandi dimensioni, OCR con modelli vision) per l'analisi automatizzata di documentazione sanitaria;
- **Trattamento automatizzato con effetti significativi**: generazione automatica di report medico-legali utilizzati come base per perizie con potenziale impatto su diritti patrimoniali e personali degli interessati (pazienti);
- **Profilazione e valutazione sistematica**: rilevamento automatico di anomalie cliniche, ritardi diagnostici e carenze documentali.

### 1.2 Ambito

La presente DPIA copre l'intero ciclo di vita del trattamento dei dati sanitari all'interno della piattaforma MedLav, dall'upload della documentazione clinica fino alla cancellazione dei dati. Il perimetro include:

- Raccolta e conservazione di documentazione clinica digitalizzata;
- Elaborazione OCR (Optical Character Recognition) e HTR (Handwritten Text Recognition);
- Estrazione automatizzata di eventi clinici mediante intelligenza artificiale;
- Consolidamento, validazione e rilevamento anomalie;
- Generazione di report medico-legali strutturati;
- Conservazione, esportazione e cancellazione dei dati;
- Trattamenti accessori: autenticazione, audit logging, fatturazione.

---

## 2. Descrizione sistematica del trattamento

### 2.1 Natura del trattamento

MedLav e una piattaforma SaaS (Software as a Service) web-based che consente ai medici legali di caricare documentazione clinica dei pazienti e ottenere, tramite elaborazione automatizzata con intelligenza artificiale, un report medico-legale strutturato composto da:

- **Sintesi medico-legale**: relazione strutturata del caso clinico (inquadramento, decorso, stato attuale, elementi di rilievo medico-legale);
- **Cronologia eventi clinici**: timeline unificata e ordinata di tutti gli eventi medici estratti dalla documentazione;
- **Analisi anomalie**: rilevamento automatico di criticita nella gestione clinica (ritardi diagnostici, gap documentali, complicanze non gestite, consensi non documentati, diagnosi contraddittorie, terapie senza follow-up);
- **Documentazione mancante**: identificazione di documenti attesi ma assenti;
- **Calcoli medico-legali**: ITT (Invalidita Temporanea Totale), ITP (Invalidita Temporanea Parziale), giorni di ricovero.

Il report generato costituisce **materiale di lavoro preparatorio** per la perizia del medico legale e non una valutazione definitiva. Il medico legale revisiona, corregge, annota e approva il report prima dell'esportazione.

### 2.2 Pipeline di elaborazione dati

Il trattamento si articola in 8 fasi sequenziali, ciascuna eseguita come step atomico e retryable:

| Fase | Descrizione | Dati coinvolti | Tecnologia |
|------|-------------|----------------|------------|
| 1. Caricamento | Upload documenti clinici su storage crittografato | File PDF, immagini, DOCX | Supabase Storage (EU) |
| 2. OCR | Riconoscimento ottico del testo (incluso manoscritto) | Immagini pagine, testo estratto | Mistral OCR API (EU) |
| 3. Estrazione | Identificazione e strutturazione eventi clinici | Testo OCR, eventi strutturati | Mistral Large (EU), streaming |
| 4. Consolidamento | Unificazione cronologica, deduplicazione cross-documento | Eventi strutturati | Algoritmo deterministico |
| 5. Collegamento immagini | Associazione immagini mediche agli eventi | Metadati immagini, riferimenti pagina | Algoritmo deterministico |
| 6. Rilevamento anomalie | Analisi automatica di 9 tipologie di criticita | Eventi, soglie temporali | Algoritmo deterministico (no LLM) |
| 7. Generazione sintesi | Produzione del report medico-legale strutturato | Eventi, anomalie, linee guida RAG | Mistral Large (EU), RAG |
| 8. Finalizzazione | Marcatura completamento, audit log | Metadati caso, log | Supabase (EU) |

**Nota rilevante**: il rilevamento anomalie (fase 6) e **puramente algoritmico** e basato su soglie temporali configurabili, senza utilizzo di modelli di intelligenza artificiale. Questo garantisce determinismo, verificabilita e trasparenza delle anomalie rilevate.

### 2.3 Ambito del trattamento

#### Soggetti interessati

| Categoria | Ruolo | Dati trattati |
|-----------|-------|---------------|
| **Pazienti** | Interessati principali (indiretti) | Dati sanitari contenuti nella documentazione clinica caricata dal medico legale |
| **Medici legali** | Utenti della piattaforma | Dati identificativi (email, nome), dati professionali (studio), dati di utilizzo |
| **Medici citati nella documentazione** | Terzi citati | Nomi, qualifiche, strutture (presenti nella documentazione caricata) |

#### Categorie di dati personali

| Categoria | Tipologia GDPR | Esempi |
|-----------|---------------|--------|
| Dati sanitari dei pazienti | Art. 9 — Categorie particolari | Diagnosi, terapie, esami, parametri vitali, interventi chirurgici, decorso clinico, anamnesi, prognosi |
| Dati identificativi pazienti | Art. 4(1) — Dati personali | Iniziali (pseudonimizzate), date di nascita, codici fiscali (se presenti nei documenti) |
| Dati professionali medici | Art. 4(1) — Dati personali | Nomi dei medici curanti, specializzazioni, strutture sanitarie |
| Dati utenti piattaforma | Art. 4(1) — Dati personali | Email, nome completo, nome dello studio, indirizzo IP |
| Dati tecnici | Art. 4(1) — Dati personali | Log di accesso, azioni eseguite, timestamp, indirizzi IP |

#### Volume stimato

- Target iniziale: 20-100 medici legali
- Casi per utente stimati: 10-50/anno
- Documenti per caso: 1-30 documenti (da poche pagine a centinaia di pagine ciascuno)
- Pazienti coinvolti (stima annua): 200-5.000

### 2.4 Contesto del trattamento

Il trattamento avviene nel contesto della medicina legale italiana, dove il medico legale opera in qualita di:

- **CTU (Consulente Tecnico d'Ufficio)**: nominato dal giudice nell'ambito di un procedimento civile o penale;
- **CTP (Consulente Tecnico di Parte)**: incaricato dall'avvocato di una delle parti in un contenzioso;
- **Perito stragiudiziale**: incaricato direttamente dal paziente o dall'assicurazione per valutazioni extragiudiziali.

Il medico legale e il **titolare autonomo** del trattamento dei dati dei propri pazienti nell'ambito del mandato professionale ricevuto. MedLav agisce come **responsabile del trattamento** (Art. 28 GDPR) fornendo lo strumento tecnologico.

I dati sanitari trattati sono per loro natura estremamente sensibili e il report generato puo avere impatto diretto su:
- Procedimenti giudiziari (risarcimento danni, responsabilita medica);
- Valutazioni assicurative;
- Determinazione di invalidita;
- Diritti patrimoniali e personali dei pazienti.

### 2.5 Finalita del trattamento

| Finalita | Base giuridica | Descrizione |
|----------|---------------|-------------|
| Generazione report medico-legali | Art. 9(2)(h) GDPR | Trattamento necessario per finalita di medicina legale, prevenzione, diagnostica, assistenza sanitaria, sulla base del diritto dell'Unione o degli Stati membri |
| Gestione account utente | Art. 6(1)(b) GDPR | Esecuzione del contratto di servizio con il medico legale |
| Audit e tracciabilita | Art. 6(1)(c) GDPR | Obbligo legale di garantire accountability e tracciabilita per dati sanitari |
| Sicurezza del servizio | Art. 6(1)(f) GDPR | Legittimo interesse alla sicurezza informatica e all'integrita dei sistemi |
| Fatturazione | Art. 6(1)(b) e Art. 6(1)(c) GDPR | Esecuzione contratto e obblighi fiscali |

**Finalita espressamente escluse:**
- Profilazione degli interessati (pazienti);
- Analytics su dati clinici;
- Addestramento di modelli di intelligenza artificiale;
- Cessione di dati a terzi per finalita commerciali;
- Marketing diretto basato su dati sanitari.

### 2.6 Destinatari e flussi di dati

#### Sub-responsabili del trattamento

| Fornitore | Ruolo | Sede | Data center | DPA | Dati trattati |
|-----------|-------|------|-------------|-----|---------------|
| **Supabase Inc.** | Database, storage, autenticazione | USA (sede legale) | **Francoforte, Germania (EU)** | Si (richiesto) | Tutti i dati persistiti |
| **Mistral AI SAS** | Elaborazione AI (OCR, estrazione, sintesi) | **Parigi, Francia (EU)** | **EU** | Si (richiesto) | Testo documenti, immagini pagine (in transito, no retention) |
| **Vercel Inc.** | Hosting applicazione web | USA (sede legale) | **Francoforte, Germania (EU) — regione fra1** | Si (richiesto) | Codice applicativo, richieste HTTP, log di accesso |
| **Inngest Inc.** | Orchestrazione job asincroni | USA (sede legale) | Integrato con Vercel EU | Si (richiesto) | Metadati job (ID caso, stato elaborazione; NO dati clinici) |
| **Stripe Inc.** | Gestione pagamenti | USA/Irlanda | **EU (certificato)** | Si (richiesto) | Dati di fatturazione (NO dati clinici) |
| **Sentry (Functional Software Inc.)** | Monitoraggio errori | USA (sede legale) | EU | Si (richiesto) | Stacktrace, errori applicativi (NO dati clinici nei log) |

#### Garanzie per trasferimenti extra-UE

Tutti i fornitori con sede legale extra-UE utilizzano **data center situati nell'Unione Europea** per il trattamento e la conservazione dei dati di MedLav. In aggiunta:

- I DPA (Data Processing Agreement) stipulati con ciascun sub-responsabile includono le **Clausole Contrattuali Standard (SCC)** approvate dalla Commissione Europea (Decisione di esecuzione 2021/914);
- Sono state condotte **Transfer Impact Assessment (TIA)** per valutare il rischio residuo;
- Mistral AI SAS e societa di diritto francese con infrastruttura interamente in EU, pertanto non sono necessarie garanzie addizionali per il trasferimento.

---

## 3. Valutazione della necessita e della proporzionalita

### 3.1 Necessita del trattamento

Il trattamento di dati sanitari e **intrinsecamente necessario** per la finalita perseguita: non e possibile generare un report medico-legale senza analizzare la documentazione clinica del paziente. La base giuridica ai sensi dell'Art. 9(2)(h) GDPR e appropriata in quanto:

- Il trattamento e effettuato nell'ambito di un mandato professionale medico-legale (incarico del giudice, dell'avvocato o del paziente stesso);
- Il medico legale e un professionista sanitario soggetto al segreto professionale (Art. 622 c.p.);
- Il trattamento e finalizzato alla tutela dei diritti del paziente in sede giudiziaria o stragiudiziale;
- L'Art. 2-sexies, comma 2, lett. e) del D.Lgs. 196/2003 (Codice Privacy) autorizza il trattamento di dati sanitari per l'esercizio di un diritto in sede giudiziaria.

### 3.2 Proporzionalita

#### Minimizzazione dei dati (Art. 5(1)(c) GDPR)

| Misura | Implementazione |
|--------|----------------|
| Pseudonimizzazione identita pazienti | Il sistema utilizza esclusivamente le **iniziali del paziente** (`patientInitials`) e un codice caso generato automaticamente (`CASO-YYYY-NNN`). I nomi completi non sono mai memorizzati come campi strutturati nel database |
| Anonimizzazione nei report | Servizio di anonimizzazione automatica che rimuove: codici fiscali, numeri di telefono, indirizzi email, nomi di parti e professionisti (sostituiti con ruoli: `[CTU]`, `PARTE RICORRENTE`, ecc.) |
| Nessun dato superfluo | Non sono raccolti dati identificativi diretti del paziente oltre a quanto contenuto nei documenti caricati dal medico legale |
| Logging sanitizzato | I log applicativi non contengono MAI dati clinici: solo codici caso, ID documento, ID utente, azioni eseguite |

#### Limitazione della conservazione (Art. 5(1)(e) GDPR)

| Tipologia dato | Periodo di conservazione | Meccanismo |
|----------------|------------------------|------------|
| Documenti clinici e report | Fino a cancellazione da parte dell'utente o chiusura account | Cancellazione on-demand (GDPR Art. 17) |
| Dati account | Durata del rapporto contrattuale + 10 anni (obblighi fiscali ex D.P.R. 600/73) | Eliminazione automatica |
| Log tecnici | 90 giorni | Cancellazione automatica |
| Dati di fatturazione | 10 anni (obbligo fiscale) | Conservazione separata |
| Audit log | Durata dell'account + 1 anno | Eliminazione con cancellazione account |
| Dati su Mistral AI | **Zero retention** — elaborati in tempo reale senza conservazione | Garantito da DPA con Mistral AI |

**Nota**: e prevista l'implementazione di una data retention policy con cancellazione automatica configurabile dall'utente (default: 365 giorni dall'ultimo accesso al caso).

#### Limitazione delle finalita (Art. 5(1)(b) GDPR)

I dati sanitari sono trattati **esclusivamente** per la generazione del report medico-legale. In particolare:

- **Nessuna profilazione** dei pazienti o dei medici;
- **Nessuna analisi aggregata** su dati clinici tra casi diversi;
- **Nessun addestramento AI** con i dati degli utenti (clausola contrattuale con Mistral AI);
- **Nessuna cessione a terzi** per finalita commerciali o di ricerca;
- Le **linee guida RAG** (Retrieval-Augmented Generation) utilizzano esclusivamente letteratura medica pubblica e non dati dei pazienti;
- I **calcoli medico-legali** (ITT/ITP) sono deterministici e basati solo sulle date degli eventi del singolo caso.

### 3.3 Diritti degli interessati

L'applicazione implementa funzionalita specifiche per garantire l'esercizio dei diritti degli interessati:

| Diritto | Art. GDPR | Implementazione |
|---------|-----------|-----------------|
| Accesso (portabilita) | Art. 15/20 | Funzione `exportMyData()`: esporta tutti i dati dell'utente (profilo, casi, eventi, report, audit log) in formato JSON strutturato |
| Cancellazione | Art. 17 | Funzione `deleteMyAccount()`: elimina in cascata tutti i dati dell'utente (profilo, casi, documenti, pagine, eventi, immagini eventi, anomalie, documenti mancanti, report, audit log) e l'account di autenticazione |
| Rettifica | Art. 16 | L'utente puo modificare eventi estratti, annotare, correggere e rigenerare il report |
| Limitazione | Art. 18 | Possibilita di archiviare casi senza ulteriore elaborazione |
| Opposizione | Art. 21 | Contatto DPO (privacy@medlav.it) per richieste di opposizione |

**Per quanto riguarda i pazienti** (interessati indiretti): i pazienti possono esercitare i propri diritti rivolgendosi al medico legale titolare del trattamento. Il medico legale puo a sua volta cancellare i dati del caso dalla piattaforma.

---

## 4. Valutazione dei rischi per i diritti e le liberta degli interessati

### 4.1 Metodologia

La valutazione dei rischi segue la metodologia raccomandata dal Garante Privacy italiano e dall'ENISA, considerando:
- **Probabilita** di occorrenza: trascurabile (1), bassa (2), media (3), alta (4);
- **Impatto** sui diritti degli interessati: trascurabile (1), limitato (2), significativo (3), massimo (4);
- **Rischio** = Probabilita x Impatto.

### 4.2 Registro dei rischi

#### R1 — Accesso non autorizzato a dati sanitari

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Un soggetto non autorizzato ottiene accesso ai dati sanitari dei pazienti contenuti nella piattaforma, tramite compromissione di credenziali, vulnerabilita applicativa o attacco diretto al database |
| **Interessati coinvolti** | Pazienti, medici |
| **Categoria dati** | Dati sanitari (Art. 9 GDPR) |
| **Probabilita (ante misure)** | 3 — Media |
| **Impatto** | 4 — Massimo (dati sanitari sensibili, potenziale danno reputazionale, discriminazione, impatto su procedimenti legali) |
| **Rischio lordo** | **12 — ALTO** |
| **Misure di mitigazione** | Vd. Sezione 5.1, 5.2, 5.3 |
| **Probabilita (post misure)** | 1 — Trascurabile |
| **Rischio residuo** | **4 — BASSO** |

#### R2 — Perdita o distruzione di dati

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Perdita permanente di dati clinici o report a causa di guasto hardware, errore software, attacco ransomware o errore umano |
| **Interessati coinvolti** | Pazienti, medici legali |
| **Categoria dati** | Dati sanitari, dati professionali |
| **Probabilita (ante misure)** | 2 — Bassa |
| **Impatto** | 3 — Significativo (impossibilita di completare perizia, necessita di ri-elaborazione, impatto su termini processuali) |
| **Rischio lordo** | **6 — MEDIO** |
| **Misure di mitigazione** | Vd. Sezione 5.4 |
| **Probabilita (post misure)** | 1 — Trascurabile |
| **Rischio residuo** | **3 — BASSO** |

#### R3 — Trasferimento dati extra-UE non autorizzato

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Dati sanitari trasferiti o accessibili da server al di fuori dell'Unione Europea, in violazione del Capo V del GDPR, a causa di configurazione errata dei servizi cloud o di obblighi di disclosure dei sub-responsabili verso autorita di paesi terzi |
| **Interessati coinvolti** | Pazienti |
| **Categoria dati** | Dati sanitari (Art. 9 GDPR) |
| **Probabilita (ante misure)** | 2 — Bassa |
| **Impatto** | 4 — Massimo (violazione GDPR, potenziali sanzioni fino al 4% del fatturato, perdita di fiducia) |
| **Rischio lordo** | **8 — MEDIO-ALTO** |
| **Misure di mitigazione** | Vd. Sezione 5.5 |
| **Probabilita (post misure)** | 1 — Trascurabile |
| **Rischio residuo** | **4 — BASSO** |

#### R4 — Re-identificazione da dati pseudonimizzati

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Un soggetto non autorizzato riesce a re-identificare un paziente a partire dai dati pseudonimizzati (iniziali, date, diagnosi, strutture sanitarie), combinandoli con informazioni pubbliche o con altri dataset |
| **Interessati coinvolti** | Pazienti |
| **Categoria dati** | Dati sanitari pseudonimizzati |
| **Probabilita (ante misure)** | 2 — Bassa |
| **Impatto** | 3 — Significativo (violazione privacy del paziente, potenziale discriminazione) |
| **Rischio lordo** | **6 — MEDIO** |
| **Misure di mitigazione** | Vd. Sezione 5.6 |
| **Probabilita (post misure)** | 1 — Trascurabile |
| **Rischio residuo** | **3 — BASSO** |

#### R5 — Generazione di informazioni inesatte dall'AI

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Il modello AI genera informazioni inesatte, omette eventi clinici rilevanti o produce "allucinazioni" (contenuti non presenti nella documentazione originale), con impatto sulla qualita del report medico-legale e sulle conclusioni peritali |
| **Interessati coinvolti** | Pazienti (impatto indiretto sulla perizia e sui diritti in sede giudiziaria) |
| **Categoria dati** | Dati sanitari elaborati |
| **Probabilita (ante misure)** | 3 — Media |
| **Impatto** | 3 — Significativo (perizia inesatta, impatto su procedimenti giudiziari, potenziale danno patrimoniale) |
| **Rischio lordo** | **9 — ALTO** |
| **Misure di mitigazione** | Vd. Sezione 5.7 |
| **Probabilita (post misure)** | 2 — Bassa |
| **Rischio residuo** | **6 — MEDIO** (rischio accettabile con supervisione umana obbligatoria) |

#### R6 — Data breach con obbligo di notifica

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Violazione dei dati personali che richiede notifica al Garante (Art. 33 GDPR) e/o comunicazione agli interessati (Art. 34 GDPR) |
| **Interessati coinvolti** | Pazienti, medici legali |
| **Categoria dati** | Dati sanitari, dati personali |
| **Probabilita (ante misure)** | 2 — Bassa |
| **Impatto** | 4 — Massimo (obbligo notifica entro 72h, potenziali sanzioni, danno reputazionale) |
| **Rischio lordo** | **8 — MEDIO-ALTO** |
| **Misure di mitigazione** | Vd. Sezione 5.8 |
| **Probabilita (post misure)** | 1 — Trascurabile |
| **Rischio residuo** | **4 — BASSO** |

#### R7 — Utilizzo dei dati per addestramento AI non autorizzato

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Il fornitore di servizi AI (Mistral) utilizza i dati sanitari trasmessi per l'addestramento dei propri modelli, in violazione del DPA e del principio di limitazione delle finalita |
| **Interessati coinvolti** | Pazienti |
| **Categoria dati** | Dati sanitari inviati all'API |
| **Probabilita (ante misure)** | 1 — Trascurabile |
| **Impatto** | 4 — Massimo (violazione gravissima del GDPR, perdita di controllo sui dati) |
| **Rischio lordo** | **4 — BASSO** |
| **Misure di mitigazione** | Vd. Sezione 5.9 |
| **Probabilita (post misure)** | 1 — Trascurabile |
| **Rischio residuo** | **4 — BASSO** |

#### R8 — Indisponibilita del servizio durante elaborazione

| Parametro | Valore |
|-----------|--------|
| **Descrizione** | Interruzione del servizio durante l'elaborazione di un caso con potenziale perdita di dati parzialmente elaborati o impossibilita di rispettare scadenze processuali |
| **Interessati coinvolti** | Medici legali, pazienti (indirettamente) |
| **Categoria dati** | Dati sanitari in elaborazione |
| **Probabilita (ante misure)** | 2 — Bassa |
| **Impatto** | 2 — Limitato (ritardo, non perdita permanente) |
| **Rischio lordo** | **4 — BASSO** |
| **Misure di mitigazione** | Vd. Sezione 5.10 |
| **Probabilita (post misure)** | 1 — Trascurabile |
| **Rischio residuo** | **2 — TRASCURABILE** |

### 4.3 Matrice di sintesi dei rischi

| Rischio | Descrizione | Rischio lordo | Rischio residuo |
|---------|-------------|:------------:|:---------------:|
| R1 | Accesso non autorizzato | **ALTO (12)** | BASSO (4) |
| R2 | Perdita/distruzione dati | MEDIO (6) | BASSO (3) |
| R3 | Trasferimento extra-UE | MEDIO-ALTO (8) | BASSO (4) |
| R4 | Re-identificazione | MEDIO (6) | BASSO (3) |
| R5 | Inesattezze AI | **ALTO (9)** | MEDIO (6) |
| R6 | Data breach | MEDIO-ALTO (8) | BASSO (4) |
| R7 | Addestramento AI non autorizzato | BASSO (4) | BASSO (4) |
| R8 | Indisponibilita servizio | BASSO (4) | TRASCURABILE (2) |

---

## 5. Misure previste per affrontare i rischi

### 5.1 Misure tecniche — Autenticazione e controllo degli accessi

*Mitiga: R1, R6*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Autenticazione email/password | Supabase Auth con verifica email obbligatoria prima dell'accesso | Implementata |
| Password policy | Minimo 8 caratteri, hashing sicuro gestito da Supabase (bcrypt) | Implementata |
| Sessioni sicure | Token JWT con scadenza, refresh automatico, invalidazione su logout | Implementata |
| Middleware di autenticazione | Ogni route protetta richiede sessione valida tramite middleware Next.js | Implementata |
| Row Level Security (RLS) | Policy PostgreSQL su tutte le tabelle: ogni query e filtrata per `user_id` — un utente accede **esclusivamente** ai propri dati | Implementata |
| Verifica ownership | Ogni operazione CRUD verifica che l'entita appartenga all'utente autenticato | Implementata |
| Rate limiting | Limitazione del numero di richieste per IP e per utente su tutti gli endpoint, con priorita sugli endpoint di autenticazione | Implementata |
| Password reset sicuro | Flusso di reset password via email con token monouso e scadenza | Implementata |

### 5.2 Misure tecniche — Crittografia

*Mitiga: R1, R2, R3, R6*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Crittografia in transito | TLS 1.3 su tutte le comunicazioni (browser-server, server-database, server-API AI) | Implementata |
| Crittografia at-rest (database) | AES-256 su PostgreSQL Supabase (transparent data encryption) | Implementata |
| Crittografia at-rest (storage) | File caricati crittografati su Supabase Storage | Implementata |
| Connessioni SSL database | Tutte le connessioni al database utilizzano SSL | Implementata |
| HTTPS obbligatorio | HTTP Strict Transport Security (HSTS) con `max-age=31536000; includeSubDomains` | Implementata |

### 5.3 Misure tecniche — Sicurezza applicativa

*Mitiga: R1, R6*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Content Security Policy (CSP) | Header CSP che limita le origini di script, stili, connessioni e frame | Implementata |
| X-Frame-Options: DENY | Prevenzione di clickjacking | Implementata |
| X-Content-Type-Options: nosniff | Prevenzione di MIME type sniffing | Implementata |
| X-XSS-Protection | Protezione XSS nativa del browser | Implementata |
| Referrer-Policy: strict-origin-when-cross-origin | Limitazione delle informazioni nell'header Referer | Implementata |
| Permissions-Policy | Camera, microfono e geolocalizzazione disabilitati | Implementata |
| Validazione input (Zod) | Ogni endpoint API e ogni form valida l'input con schema Zod tipizzato | Implementata |
| Query parametrizzate | Drizzle ORM gestisce automaticamente la parametrizzazione delle query, prevenendo SQL injection | Implementata |
| Escape automatico XSS | React esegue automaticamente l'escape dell'output HTML | Implementata |
| Error handling sicuro | Messaggi di errore user-friendly all'utente; dettagli tecnici solo nei log server | Implementata |
| CSRF protection | Protezione contro Cross-Site Request Forgery su tutte le route API con mutazioni | Pianificata |

### 5.4 Misure tecniche — Disponibilita e resilienza

*Mitiga: R2, R8*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Backup giornalieri | Supabase effettua backup giornalieri automatici del database | Implementata |
| Point-in-Time Recovery (PITR) | Possibilita di ripristinare il database a qualsiasi punto nelle ultime 24 ore | Implementata |
| Step atomici e retryable | Ogni fase della pipeline e uno step Inngest atomico con retry automatico in caso di errore | Implementata |
| Circuit breaker Mistral | Meccanismo di circuit breaker che interrompe le chiamate a Mistral dopo 10 errori consecutivi, riprovando dopo 60 secondi | Implementata |
| Retry con backoff esponenziale | Fino a 5 tentativi con backoff esponenziale + jitter per gestire errori transitori delle API | Implementata |
| Streaming con stall detection | Rilevamento di stream bloccati (90s senza token) con fallback automatico a chiamata sincrona | Implementata |
| Semaforo concorrenza | Massimo 5 chiamate API Mistral in parallelo per prevenire sovraccarico | Implementata |

### 5.5 Misure tecniche e organizzative — Data residency EU

*Mitiga: R3*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Database EU | Supabase PostgreSQL nella regione di Francoforte (Germania) | Implementata |
| Storage EU | Supabase Storage nella regione di Francoforte (Germania) | Implementata |
| AI EU-only | Mistral AI e societa francese con server esclusivamente in EU. I dati non lasciano mai l'Unione Europea | Implementata |
| Hosting EU | Vercel con regione fra1 (Francoforte, Germania) | Implementata |
| No servizi extra-UE per dati sanitari | Vincolo architetturale: nessun servizio non-EU puo trattare dati sanitari | Vincolo di design |
| DPA con sub-responsabili | Data Processing Agreement stipulati con tutti i sub-responsabili con clausole di localizzazione dati in EU | Richiesto |
| Monitoraggio configurazione | Verifica periodica che le configurazioni dei servizi cloud mantengano la regione EU | Operativa |

### 5.6 Misure tecniche — Pseudonimizzazione e anonimizzazione

*Mitiga: R4*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Pseudonimizzazione identita | Solo iniziali del paziente (`patientInitials`) memorizzate come campo strutturato; codice caso generato automaticamente | Implementata |
| Servizio di anonimizzazione | Modulo dedicato (`anonymizer.ts`) che rimuove automaticamente: codici fiscali (pattern italiano), numeri di telefono, email, nomi associati a titoli professionali | Implementata |
| Sostituzione nomi parti | I nomi delle parti processuali (ricorrente, resistente, CTU, CTP, giudice) sono sostituiti con ruoli generici nel testo elaborato | Implementata |
| Logging sanitizzato | Il logger applicativo non registra mai dati clinici: solo ID caso, ID documento, ID utente, tipo azione | Implementata |
| Nessun dato identificativo nei log | I log contengono esclusivamente codici e identificativi tecnici, mai nomi, diagnosi o dati sanitari | Implementata |

### 5.7 Misure tecniche e organizzative — Qualita e affidabilita AI

*Mitiga: R5*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Zero Discard Policy | Nessun evento estratto dalla documentazione viene mai scartato. Gli eventi incerti sono mantenuti con flag `requiresVerification` e punteggio di confidenza | Implementata |
| Punteggio di confidenza | Ogni evento estratto ha un valore `confidence` (0-100) visibile nel report. L'utente e avvisato degli eventi a bassa affidabilita | Implementata |
| Source text verificabile | Per ogni evento e conservato il testo sorgente esatto (`sourceText`) e le pagine di origine (`sourcePages`), consentendo la verifica con il documento originale | Implementata |
| Supervisione umana obbligatoria | Il report e generato in stato BOZZA. Il medico legale **deve** revisionare, correggere e approvare prima dell'esportazione. L'output AI non e mai utilizzato direttamente senza revisione | Design del workflow |
| Revisione eventi pre-report | L'utente visualizza e puo modificare gli eventi estratti **prima** della generazione del report | Implementata |
| Anomaly detection deterministica | Il rilevamento anomalie (ritardi diagnostici, gap documentali, ecc.) e puramente algoritmico con soglie configurabili, senza dipendenza dall'AI. Risultati deterministici e verificabili | Implementata |
| RAG con fonti verificabili | Le linee guida cliniche utilizzate nel RAG (Retrieval-Augmented Generation) sono caricate dall'amministratore e le fonti sono citabili nel report | Implementata |
| Doppio passaggio di estrazione | L'estrazione eventi avviene con chunking intelligente e consolidamento successivo per minimizzare le omissioni | Implementata |
| Prompt specializzati per ruolo | I prompt variano in base al ruolo del medico legale (CTU: neutrale; CTP: assertivo pro-paziente; stragiudiziale: pragmatico), garantendo output appropriato al contesto | Implementata |
| Template per tipo di caso | Template specializzati per 7+ tipologie di caso (ortopedica, oncologica, ostetrica, ecc.) che guidano l'estrazione verso le informazioni piu rilevanti | Implementata |

### 5.8 Misure organizzative — Gestione data breach

*Mitiga: R6*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Audit log completo | Ogni azione rilevante e registrata con: user_id, azione, tipo entita, ID entita, IP, timestamp. Il log e immutabile | Implementata |
| Procedura di notifica | Procedura documentata per la notifica al Garante entro 72 ore (Art. 33 GDPR) e comunicazione agli interessati (Art. 34 GDPR) | Da formalizzare |
| Registro data breach | Registro interno delle violazioni di dati personali, indipendentemente dall'obbligo di notifica | Da implementare |
| Monitoraggio errori (Sentry) | Sistema di monitoraggio errori in tempo reale per rilevare anomalie applicative | Implementata |
| Incident response plan | Piano di risposta agli incidenti con ruoli, responsabilita e tempi di intervento | Da formalizzare |

### 5.9 Misure contrattuali — AI e dati sanitari

*Mitiga: R7*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| DPA con Mistral AI | Data Processing Agreement che vieta espressamente l'utilizzo dei dati per addestramento modelli | Richiesto |
| Zero data retention Mistral | I dati inviati a Mistral sono elaborati in tempo reale e non conservati sui server del provider | Garantito da DPA |
| Nessun feedback loop | I dati degli utenti non alimentano alcun ciclo di miglioramento automatico dei modelli | Design architetturale |
| Monitoraggio ToS | Monitoraggio periodico delle modifiche ai termini di servizio e alle policy di Mistral AI | Operativa |
| Clausola di audit | Diritto di audit contrattuale sulle pratiche di trattamento dati del sub-responsabile | In DPA |

### 5.10 Misure tecniche — Resilienza della pipeline

*Mitiga: R8*

| Misura | Descrizione | Stato |
|--------|-------------|-------|
| Architettura a step atomici | La pipeline di 8 step (Inngest) consente il retry di singoli step senza rielaborare l'intero caso | Implementata |
| Graceful degradation | Se l'OCR di un documento fallisce, gli altri documenti del caso continuano l'elaborazione | Implementata |
| Stato persistito | Lo stato di elaborazione di ogni documento e aggiornato in database ad ogni passaggio, consentendo la ripresa in caso di interruzione | Implementata |
| Rigenerazione report | L'utente puo rigenerare il report o singole sezioni senza ricaricare i documenti | Implementata |
| Cancellazione elaborazione | L'utente puo annullare un'elaborazione in corso | Implementata |

---

## 6. Parere del DPO

Il Data Protection Officer, valutata la presente DPIA, rileva che:

1. **Il trattamento e lecito** in quanto fondato sull'Art. 9(2)(h) GDPR in combinato disposto con l'Art. 2-sexies del D.Lgs. 196/2003, nell'ambito dell'esercizio professionale del medico legale;

2. **Le misure di mitigazione sono adeguate** per la maggior parte dei rischi identificati, riducendo il rischio residuo a livelli accettabili;

3. **Il rischio R5 (inesattezze AI) rimane a livello MEDIO** e richiede attenzione costante. La misura piu efficace e la **supervisione umana obbligatoria**: il report e sempre revisionato dal medico legale prima dell'utilizzo. Si raccomanda di enfatizzare nei termini di servizio e nell'interfaccia che l'output AI e materiale preparatorio e non sostitutivo del giudizio professionale;

4. **Sono raccomandate le seguenti azioni integrative**, da completare entro le scadenze indicate:

| Azione | Priorita | Scadenza |
|--------|----------|----------|
| Formalizzare la procedura di data breach notification | Alta | Q2 2026 |
| Implementare data retention policy con cancellazione automatica | Alta | Q2 2026 |
| Completare la protezione CSRF su tutte le route API | Alta | Q2 2026 |
| Implementare rate limiting avanzato con Upstash Redis | Media | Q3 2026 |
| Completare il modulo di anonimizzazione dedicato | Media | Q3 2026 |
| Effettuare penetration testing indipendente | Media | Q3 2026 |
| Ottenere certificazione ISO 27001 | Bassa | Q4 2026 |
| Implementare CSP nonce-based (rimuovere `unsafe-inline`) | Media | Q3 2026 |
| Strutturare i log in formato JSON per analisi automatizzata | Bassa | Q4 2026 |

5. **Non si ritiene necessaria la consultazione preventiva** con il Garante ai sensi dell'Art. 36 GDPR, in quanto i rischi residui sono stati mitigati a livelli accettabili tramite le misure sopra descritte.

---

## 7. Consultazione preventiva

### 7.1 Valutazione della necessita

Ai sensi dell'Art. 36 GDPR, il titolare del trattamento consulta l'autorita di controllo (Garante per la protezione dei dati personali) **prima del trattamento** qualora la DPIA indichi che il trattamento presenterebbe un rischio elevato in assenza di misure adottate dal titolare per attenuarlo.

Sulla base della presente valutazione, i rischi residui — dopo l'applicazione delle misure di mitigazione descritte nella Sezione 5 — sono stati ridotti a livelli accettabili (BASSO o TRASCURABILE per 7 rischi su 8, MEDIO per il solo R5 con supervisione umana obbligatoria).

**Si conclude pertanto che la consultazione preventiva con il Garante NON e necessaria al momento attuale.**

### 7.2 Condizioni che richiederebbero la consultazione preventiva

La consultazione preventiva diventerebbe necessaria in caso di:

- **Ampliamento significativo dei volumi** (superamento di 5.000 pazienti/anno o 500 utenti) tale da configurare un trattamento su larga scala ai sensi del Considerando 91;
- **Introduzione di trattamento automatizzato con effetti giuridici diretti** (es. calcolo automatico di percentuali di invalidita senza supervisione umana);
- **Rimozione della supervisione umana obbligatoria** sul report generato dall'AI;
- **Aggiunta di nuove fonti di dati** (es. dati biometrici, dati genetici);
- **Impossibilita di mitigare un rischio** a livello accettabile con le misure tecniche e organizzative disponibili;
- **Trasferimento di dati verso paesi terzi** non coperti da decisione di adeguatezza.

### 7.3 Rischi residui

| Rischio | Livello residuo | Motivazione dell'accettabilita |
|---------|:--------------:|-------------------------------|
| R1 — Accesso non autorizzato | BASSO | RLS, autenticazione, crittografia, audit log |
| R2 — Perdita dati | BASSO | Backup giornalieri, PITR, step atomici retryable |
| R3 — Trasferimento extra-UE | BASSO | Architettura EU-only, DPA con clausole di localizzazione |
| R4 — Re-identificazione | BASSO | Pseudonimizzazione, anonimizzazione, logging sanitizzato |
| R5 — Inesattezze AI | **MEDIO** | **Accettabile con supervisione umana obbligatoria, source text verificabile e Zero Discard Policy** |
| R6 — Data breach | BASSO | Crittografia, RLS, audit, monitoraggio, procedura di notifica |
| R7 — Addestramento AI | BASSO | DPA, zero retention, clausola contrattuale esplicita |
| R8 — Indisponibilita | TRASCURABILE | Step atomici, retry, graceful degradation |

---

## 8. Piano di revisione e aggiornamento

### 8.1 Periodicita

La presente DPIA sara **riesaminata e aggiornata**:

- **Con cadenza annuale** (prossima revisione: 11 marzo 2027);
- **In caso di modifiche significative al trattamento**, tra cui:
  - Introduzione di nuovi sub-responsabili del trattamento;
  - Modifica dei modelli AI utilizzati (cambio provider, cambio modello);
  - Ampliamento delle categorie di dati trattati;
  - Introduzione di nuove funzionalita che modificano il flusso di trattamento;
  - Variazione significativa del volume di dati trattati;
  - Cambio della localizzazione dei data center;
  - Incidenti di sicurezza o data breach;
  - Modifiche normative rilevanti (aggiornamenti GDPR, provvedimenti del Garante, AI Act);
- **Su richiesta del DPO** o dell'autorita di controllo.

### 8.2 Responsabilita

| Ruolo | Responsabilita |
|-------|---------------|
| **Titolare del trattamento** | Approvazione della DPIA, decisione sulle misure di mitigazione, consultazione preventiva se necessaria |
| **DPO / Responsabile privacy** | Redazione e aggiornamento della DPIA, monitoraggio dell'efficacia delle misure, segnalazione di nuovi rischi |
| **Responsabile tecnico (CTO)** | Implementazione delle misure tecniche, verifica della conformita dell'infrastruttura, reporting sullo stato delle misure |
| **Responsabile sicurezza** | Penetration testing, monitoraggio incidenti, gestione data breach |

### 8.3 Registro delle revisioni

| Versione | Data | Autore | Modifiche |
|----------|------|--------|-----------|
| 1.0 | 11/03/2026 | DPO | Prima redazione completa |

---

## 9. Allegati

### Allegato A — Schema del database

Il database PostgreSQL (Supabase, Francoforte) contiene le seguenti tabelle, tutte protette da Row Level Security:

| Tabella | Contenuto | Dati sensibili |
|---------|-----------|:--------------:|
| `profiles` | Dati utente (email, nome, studio, subscription) | No |
| `cases` | Metadati caso (codice, iniziali paziente, tipo, ruolo, stato) | Pseudonimizzati |
| `documents` | Metadati documenti (nome file, tipo, dimensione, path storage, stato elaborazione) | No (metadati) |
| `pages` | Testo OCR per pagina, qualita, riconoscimento manoscritto | **Si** (testo clinico) |
| `events` | Eventi clinici estratti (data, tipo, titolo, descrizione, diagnosi, fonte, confidenza) | **Si** (dati sanitari) |
| `event_images` | Immagini mediche associate agli eventi | **Si** (immagini cliniche) |
| `anomalies` | Anomalie rilevate (tipo, severita, descrizione, eventi coinvolti) | **Si** (analisi clinica) |
| `missing_documents` | Documentazione mancante rilevata | No (metadati) |
| `reports` | Report medico-legali generati (sintesi HTML) | **Si** (relazione clinica) |
| `report_exports` | File esportati (path storage) | No (metadati) |
| `report_ratings` | Valutazioni del report da parte dell'utente | No |
| `case_shares` | Condivisioni di casi tra utenti | No |
| `guidelines` | Linee guida cliniche per RAG (testo pubblico) | No |
| `audit_log` | Log di audit (azioni, entita, timestamp, IP) | No (sanitizzato) |

### Allegato B — Diagramma dei flussi di dati

```
                        Browser (utente)
                              |
                        [TLS 1.3]
                              |
                    Vercel (fra1, Francoforte)
                    Next.js Application Server
                              |
              +---------------+----------------+
              |               |                |
        [TLS 1.3]       [TLS 1.3]       [TLS 1.3]
              |               |                |
    Supabase (EU)      Mistral AI (EU)    Inngest
    Francoforte         Parigi           (orchestrazione)
    - PostgreSQL       - OCR API             |
    - Storage          - Chat API       [TLS 1.3]
    - Auth             - Embed API           |
                       (zero retention) Vercel (fra1)
                                        (step execution)
```

**Tutti i flussi sono crittografati con TLS 1.3. Nessun dato transita al di fuori dell'Unione Europea.**

### Allegato C — Sub-responsabili e DPA

| Sub-responsabile | Servizio | Regione dati | DPA | SCC | TIA |
|-----------------|----------|:------------:|:---:|:---:|:---:|
| Supabase Inc. | Database, storage, auth | EU (Francoforte) | Richiesto | Si | Si |
| Mistral AI SAS | Elaborazione AI | EU (Francia) | Richiesto | N/A (EU) | N/A (EU) |
| Vercel Inc. | Hosting applicazione | EU (fra1) | Richiesto | Si | Si |
| Inngest Inc. | Job orchestration | EU (via Vercel) | Richiesto | Si | Si |
| Stripe Inc. | Pagamenti | EU | Richiesto | Si | Si |
| Sentry | Error monitoring | EU | Richiesto | Si | Si |

### Allegato D — Riferimenti normativi

- **Regolamento (UE) 2016/679** (GDPR), in particolare:
  - Art. 5 — Principi relativi al trattamento
  - Art. 6 — Liceita del trattamento
  - Art. 9 — Trattamento di categorie particolari di dati personali
  - Art. 25 — Protezione dei dati fin dalla progettazione e protezione per impostazione predefinita
  - Art. 28 — Responsabile del trattamento
  - Art. 32 — Sicurezza del trattamento
  - Art. 33/34 — Notifica e comunicazione data breach
  - Art. 35 — Valutazione d'impatto sulla protezione dei dati
  - Art. 36 — Consultazione preventiva
- **D.Lgs. 196/2003** (Codice Privacy), come modificato dal D.Lgs. 101/2018:
  - Art. 2-sexies — Trattamento di categorie particolari di dati personali per motivi di interesse pubblico rilevante
  - Art. 2-septies — Misure di garanzia per il trattamento di dati genetici, biometrici e relativi alla salute
- **Regolamento (UE) 2024/1689** (AI Act), in particolare:
  - Art. 6 — Classificazione dei sistemi AI
  - Allegato III — Sistemi di AI ad alto rischio (area salute e sicurezza)
- **Linee guida WP 248 rev.01** del Gruppo di lavoro Art. 29 — Linee guida sulla DPIA
- **Provvedimento del Garante** dell'11 ottobre 2018 — Elenco delle tipologie di trattamento soggette a DPIA
- **Decisione di esecuzione (UE) 2021/914** — Clausole Contrattuali Standard per il trasferimento di dati verso paesi terzi

---

*Documento redatto ai sensi dell'Art. 35 del Regolamento (UE) 2016/679.*
*La presente DPIA e un documento interno destinato a dimostrare la conformita del titolare del trattamento al principio di accountability (Art. 5(2) GDPR).*
