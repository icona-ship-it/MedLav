# LegMed — Guida Completa ai Moduli di Analisi

**Versione:** 1.0
**Data:** 9 Aprile 2026
**Destinatari:** Medici legali, periti, beta tester

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Come funziona l'elaborazione](#2-come-funziona-lelaborazione)
3. [Moduli disponibili](#3-moduli-disponibili)
4. [Dettaglio per tipo di analisi](#4-dettaglio-per-tipo-di-analisi)
5. [Cosa viene estratto dai documenti](#5-cosa-viene-estratto-dai-documenti)
6. [Struttura del report generato](#6-struttura-del-report-generato)
7. [Controlli automatici](#7-controlli-automatici)
8. [Calcoli medico-legali](#8-calcoli-medico-legali)
9. [Analisi spese mediche](#9-analisi-spese-mediche)
10. [Formati di esportazione](#10-formati-di-esportazione)
11. [Cosa il sistema NON fa](#11-cosa-il-sistema-non-fa)
12. [Domande frequenti](#12-domande-frequenti)

---

## 1. Panoramica

LegMed analizza la documentazione clinica caricata dal perito e produce:

- **Cronistoria completa** — ogni documento medico viene letto, estratto e ordinato cronologicamente
- **Report strutturato** — relazione medico-legale organizzata per sezioni, pronta da integrare nella perizia
- **Anomalie rilevate** — criticità nella gestione clinica (ritardi, gap, complicanze)
- **Documenti mancanti** — cosa ci si aspetta di trovare e non c'è
- **Calcoli medico-legali** — ITT, ITP, giorni di ricovero, stima danno biologico
- **Analisi spese mediche** — tabella strutturata con importi, ricevute, categorie

Il report generato **NON è la perizia finale**. È il materiale di lavoro che il perito usa per redigere la propria relazione.

---

## 2. Come funziona l'elaborazione

### Flusso completo (perizie e CTU/ATP)

```
Caricamento documenti
    ↓
1. LETTURA OCR — Ogni documento viene letto con riconoscimento ottico
    ↓
2. ESTRAZIONE EVENTI — Da ogni pagina vengono estratti tutti gli eventi clinici
    ↓
3. CONSOLIDAMENTO — Gli eventi vengono ordinati cronologicamente e deduplicati
    ↓
4. ANALISI IMMAGINI — RX, TAC, RM vengono descritte oggettivamente
    ↓
5. ANOMALIE — Vengono rilevate criticità nella gestione clinica
    ↓
6. DOCUMENTI MANCANTI — Verifica completezza documentale
    ↓
7. CALCOLI — ITT, ITP, giorni ricovero, stima danno biologico
    ↓
8. GENERAZIONE REPORT — Relazione strutturata sezione per sezione
    ↓
9. NOTIFICA — Email di completamento al perito
```

### Flusso semplificato (cronistoria e spese)

Per i moduli di sola estrazione o analisi spese, il flusso si ferma al punto 3 (consolidamento) e produce solo la cronistoria e/o la tabella spese, senza report narrativo.

---

## 3. Moduli disponibili

### Perizia medico-legale stragiudiziale

| Modulo | Cosa produce | Documenti attesi |
|--------|-------------|------------------|
| **Responsabilità civile** | Report completo con epicrisi, conclusioni | Documentazione clinica completa |
| **Sinistro stradale** | Report con focus RC auto, nesso causale | Verbale PS, imaging post-trauma, follow-up |
| **Infortuni** | Report con focus infortunistico | Certificato INAIL, denuncia, referti |
| **Malattia** | Report con focus previdenziale | Certificati, visite collegiali, referti |
| **Responsabilità professionale** | Report con analisi condotta sanitaria | Cartella clinica completa |

### CTU/ATP in ambito civile

| Modulo | Cosa produce | Sezioni specifiche |
|--------|-------------|-------------------|
| **Responsabilità civile** | Report CTU 15 sezioni | Quesiti, Risposte ai Quesiti, Verbale operazioni |
| **Infortuni** | Report CTU con focus infortunistico | Idem |
| **Malattia** | Report CTU con focus previdenziale | Idem |
| **Responsabilità professionale** | Report CTU generico | Idem |

### CTU/ATP in ambito previdenziale

| Modulo | Normativa di riferimento |
|--------|------------------------|
| **Ricorso D.Lgs. 62/2024 (accertamento)** | D.Lgs. 62/2024 — commissione multidisciplinare |
| **Ricorso D.Lgs. 62/2024 (progetto di vita)** | D.Lgs. 62/2024 — progetto individuale |
| **Invalidità civile generica** | Assegno o pensione di invalidità civile |
| **Indennità di accompagnamento** | L. 18/1980 |
| **L. 104 (disabilità)** | L. 104/1992 |
| **L. 222 (inabilità INPS)** | L. 222/1984 |
| **Altri ricorsi INPS** | Cecità, sordità civile, frequenza, vittime del dovere |

### CTU/ATP in ambito INAIL

| Modulo | Cosa produce |
|--------|-------------|
| **Malattia professionale** | Report con focus esposizione lavorativa, nesso causale |
| **Infortunio sul lavoro** | Report con focus dinamica infortunio |

### Pareri

| Modulo | Cosa produce | Sezioni |
|--------|-------------|---------|
| **Parere pro veritate** | Analisi condotta sanitaria + responsabilità | 6 sezioni: intestazione, oggetto, documentazione, analisi condotta, valutazione responsabilità (perito), conclusioni |
| **Parere scopo riserva** | Valutazione prognostica + stima riserva | 6 sezioni: intestazione, documentazione, quadro clinico, prognosi, stima riserva (perito), conclusioni |

### Strumenti

| Modulo | Cosa produce | Report narrativo? |
|--------|-------------|-------------------|
| **Analisi documenti sanitari** | Solo cronistoria eventi clinici | No — solo tabella eventi |
| **Analisi documenti giudiziari** | Solo cronistoria eventi procedurali | No — solo tabella eventi |
| **Analisi spese mediche** | Tabella spese strutturata + cronistoria | No — tabella con importi, ricevute, farmaci |
| **Anonimizzatore** | Testo OCR con dati personali oscurati | No — solo testo anonimizzato |

---

## 4. Dettaglio per tipo di analisi

### 4.1 Perizia stragiudiziale — 9 sezioni

| Sezione | Contenuto | Compilata da |
|---------|-----------|-------------|
| Intestazione | Dati caso, perito, paziente | LegMed (da dati perizia) |
| Dati anamnestici | Anamnesi patologica del paziente | LegMed (da eventi) |
| Il Fatto e la Storia Clinica | Ricostruzione cronologica del fatto | LegMed (da eventi + OCR) |
| **Documentazione Medica Prodotta** | **Cronistoria COMPLETA di TUTTI i documenti medici** | **LegMed (da OCR originale)** |
| Spese Mediche | Riepilogo spese documentate | LegMed (se presenti) |
| Visita Clinica | Esame obiettivo del paziente | **PERITO** (placeholder) |
| Epicrisi | Sintesi fatti + dati ITT/ITP, NO giudizi | LegMed |
| Conclusioni | Conclusioni medico-legali | LegMed |

### 4.2 CTU/ATP civile — 15 sezioni

| Sezione | Compilata da |
|---------|-------------|
| Intestazione | LegMed (da dati perizia: tribunale, RG, giudice) |
| Quesiti | LegMed (da quesiti inseriti dal perito) |
| Profilo Metodologico | LegMed |
| Dati Documentazione in Atti | LegMed (memorie difensive, atti) |
| Premesse | LegMed (documenti legali) |
| **Documentazione Sanitaria** | **LegMed (cronistoria COMPLETA)** |
| Spese Mediche Esibite | LegMed (se presenti) |
| Precedenti Pareri Tecnici | LegMed (perizie CTP/CTU precedenti) |
| Verbale Operazioni Peritali | **PERITO** (placeholder) |
| Visita del Periziando | **PERITO** (placeholder) |
| Epicrisi | LegMed (sintesi oggettiva) |
| Considerazioni Medico-Legali | **PERITO** (placeholder) |
| Conclusioni — Risposte ai Quesiti | LegMed (risposte strutturate ai quesiti) |
| Bibliografia | LegMed (da ricerca PubMed) |
| Osservazioni alla Bozza | **PERITO** (placeholder) |

### 4.3 La sezione "Documentazione Sanitaria/Medica" — come funziona

Questa è la sezione che il perito Dott. Lavini ha evidenziato come critica. Ecco esattamente come viene generata:

1. **Vengono inclusi TUTTI i documenti medici** — cartelle cliniche, referti specialistici, esami strumentali, esami di laboratorio, lettere di dimissione, pronto soccorso, e qualsiasi altro tipo non esplicitamente classificato come atto giudiziario, perizia o spesa
2. **Il testo OCR originale viene passato integralmente** al modello di linguaggio, che deve riprodurre il contenuto **fedelmente**
3. **Ogni documento è elencato cronologicamente** con: data, tipo di documento, contenuto rilevante completo
4. **Nessun documento medico viene omesso** — il filtro esclude solo: memorie difensive, documenti amministrativi, certificati, perizie, spese mediche

**Esempio di output atteso** (dalla perizia di riferimento del Dott. Lavini):

```
RX polso destro per trauma da caduta 22/10/2025
L'indagine odierna, condotta per trauma da caduta, fa rilevare una frattura
dell'epifisi radiale, composta (conferma TC). [...]

Visita specialistica ortopedica 22/10/2025
Paziente di 80 anni in buona salute riferisce caduta accidentale in
supermercato con trauma al polso destro. [...]

Cartella Pronto soccorso del 23/10/2025 n. 2025068117
Anamnesi patologica prossima: Riferita caduta accidentale [...]
Diagnosi: trauma distorsivo polso dx no fratture, rizoartrosi [...]
Piano di Cura: [...]

Visita specialistica ortopedica 27/10/2025
Esiti recente trauma polso [...]
```

---

## 5. Cosa viene estratto dai documenti

### Tipi di evento estratti (15 categorie)

| Tipo | Descrizione | Esempio |
|------|------------|---------|
| `visita` | Visita medica, accesso PS, consulenza | "Visita ortopedica — Dott. Corain" |
| `esame` | Esame diagnostico strumentale | "RX polso destro" |
| `diagnosi` | Diagnosi formale | "Frattura composta epifisi radiale" |
| `intervento` | Intervento chirurgico | "Artroscopia ginocchio sinistro" |
| `terapia` | Terapia prescritta o somministrata | "Terapia con tutore rigido h24" |
| `ricovero` | Ammissione in ospedale | "Ricovero c/o Ortopedia AOUI Verona" |
| `follow-up` | Controllo successivo | "Controllo post-operatorio a 30 gg" |
| `referto` | Referto di esame | "Referto RX: callo osseo in formazione" |
| `prescrizione` | Prescrizione farmaco/terapia | "Meline plus 1x2/die x 20 gg" |
| `consenso` | Consenso informato | "Consenso informato per intervento" |
| `complicanza` | Complicanza clinica | "Infezione ferita chirurgica" |
| `spesa_medica` | Voce di spesa | "Fattura visita ortopedica € 150,00" |
| `documento_amministrativo` | Atto amministrativo | "Verbale commissione INPS" |
| `certificato` | Certificazione medica | "Certificato INAIL di continuazione" |
| `altro` | Evento non classificabile | — |

### Dati estratti per ogni evento

| Campo | Descrizione | Esempio |
|-------|------------|---------|
| Data | Data dell'evento (se presente) | 22/10/2025 |
| Precisione data | Giorno, mese, anno, sconosciuta | giorno |
| Titolo | Descrizione breve (max 100 caratteri) | "RX polso destro per trauma da caduta" |
| Descrizione | Contenuto dettagliato completo | Tutto il referto con valori, diagnosi, indicazioni |
| Tipo fonte | Cartella clinica, referto controllo, esame strumentale, esame ematochimico | referto_controllo |
| Diagnosi | Diagnosi formale se presente | "Frattura composta epifisi radiale dx" |
| Medico | Nome del medico se presente | "Dott. Simone Perandini" |
| Struttura | Nome della struttura se presente | "AOUI Verona" |
| Confidenza | Grado di affidabilità (0-100%) | 95% |
| Testo originale | Citazione esatta dal documento OCR | "frattura dell'epifisi radiale, composta" |
| Pagine fonte | Numero delle pagine da cui è stato estratto | [2, 3] |

### Regole di estrazione per tipo di fonte

**Cartella clinica**: dati di ingresso, esami ematochimici COMPLETI (tutti i valori con unità e range), anamnesi, descrizione operatoria INTEGRALE, cartella anestesiologica, diario clinico (solo eventi avversi, non routine), lettera di dimissione.

**Referti e controlli medici**: visite specialistiche, follow-up, certificati, relazioni — riprodotti INTEGRALMENTE.

**Referti radiologici e strumentali**: RX, TAC, RM, ecografie, ECG, scintigrafie, biopsie — riprodotti INTEGRALMENTE.

**Esami ematochimici**: TUTTI i valori numerici con unità di misura, valori fuori range evidenziati.

---

## 6. Struttura del report generato

### Sezioni placeholder (compilate dal perito)

Alcune sezioni sono marcate come **placeholder** — il sistema inserisce un testo guida con istruzioni, ma il contenuto deve essere compilato dal perito nell'editor:

- **Verbale delle Operazioni Peritali** — data, luogo, presenti
- **Visita del Periziando / Visita Clinica** — esame obiettivo
- **Considerazioni Medico-Legali** — valutazioni del perito
- **Valutazione dei Profili di Responsabilità** (parere pro veritate)
- **Stima della Riserva** (parere scopo riserva)
- **Osservazioni alla Bozza** (solo CTU)

### Epicrisi — cosa contiene

L'epicrisi è una **sintesi oggettiva dei fatti** con integrazione dei calcoli medico-legali (ITT, ITP, giorni ricovero). **NON contiene giudizi** — quelli sono competenza esclusiva del perito.

### Conclusioni — cosa contiene

Le conclusioni includono:
- Sintesi del quadro clinico
- Risposta strutturata ai quesiti (se presenti)
- Riferimenti ai calcoli medico-legali
- Riferimenti bibliografici PubMed (se trovati)

---

## 7. Controlli automatici

### 7.1 Anomalie rilevate

Il sistema cerca automaticamente 9 tipi di anomalie nella documentazione:

| Anomalia | Cosa cerca | Soglia | Gravità |
|----------|-----------|--------|---------|
| **Ritardo diagnostico** | Oltre 90 giorni tra prima visita e prima diagnosi | 90 gg | Media → Alta → Critica |
| **Gap post-chirurgico** | Nessun follow-up dopo intervento, o distacco >60 gg | 60 gg | Media → Alta |
| **Gap documentale** | Periodo senza alcun documento | 180 gg | Media → Alta |
| **Complicanza non gestita** | Complicanza senza trattamento entro 14 giorni | 14 gg | Alta |
| **Consenso non documentato** | Interventi senza consenso informato | — | Media |
| **Diagnosi contraddittoria** | Due diagnosi diverse entro 60 giorni | 60 gg | Media |
| **Terapia senza follow-up** | Terapia senza controllo entro 30 giorni | 30 gg | Bassa |
| **Valori clinici critici** | 9 parametri vitali/laboratorio fuori range critico | Vedi sotto | Variabile |
| **Sequenza clinica anomala** | Ordine eventi non coerente con la patologia | — | Variabile |

### 7.2 Parametri vitali monitorati

| Parametro | Range normale | Soglia critica |
|-----------|--------------|----------------|
| PA sistolica | 90-140 mmHg | <70 o >200 |
| PA diastolica | 60-90 mmHg | <40 o >120 |
| Frequenza cardiaca | 60-100 bpm | <35 o >180 |
| Saturazione O2 | 95-100% | <88% |
| Glicemia | 70-110 mg/dL | <40 o >400 |
| INR | 0.8-1.2 | <0.5 o >5.0 |
| Emoglobina | 12-17 g/dL | <6.0 o >20.0 |
| Temperatura | 36-37.5 °C | <34.0 o >41.0 |
| Creatinina | 0.6-1.2 mg/dL | <0.3 o >10.0 |

### 7.3 Documenti mancanti

Per ogni tipo di caso, il sistema verifica che siano presenti i documenti attesi. Esempio per **sinistro stradale (RC Auto)**:

- Verbale pronto soccorso
- Imaging post-trauma (RX/TC/RM)
- Referti visite specialistiche e follow-up
- Diario clinico/decorso

Esempio per **ortopedica**:

- Consenso chirurgico
- Descrizione operatoria
- Cartella anestesiologica
- Lettera di dimissione
- Follow-up post-operatorio
- Esami pre-operatori
- Imaging pre/post-operatorio

---

## 8. Calcoli medico-legali

Il sistema calcola automaticamente (dove i dati lo consentono):

| Calcolo | Come viene calcolato | Note per il perito |
|---------|---------------------|-------------------|
| **Giorni di ricovero** | Dalla data di ammissione alla data di dimissione | Per ogni ricovero documentato |
| **Periodo totale malattia** | Dal primo evento all'ultimo evento | Stima indicativa |
| **Intervallo tra interventi** | Giorni tra un intervento e il successivo | Per interventi multipli |
| **Tempo diagnosi → trattamento** | Giorni dalla diagnosi al primo intervento/terapia | Per ogni diagnosi |
| **ITT stimata** | Somma dei giorni di ricovero | Il perito deve integrare con periodi di immobilizzazione |
| **ITP stimata** | Dall'ultima dimissione all'ultimo follow-up | Il perito deve definire il grado percentuale |
| **Stima danno biologico** | Range indicativo da tabelle | Indicativa — il perito decide il valore finale |

### Tabelle di riferimento per danno biologico

- **Tabelle SIMLA** — per micropermanenti
- **Tabelle Milano 2024** — per macropermanenti (importo in euro, demoltiplicatore per età)
- **DPR 12/2025** — per sinistri dal 2025 in poi
- **Formula di Balthazard** — per menomazioni concorrenti

---

## 9. Analisi spese mediche

### Cosa produce

Una **tabella strutturata** con le seguenti colonne:

| Colonna | Descrizione | Compilata da |
|---------|------------|-------------|
| Data | Data dello scontrino/fattura/ricevuta | LegMed |
| Descrizione | Descrizione della prestazione o farmaco | LegMed |
| Importo (€) | Importo in euro | LegMed |
| N. Ricevuta/Fattura | Numero del documento fiscale | LegMed |
| Tipo Farmaco | Nome del farmaco (da codice scontrino) | LegMed |
| Categoria | Farmaci, visite, esami, interventi, riabilitazione, ausili, trasporti | LegMed |
| Struttura | Nome farmacia/struttura sanitaria | LegMed |
| Diagnosi correlata | A quale patologia si riferisce la spesa | LegMed |
| Congruità | Se la spesa è giustificata | **PERITO** (il sistema non decide) |

### Categorie di spesa

| Categoria | Cosa include |
|-----------|-------------|
| Farmaci | Farmaci, parafarmaci, dispositivi medici da farmacia |
| Visite specialistiche | Visite mediche, consulenze, consulti |
| Esami diagnostici | RX, TAC, RM, ecografie, analisi sangue, ECG |
| Interventi chirurgici | Interventi, day surgery, ricoveri |
| Riabilitazione | Fisioterapia, FKT, terapie fisiche, massoterapia |
| Ausili e protesi | Tutori, stampelle, plantari, busti, ortesi |
| Trasporti sanitari | Ambulanza, trasporti sanitari |
| Altro | Tutto ciò che non rientra nelle categorie precedenti |

### Scontrini farmacia italiani

Il sistema riconosce il formato standard degli scontrini farmacia italiani:
- Numero scontrino fiscale
- Codice prodotto (es. "042578016")
- Asterisco (*) per farmaci con prescrizione
- Codice AIC/Minsan per identificare il farmaco
- "SIC" = dispositivo medico, "OTC" = farmaco senza ricetta
- Ticket SSN

### Esportazione spese

Le spese possono essere esportate in:
- **CSV** — compatibile con Excel (separatore ; per locale italiano, UTF-8)
- **HTML** — tabella stampabile
- **DOCX** — documento Word con tabella riepilogativa e dettaglio

---

## 10. Formati di esportazione

| Formato | Contenuto | Uso tipico |
|---------|-----------|-----------|
| **HTML** | Report completo con stile, stampabile | Anteprima nel browser, stampa |
| **DOCX** | Documento Word con tabelle, immagini, firma | Deposito, invio a tribunale/avvocati |
| **CSV** | Tabella eventi o spese | Importazione in Excel per analisi |

Ogni formato è esportabile con o senza **anonimizzazione** (i dati personali del paziente vengono sostituiti con [PAZIENTE], [MEDICO], etc.).

---

## 11. Cosa il sistema NON fa

| Il sistema NON... | Perché |
|------------------|--------|
| NON emette giudizi medico-legali | La valutazione è competenza esclusiva del perito |
| NON decide la congruità delle spese | Il perito deve verificare con i documenti originali |
| NON formula diagnosi | Riporta solo le diagnosi trovate nella documentazione |
| NON sostituisce la visita del periziando | La sezione è un placeholder da compilare |
| NON decide il grado di ITP | Fornisce una stima, il perito definisce la percentuale |
| NON decide il danno biologico | Fornisce un range indicativo, il perito decide |
| NON interpreta le immagini diagnostiche | Descrive solo ciò che è oggettivamente visibile |
| NON omette documenti | Tutti i documenti medici caricati vengono inclusi |

---

## 12. Domande frequenti

**D: Perché manca un documento nella cronistoria?**
R: Verificare che il documento sia stato caricato e che l'OCR lo abbia letto correttamente. Tutti i documenti medici (incluso Pronto Soccorso, referti, controlli) vengono inclusi automaticamente. Solo memorie difensive, atti giudiziari e spese mediche sono esclusi dalla sezione sanitaria (hanno sezioni dedicate).

**D: Perché l'importo di una spesa risulta vuoto?**
R: L'importo viene estratto dal testo OCR del documento. Se lo scontrino è illeggibile, parzialmente scansionato, o l'importo non è in formato riconoscibile, il campo resta vuoto. Il perito può verificare con l'originale.

**D: Posso modificare il report generato?**
R: Sì, il report è completamente modificabile nell'editor integrato. È possibile anche rigenerare singole sezioni con istruzioni specifiche.

**D: Le sezioni placeholder devono essere compilate?**
R: Sì, le sezioni "Visita del periziando", "Verbale operazioni peritali", "Considerazioni medico-legali" sono da compilare a cura del perito. Il sistema inserisce un testo guida con istruzioni.

**D: Come funziona la ricerca PubMed?**
R: Il sistema cerca automaticamente fino a 5 articoli scientifici pertinenti basandosi sulle diagnosi e procedure trovate nella documentazione. I risultati vengono inseriti nella sezione Bibliografia.

**D: I dati sono sicuri?**
R: Tutti i dati sono trattati nel rispetto del GDPR Art. 9 (dati sanitari). I server sono in Unione Europea (Francoforte). Nessun dato clinico viene mai registrato nei log di sistema. L'anonimizzazione è disponibile per ogni esportazione.

---

*Documento generato per LegMed v1.0 — Per segnalazioni o richieste: contattare il supporto tecnico.*
