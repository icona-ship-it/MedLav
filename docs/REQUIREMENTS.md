# REQUISITI FUNZIONALI - App Medicina Legale (MedLav)

## Documento di Specifica Funzionale

**Versione:** 1.5
**Data:** 13 Marzo 2026
**Scopo:** Definire COSA deve fare l'applicazione, indipendentemente dalla tecnologia utilizzata per svilupparla.

---

## 1. OBIETTIVO DELL'APPLICAZIONE

### 1.1 Cos'e

Una **web app** che permette al medico legale di caricare la documentazione clinica di un paziente e ottenere automaticamente una cronistoria medico-legale strutturata, pronta per essere integrata nella propria relazione peritale.

### 1.2 Chi la usa

L'utente principale e il **medico legale** (perito), che puo operare in qualita di:
- **CTU** (Consulente Tecnico d'Ufficio) - nominato dal giudice
- **CTP** (Consulente Tecnico di Parte) - incaricato dall'avvocato di una delle parti
- **Perito stragiudiziale** - incaricato direttamente dal paziente o dall'assicurazione

Il medico legale NON e un informatico: l'app deve essere semplice, immediata, e non richiedere competenze tecniche.

### 1.3 Il problema che risolve

Oggi il medico legale riceve centinaia di pagine di documentazione clinica (cartelle cliniche, referti, esami) e deve **leggere tutto manualmente**, riordinare cronologicamente i fatti, trascrivere le evidenze cliniche e individuare le criticita. Questo lavoro di ricostruzione richiede ore o giorni per un singolo caso.

L'app automatizza questa fase preparatoria, producendo un unico **REPORT** composto da:

1. **Sintesi medico-legale** - relazione strutturata ed esaustiva del caso
2. **Cronologia eventi clinici** - tutti i fatti medici in ordine cronologico, copia fedele delle evidenze
3. **Anomalie rilevate** - criticita nella gestione clinica
4. **Documentazione mancante** - cosa dovrebbe esserci e non c'e

Il report e esportabile in formato HTML, CSV e RTF/DOCX.

### 1.4 Il flusso di lavoro reale

```
1. Il perito riceve un incarico (dal giudice, dall'avvocato o dal paziente)
2. Riceve la documentazione medica del paziente (PDF, scansioni, etc.)
3. Accede alla web app e crea un nuovo caso
4. Carica tutti i documenti relativi al caso
5. L'app elabora i documenti e genera il REPORT (sintesi + cronologia + anomalie + documentazione mancante)
6. Il perito revisiona, corregge e annota il report
7. Esporta il report e lo usa come base per la propria relazione peritale
```

Il report generato NON e la relazione peritale finale. E il **materiale di lavoro** che il perito usa per scrivere la propria relazione.

---

## 2. TIPOLOGIE DI CASO

Alla creazione del caso, il perito seleziona la **tipologia**. Questo permette al sistema di sapere in anticipo cosa cercare, quali anomalie hanno piu peso, e quali documenti ci si aspetta di trovare. Riduce i tempi di elaborazione e migliora la precisione dell'estrazione.

| Tipologia | Cosa il sistema cerca in priorita | Documenti attesi |
|-----------|----------------------------------|-----------------|
| **Malasanita ortopedica** | Interventi chirurgici, tempi operatori, complicanze post-op, follow-up, imaging pre/post | Cartella chirurgica, RX/TC/RM, descrizione operatoria, follow-up |
| **Ritardo diagnostico oncologico** | Date prime visite, esami diagnostici, tempi tra sospetto e diagnosi, staging | Referti visite, biopsie, imaging, esami markers |
| **Errore ostetrico** | Tracciato cardiotocografico, tempi travaglio/parto, APGAR, partogramma | Cartella ostetrica, CTG, cartella neonatale |
| **Errore anestesiologico** | Cartella anestesiologica, parametri vitali intraop, farmaci somministrati, complicanze | Cartella anestesiologica, monitoraggi, consenso |
| **Infezione nosocomiale** | Esami colturali, antibioticoterapia, date insorgenza, profilassi | Esami microbiologici, diario clinico, terapie |
| **Errore diagnostico** | Sequenza esami, referti, diagnosi formulate, tempi | Referti, imaging, esami lab, visite specialistiche |
| **RC Auto** | Dinamica sinistro, lesioni riportate, nesso causale con incidente | Verbale CID, PS, referti, imaging |
| **Previdenziale** | Patologie invalidanti, capacità lavorativa residua, percentuali | Certificati, visite collegiali, referti |
| **Infortuni sul lavoro** | Dinamica infortunio, nesso con mansione, malattia professionale | Denuncia INAIL, cartella clinica, certificati |
| **Perizia assicurativa** | Valutazione danno per compagnia, congruità spese | Documentazione clinica, fatture, preventivi |
| **Analisi spese mediche** | Congruità e rimborsabilità prestazioni | Fatture, ricevute, tariffari |
| **Opinione prognostica** | Prognosi, riserva assicurativa, evoluzione attesa | Documentazione clinica recente, follow-up |
| **Responsabilita professionale generica** | Analisi completa senza filtri prioritari | Tutta la documentazione disponibile |

Il perito puo sempre selezionare "generica" se il caso non rientra nelle categorie o se preferisce un'analisi senza filtri. È possibile selezionare **più tipologie** per casi che coinvolgono aspetti di più categorie (es. ortopedica + errore diagnostico).

---

## 3. FLUSSO OPERATIVO

```
CARICAMENTO DOCUMENTI → LETTURA/OCR → ESTRAZIONE DATI → VALIDAZIONE → REVISIONE UTENTE → REPORT
```

### 2.1 Caricamento Documenti
- L'utente carica **uno o piu file** relativi allo stesso caso
- Viene assegnato un **codice caso** (es. `CASO-2026-001`)
- Ogni documento viene classificato per tipo di fonte. Se il perito non seleziona un tipo, il sistema lo classifica automaticamente dopo l'OCR (vedi 2.2b). Tipi supportati: cartella_clinica, referto_specialistico, esame_strumentale, esame_laboratorio, lettera_dimissione, certificato, perizia_precedente, spese_mediche, memoria_difensiva, perizia_ctp, perizia_ctu, altro

**Formati di input supportati:**

| Formato | Esempi |
|---------|--------|
| **PDF** | Cartelle cliniche, referti, lettere di dimissione |
| **Immagini** | JPG, PNG, TIFF - scansioni, foto di documenti, foto di referti |
| **Documenti** | DOC, DOCX - relazioni mediche, certificati |
| **Fogli di calcolo** | XLS, XLSX - tabulati esami di laboratorio |
| **Altro** | Qualsiasi formato contenente documentazione clinica |

La documentazione medica nella realta arriva in formati eterogenei: PDF digitali, scansioni, foto scattate col telefono, documenti Word, fogli Excel con esami di laboratorio. Il sistema deve accettare tutto e ricavarne il testo.

### 2.2 Lettura del Documento (OCR)
- I documenti vengono convertiti in testo leggibile tramite Mistral OCR (`mistral-ocr-latest`)
- I documenti scansionati e le immagini vengono processati con OCR (riconoscimento ottico)
- **Testo manoscritto**: il modello OCR gestisce anche testo manoscritto con confidenza variabile. Il sistema segnala la qualità OCR complessiva per documento
- Le immagini mediche (radiografie, TAC, etc.) vengono identificate e conservate
- Ogni pagina viene processata individualmente
- Viene assegnato un **punteggio di qualita OCR** per segnalare documenti poco leggibili

### 2.2b Classificazione Automatica Documenti
- I documenti caricati come tipo "altro" (default) vengono **auto-classificati** dal sistema dopo l'OCR
- La classificazione usa Mistral Large (`mistral-large-latest`) analizzando nome file e prime 3000 caratteri del testo OCR
- Soglia di confidenza minima: **50%** — sotto questa soglia il documento resta "altro"
- 12 tipi documento supportati: cartella_clinica, referto_specialistico, esame_strumentale, esame_laboratorio, lettera_dimissione, certificato, perizia_precedente, spese_mediche, memoria_difensiva, perizia_ctp, perizia_ctu, altro
- Il perito puo sempre sovrascrivere manualmente la classificazione — documenti gia classificati dall'utente non vengono riclassificati

### 2.3 Estrazione Dati Strutturati
- Dal testo estratto vengono identificati e classificati tutti gli **eventi clinici**
- Ogni evento viene strutturato con: data, tipo, titolo, descrizione completa, diagnosi
- Il sistema deve gestire date imprecise (es. "Febbraio 2024" → precisione "mese")
- Quando lo stesso evento compare in piu documenti, le informazioni vengono **consolidate** segnalando eventuali discrepanze tra le fonti

### 2.4 Validazione
- Verifica coerenza cronologica degli eventi
- Identificazione di contraddizioni tra documenti diversi
- Controllo completezza dati
- Segnalazione dati incerti per revisione manuale

### 2.5 Revisione Utente
- Il medico legale visualizza gli eventi estratti PRIMA della generazione del report
- Puo **correggere**, **integrare**, **eliminare** o **riclassificare** eventi
- Puo **annotare** singoli eventi con commenti peritali
- Puo **confermare** o **segnalare** eventi dubbi
- Solo dopo l'approvazione si procede alla generazione del report

### 2.6 Generazione Report
- Produzione dei documenti finali (cronologia, sintesi, anomalie)
- Esportazione in formati multipli
- Il report viene generato in stato **BOZZA** e puo essere rigenerato dopo ulteriori correzioni

---

## 4. STRUTTURA DEL REPORT

L'output dell'app e un **unico report** che contiene tutto il lavoro di ricostruzione della storia clinica. Il report DEVE contenere le seguenti sezioni nell'ordine indicato:

---

### 4.1 SINTESI MEDICO-LEGALE (Relazione del Caso)

La sintesi deve essere una **relazione medico-legale strutturata, approfondita e completa** (NON un riassunto breve), composta da:

#### A) INQUADRAMENTO DEL CASO (minimo 150-200 parole)
- Presentazione completa del paziente (dati anagrafici disponibili, anamnesi remota)
- Motivo del ricovero/prima visita
- Contesto clinico iniziale
- Patologie pregresse rilevanti

#### B) DECORSO CLINICO DETTAGLIATO (minimo 400-600 parole)
- Cronologia ragionata e COMPLETA degli eventi significativi
- NON un semplice elenco, ma una **narrazione medico-legale** che collega causalmente gli eventi
- Includere TUTTI gli interventi, complicanze, cambi terapia
- Citare i dati numerici rilevanti (valori ematici, parametri vitali)
- Evidenziare i passaggi critici della gestione clinica

#### C) STATO ATTUALE (minimo 150-200 parole)
- Condizioni del paziente all'ultimo evento documentato
- Esiti funzionali e menomazioni residue
- Terapie in corso
- Prognosi documentata

#### D) ELEMENTI DI RILIEVO MEDICO-LEGALE (minimo 200-300 parole)
- Punti critici per la valutazione peritale
- Eventuali omissioni o ritardi documentati
- Nesso causale tra eventi critici e danni subiti
- Riferimento alle anomalie rilevate dal sistema
- Documentazione mancante rilevante

**TOTALE MINIMO SINTESI: circa 900-1300 parole**

---

### 4.2 CRONOLOGIA EVENTI CLINICI (Timeline)

La cronologia e la sezione PRINCIPALE del report. E un'**unica timeline in ordine cronologico** che riporta TUTTI i fatti medici come copia fedele delle evidenze cliniche, **senza citazione dei numeri di pagina**.

Nella timeline ogni evento e in ordine di data. Ogni evento porta un'**etichetta di fonte** che indica da quale tipo di documento proviene (A/B/C/D). Le categorie sotto definiscono COSA il sistema deve estrarre da ciascun tipo di fonte e come riportarlo.

---

#### FONTI E REGOLE DI ESTRAZIONE

Le seguenti categorie definiscono **cosa cercare e cosa riportare** per ogni tipo di documentazione. Nel report tutti questi dati confluiscono in un'unica cronologia ordinata per data.

**FONTE A - CARTELLA CLINICA**

Per ogni ricovero/accesso ospedaliero il sistema deve estrarre e riportare:

| Sotto-categoria | Cosa riportare |
|----------------|---------------|
| **A.1 - Dati di Ingresso** | Diagnosi di ingresso (completa, non abbreviata), peso e altezza del paziente, parametri vitali all'ingresso (PA, FC, SpO2, temperatura), data e ora del ricovero |
| **A.2 - Esami Ematochimici** | TUTTI gli esami del sangue effettuati durante il ricovero, valori numerici completi con unita di misura, valori fuori range evidenziati, data di ciascun prelievo |
| **A.3 - Anamnesi e Terapie** | Anamnesi patologica prossima e remota come riportata in cartella, tutte le terapie farmacologiche (farmaco, dosaggio, via, frequenza), modifiche terapeutiche, trasfusioni, fluidoterapia, supporto nutrizionale |
| **A.4 - Descrizione Operatoria** | Testo INTEGRALE della descrizione chirurgica, tipo di intervento, operatori (chirurgo, aiuto, strumentista), tecnica chirurgica, **tempi operatori** (durata, orario inizio/fine), reperti intraoperatori, complicanze intraoperatorie, tipo di anestesia |
| **A.5 - Cartella Anestesiologica** | Valutazione preoperatoria (ASA score, comorbidita), tipo di anestesia (generale/spinale/locale), farmaci anestesiologici, parametri vitali intraoperatori, complicanze anestesiologiche, note post-anestesia |
| **A.6 - Diario Medico e Infermieristico** | **SOLO quando si riferisce all'evento avverso o a complicanze rilevanti** (NON il diario quotidiano di routine). Riportare: annotazioni su complicanze, peggioramenti improvvisi, interventi d'urgenza, consultazioni urgenti, eventi avversi (cadute, reazioni), allarmi o parametri critici |
| **A.7 - Lettera di Dimissione** | Diagnosi di dimissione (completa), condizioni alla dimissione, terapia domiciliare prescritta, indicazioni al follow-up, limitazioni/prescrizioni, prognosi |

**FONTE B - REFERTI CONTROLLI MEDICI**

Riportare INTEGRALMENTE in ordine cronologico:
- Visite specialistiche (ortopediche, cardiologiche, neurologiche, etc.)
- Visite di follow-up post-operatorie
- Visite ambulatoriali
- Certificati medici
- Relazioni mediche di parte
- Visite medico-legali precedenti
- Per ogni referto: **data, specialista, contenuto completo del referto, conclusioni**

---

**FONTE C - REFERTI RADIOLOGICI ED ESAMI STRUMENTALI**

Riportare INTEGRALMENTE in ordine cronologico:
- RX, TAC/TC, RM, ecografie, ECG, scintigrafie, angiografie, PET, EMG, endoscopie, biopsie/istologia, qualsiasi altro esame strumentale
- Per ogni esame: **data, tipo esame, distretto esaminato, descrizione completa, conclusioni diagnostiche**

**FONTE D - ESAMI EMATOCHIMICI**

Riportare TUTTI gli esami di laboratorio in ordine cronologico:
- Emocromo, profilo biochimico, profilo epatico, profilo coagulativo, markers tumorali, esami colturali, esami urine, gas analisi, qualsiasi altro esame
- Per ogni esame: **data, tutti i valori numerici con unita di misura, valori fuori range evidenziati**

---

#### ESEMPIO DI COME APPARE LA CRONOLOGIA NEL REPORT

La timeline e un unico flusso cronologico. Esempio:

```
15/01/2024 [FONTE A - Dati Ingresso]
Ricovero presso Ospedale San Giovanni. Diagnosi ingresso: frattura
sottocapitata femore dx. Peso 72kg, Altezza 168cm. PA 140/85, FC 88,
SpO2 97%, T 36.8°C.

15/01/2024 [FONTE D - Esami Ematochimici]
Emocromo: Hb 11.2 g/dL (↓), GR 3.8 mil/mm3, GB 9.200/mm3, PLT 245.000.
Coagulazione: PT 12.1 sec, INR 1.0, aPTT 28 sec.
Biochimica: Glicemia 105 mg/dL, Creatinina 0.9 mg/dL, Na 141, K 4.1.

16/01/2024 [FONTE A - Descrizione Operatoria]
Intervento di osteosintesi con vite-placca. Chirurgo: Dr. Rossi, Aiuto:
Dr. Bianchi. Inizio ore 08:30, fine ore 10:15 (durata 1h 45min).
Anestesia spinale. [testo integrale della descrizione operatoria...]

18/01/2024 [FONTE A - Diario Medico]
Ore 14:30 - Paziente riferisce dolore acuto e tumefazione arto operato.
Contattato chirurgo di guardia. Disposta TC urgente.

18/01/2024 [FONTE C - Esame Strumentale]
TC arto inferiore dx: "Si evidenzia raccolta fluida periprotesica..."

25/01/2024 [FONTE A - Lettera di Dimissione]
Diagnosi dimissione: frattura sottocapitata femore dx trattata con
osteosintesi, complicata da ematoma post-operatorio. Terapia domiciliare:
[elenco farmaci]. Controllo ortopedico a 30 giorni.

15/02/2024 [FONTE B - Referto Controllo Medico]
Visita ortopedica di controllo - Dr. Verdi, Ambulatorio Ortopedia.
[contenuto completo del referto...]
```

---

### 4.3 REGOLE DI FORMATTAZIONE DELLA CRONOLOGIA

1. **Ordine rigorosamente cronologico** (dalla data piu vecchia alla piu recente)
2. **NESSUNA citazione di numeri di pagina** del documento originale
3. **Copia fedele** delle evidenze cliniche: il testo deve riportare fedelmente quanto scritto nella documentazione, non una rielaborazione o sintesi
4. **Ogni voce deve indicare**: data (formato DD/MM/YYYY), tipo di documento/fonte, contenuto
5. **Date imprecise**: quando non e disponibile il giorno esatto, indicare il mese/anno con nota (es. "Febbraio 2024 [data approssimativa]")
6. **Nessun evento deve essere scartato**: tutto cio che e documentato deve essere riportato (politica ZERO DISCARD)
7. **Discrepanze tra fonti**: quando due documenti riportano informazioni diverse sullo stesso evento, riportare entrambe le versioni segnalando la discrepanza
8. **Abbreviazioni mediche**: tutte le abbreviazioni presenti nei documenti (es. PO, EV, BID, TID, qd, SOB, TC, RM, ECG, PA, FC, SpO2, etc.) devono essere espanse alla prima occorrenza con il significato tra parentesi. Esempio: "BID (bis in die - due volte al giorno)", "EV (endovena)", "PA (pressione arteriosa)". Il sistema deve mantenere un glossario delle abbreviazioni incontrate nel caso

---

### 4.4 ANALISI ANOMALIE MEDICO-LEGALI

Il sistema deve identificare automaticamente le seguenti criticita:

| Tipo Anomalia | Descrizione | Soglia |
|--------------|-------------|--------|
| **Ritardo Diagnostico** | Tempo eccessivo tra visita e diagnosi | > 30 giorni |
| **Gap Post-Chirurgico** | Mancato follow-up dopo intervento | > 30 giorni |
| **Gap Documentale** | Periodi senza documentazione | > 60 giorni (warning), > 180 giorni (critico) |
| **Complicanza Non Gestita** | Complicanze senza trattamento documentato | Qualsiasi |
| **Consenso Non Documentato** | Mancanza di consenso informato per procedure | Qualsiasi |
| **Diagnosi Contraddittoria** | Diagnosi incompatibili in un arco temporale | Entro 90 giorni |
| **Terapia Senza Follow-up** | Terapie croniche senza controlli | > 14 giorni |

Per ogni anomalia rilevata, indicare:
- Tipo e severita (critica / alta / media / bassa)
- Descrizione del problema
- Eventi coinvolti (con data e titolo)
- Suggerimento per il perito

---

### 4.5 DOCUMENTAZIONE MANCANTE

Il sistema deve confrontare la documentazione fornita con quanto atteso per il tipo di caso e segnalare esplicitamente cio che risulta assente:

| Verifica | Cosa controllare |
|----------|-----------------|
| **Consenso informato** | Presente/assente per ogni procedura invasiva |
| **Cartella anestesiologica** | Presente/assente se c'e un intervento chirurgico |
| **Descrizione operatoria** | Presente/assente se c'e un intervento chirurgico |
| **Lettera di dimissione** | Presente/assente per ogni ricovero |
| **Follow-up post-operatorio** | Documentato/non documentato |
| **Esami pre-operatori** | Presenti/assenti se c'e un intervento |
| **Diario clinico** | Presente/assente durante il ricovero |

L'elenco della documentazione mancante deve comparire nel report finale come sezione autonoma, con indicazione di cosa manca e perche e rilevante ai fini medico-legali.

---

### 4.6 CONFRONTO CON LINEE GUIDA E BUONE PRATICHE CLINICHE

Dove possibile, il sistema deve segnalare se la gestione clinica documentata si discosta dalle linee guida e buone pratiche riconosciute:

- **Tempi di intervento**: confronto con tempi raccomandati (es. frattura di femore → intervento entro 48h)
- **Protocolli terapeutici**: aderenza a protocolli standard per la patologia trattata
- **Esami diagnostici**: esami attesi per la patologia che non risultano eseguiti
- **Monitoraggio post-operatorio**: frequenza e tipo di controlli rispetto allo standard

Queste segnalazioni sono **indicative** e servono come spunto per il perito, non come giudizio definitivo. Ogni segnalazione deve indicare la linea guida o il protocollo di riferimento.

---

## 5. TIPOLOGIE DI EVENTI DA ESTRARRE

Il sistema deve riconoscere e classificare questi tipi di evento:

| Tipo | Descrizione |
|------|-------------|
| `visita` | Visite mediche (ambulatoriali, di controllo, specialistiche) |
| `esame` | Esami diagnostici (ematici, strumentali, radiologici) |
| `diagnosi` | Diagnosi formulate |
| `intervento` | Interventi chirurgici e procedure invasive |
| `terapia` | Prescrizioni e somministrazioni terapeutiche |
| `ricovero` | Ingressi e dimissioni ospedaliere |
| `follow-up` | Controlli programmati post-trattamento |
| `referto` | Referti medici e specialistici |
| `prescrizione` | Prescrizioni farmacologiche |
| `consenso` | Consenso informato (acquisito o mancante) |
| `complicanza` | Complicanze ed eventi avversi |
| `spesa_medica` | Fatture, ricevute, ticket sanitari con importi |
| `documento_amministrativo` | Documenti amministrativi (denunce INAIL, pratiche, verbali) |
| `certificato` | Certificati medici, INAIL, di malattia, di idoneità |
| `altro` | Eventi non classificabili nelle categorie precedenti |

---

## 6. STRUTTURA DATI DI OGNI EVENTO

Ogni evento estratto deve contenere:

| Campo | Obbligatorio | Descrizione |
|-------|:---:|-------------|
| `ordine` | Si | Numero progressivo cronologico |
| `data_evento` | Si | Data dell'evento (formato YYYY-MM-DD) |
| `precisione_data` | Si | Livello di precisione: giorno/mese/anno/sconosciuta |
| `tipo` | Si | Classificazione dell'evento (vedi tabella sopra) |
| `titolo` | Si | Titolo descrittivo breve |
| `descrizione` | Si | Descrizione COMPLETA e dettagliata dell'evento (copia fedele del testo originale) |
| `fonte` | Si | Tipo di documento da cui e stato estratto (cartella clinica, referto, etc.) |
| `diagnosi` | No | Diagnosi associata (se presente) |
| `medico` | No | Nome del medico/specialista (se indicato nel documento) |
| `struttura` | No | Struttura sanitaria (ospedale, ambulatorio, etc.) |
| `confidenza` | Si | Livello di affidabilita dell'estrazione (0-100%) |
| `richiede_verifica` | Si | Flag se l'evento necessita di revisione manuale |
| `note_affidabilita` | No | Spiegazione se l'affidabilita e bassa |
| `note_perito` | No | Annotazioni aggiunte dal medico legale in fase di revisione |

---

## 7. FORMATI DI OUTPUT

### 6.1 Report HTML
- Documento HTML interattivo e stampabile
- Contiene: statistiche, sintesi, documentazione mancante, anomalie, cronologia completa
- Indicatori visivi di affidabilita (verde = alta, giallo = media, rosso = bassa)
- Immagini mediche correlate agli eventi (se presenti nel documento)
- Indice/sommario navigabile per sezione
- Ottimizzato per la stampa (layout print-friendly)

### 6.2 Export CSV
- Tabella con tutti gli eventi in formato tabulare
- Colonne: ordine, tipo, data, fonte, titolo, descrizione, diagnosi, medico, struttura, confidenza, affidabilita, richiede_verifica
- Separatore: punto e virgola (;) per compatibilita con Excel italiano
- Encoding UTF-8 con BOM

### 6.3 Report RTF/DOCX
- Documento formattato per Word/LibreOffice
- Stesso contenuto dell'HTML ma in formato **modificabile** dal perito
- Il perito deve poter editare il documento per integrarlo nella propria relazione peritale
- Include intestazioni strutturate per facilitare la navigazione

### 6.4 Template Relazione CTU / CTP (opzionale)
- Struttura precompilata per la relazione peritale del CTU (Consulente Tecnico d'Ufficio) o CTP (Consulente Tecnico di Parte)
- Sezioni standard: quesito, documentazione esaminata, anamnesi, esame obiettivo, discussione, conclusioni
- Il medico legale completa/modifica il template con le proprie valutazioni

---

## 8. GESTIONE IMMAGINI MEDICHE

- Le immagini contenute nei PDF (radiografie, TAC, foto cliniche, etc.) devono essere:
  - Estratte e conservate
  - Associate all'evento clinico corrispondente
  - Incluse nel report HTML con didascalia
- Parole chiave per identificazione: RX, radiografia, TC, TAC, RM, risonanza, eco, ecografia, ECG, PET, scintigrafia, angiografia, biopsia, istologia, citologia

### 8.1 Analisi Automatica Immagini Diagnostiche
- Le immagini mediche vengono analizzate automaticamente con Pixtral Large (`pixtral-large-latest`) per:
  - Identificare il tipo di immagine (RX, TAC, RM, ecografia, foto clinica, etc.)
  - Generare una descrizione del contenuto visibile
  - Assegnare un livello di confidenza all'analisi
- I risultati dell'analisi vengono integrati nel prompt di sintesi per arricchire il report
- L'analisi e puramente descrittiva — il sistema NON formula diagnosi

---

## 9. GESTIONE MULTI-DOCUMENTO

Un singolo caso medico-legale e tipicamente composto da **piu documenti separati**:

| Tipo documento | Esempio |
|---------------|---------|
| Cartella clinica di ricovero | 1 o piu ricoveri |
| Referti ambulatoriali | Visite specialistiche separate |
| Esami di laboratorio | Fogli esami esterni |
| Imaging | CD/referti radiologici |
| Certificati | Certificati medici, INAIL, etc. |
| Documentazione preesistente | Perizie precedenti, sentenze |

Il sistema deve:
- Permettere il caricamento di **piu documenti (qualsiasi formato supportato) per lo stesso caso**
- **Unificare** la cronologia da tutti i documenti in un'unica timeline
- **Identificare e gestire** lo stesso evento riportato in documenti diversi (es. un intervento descritto sia nella cartella clinica che nella lettera di dimissione)
- **Segnalare discrepanze** quando due fonti riportano dati diversi sullo stesso evento
- Permettere di **aggiungere documenti** a un caso gia elaborato e rigenerare il report

---

## 10. PERSISTENZA DATI

Il sistema deve salvare in un database:

| Entita | Descrizione |
|--------|-------------|
| **Casi** | Anagrafica del caso (codice, stato, date, tipo: CTU/CTP/stragiudiziale) |
| **Documenti** | PDF caricati con metadati e classificazione tipo |
| **Pagine** | Testo OCR per ogni pagina con punteggio qualita |
| **Eventi** | Tutti gli eventi estratti con relativi campi |
| **Anomalie** | Anomalie rilevate con severita |
| **Doc. Mancante** | Documentazione assente rilevata |
| **Sintesi** | Testo della sintesi generata |
| **Report** | File generati (HTML, CSV, RTF) con versione |
| **Annotazioni** | Note del perito su singoli eventi |
| **Audit Log** | Traccia di tutte le operazioni (per uso forense) |

---

## 11. VERSIONING DEI REPORT

Ogni report deve avere un ciclo di vita:

```
BOZZA → IN REVISIONE → DEFINITIVO
```

- **BOZZA**: report generato automaticamente, in attesa di revisione
- **IN REVISIONE**: il medico legale sta verificando e annotando
- **DEFINITIVO**: il medico legale ha confermato il report come completo

Il sistema deve conservare tutte le versioni precedenti e permettere il confronto tra versioni. Ogni modifica dopo lo stato "definitivo" crea una nuova versione.

---

## 12. STRUMENTI POST-REPORT

Dopo che il report e stato generato, l'app mette a disposizione del perito strumenti aggiuntivi che lavorano sui dati gia estratti.

### 12.1 Mappatura Quesito Peritale

Il perito inserisce il **quesito peritale** (le domande specifiche poste dal giudice o dall'avvocato). Il sistema analizza il report gia generato e:

- **Mappa automaticamente** gli eventi della cronologia ai singoli punti del quesito
- Per ogni punto del quesito, suggerisce quali eventi, anomalie e documenti sono rilevanti
- Evidenzia se ci sono punti del quesito a cui la documentazione disponibile non permette di rispondere
- Il perito puo modificare le associazioni e aggiungere le proprie considerazioni

Esempio:
```
QUESITO: "Accerti il CTU se vi sia stato ritardo diagnostico..."

→ Eventi rilevanti mappati automaticamente:
  - 10/03/2024 [Fonte B] Visita ortopedica - lamentava dolore persistente
  - 15/05/2024 [Fonte C] RM ginocchio - riscontro lesione LCA
  → GAP: 66 giorni tra prima visita e imaging diagnostico
  → ANOMALIA COLLEGATA: Ritardo Diagnostico (severita: alta)
```

### 12.2 Calcoli Medico-Legali

Il sistema calcola automaticamente dalla cronologia i seguenti periodi, che il perito puo poi correggere:

| Calcolo | Come viene derivato |
|---------|-------------------|
| **Giorni di ricovero** | Dalla data di ingresso alla data di dimissione per ogni ricovero |
| **Invalidita temporanea totale (ITT)** | Periodi di ricovero + periodi di immobilizzazione documentati |
| **Invalidita temporanea parziale (ITP)** | Dal termine dell'ITT alla stabilizzazione clinica (ultimo follow-up con miglioramento) |
| **Periodo totale malattia** | Dalla data del primo evento alla data di stabilizzazione |
| **Intervallo tra interventi** | Distanza temporale tra procedure chirurgiche successive |
| **Tempo diagnosi → trattamento** | Dalla diagnosi al primo intervento terapeutico |

Questi calcoli sono **proposti** dal sistema come base di partenza. Il perito li modifica secondo il proprio giudizio clinico prima di includerli nella relazione.

Il sistema NON calcola la percentuale di invalidita permanente ne il danno biologico, che restano di esclusiva competenza del perito.

### 12.3 Ricerca nel Caso

Il perito deve poter cercare un termine o una frase in **tutto il materiale del caso**:

- Ricerca full-text su tutti i documenti caricati (testo OCR originale)
- Ricerca sugli eventi estratti (titolo, descrizione, diagnosi)
- Risultati evidenziati con contesto (le righe intorno al termine trovato)
- Possibilita di filtrare per tipo di documento o intervallo di date
- Utile per rispondere a domande specifiche del quesito (es. cercare "consenso", "antibiotico", "protesi")

---

## 13. REQUISITI NON FUNZIONALI

### 13.1 Affidabilita Forense
- **NESSUN evento deve mai essere scartato** (Zero Discard Policy)
- Gli eventi incerti devono essere mantenuti con un flag di bassa affidabilita
- Ogni dato deve avere un indicatore di affidabilita visibile nel report
- L'operatore deve poter verificare e correggere manualmente

### 13.2 Tracciabilita
- Log completo di tutte le operazioni di elaborazione
- Timestamp per ogni fase del processo
- Registrazione di chi ha modificato cosa e quando
- Possibilita di audit trail per uso in sede giudiziaria

### 13.3 Formati di Input Supportati
- PDF (testo nativo e scansionati), immagini (JPG, PNG, TIFF), documenti (DOC/DOCX), fogli di calcolo (XLS/XLSX)
- Il sistema deve gestire documenti di grandi dimensioni (centinaia di pagine)
- Deve gestire qualita OCR variabile (documenti vecchi, fotocopie, foto da telefono, etc.)

### 13.4 Sicurezza e Privacy
- I dati medici sono dati sensibili (GDPR, dati sanitari)
- Accesso riservato ai soli utenti autorizzati
- Nessun dato deve transitare su servizi non conformi
- Crittografia dei dati a riposo e in transito

### 13.5 Usabilita
- L'interfaccia deve essere utilizzabile da medici legali senza competenze tecniche
- Il processo deve richiedere il minimo intervento manuale possibile
- I tempi di elaborazione devono essere comunicati chiaramente all'utente

---

## 14. INTERFACCIA WEB APP

L'applicazione e una **web app** accessibile da browser. Il perito accede con le proprie credenziali e gestisce i propri casi.

### 14.1 Autenticazione
- Login con email e password
- Ogni perito vede SOLO i propri casi
- Possibilita di account multi-utente per studi associati

### 14.2 Schermate Principali

**A) Dashboard (Home)**
- Lista dei casi del perito, con: codice, nome paziente (iniziali), data creazione, stato (bozza/revisione/definitivo), numero documenti caricati
- Pulsante "Nuovo Caso"
- Ricerca e filtri per stato/data

**B) Creazione Caso**
- Il perito inserisce: tipo incarico (CTU/CTP/stragiudiziale), **tipologia caso** (ortopedica/oncologica/ostetrica/etc.), nome paziente, riferimento pratica, note
- Upload di uno o piu documenti in qualsiasi formato supportato (drag & drop o selezione file)
- Possibilita di classificare ogni documento caricato (cartella clinica, referto, esami, etc.)
- Pulsante "Avvia Elaborazione"

**C) Elaborazione in Corso**
- Barra di progresso con indicazione della fase attuale
- Il perito puo chiudere la pagina e tornare quando l'elaborazione e completata (notifica via email opzionale)

**D) Revisione Eventi**
- Tabella/lista di tutti gli eventi estratti in ordine cronologico
- Per ogni evento: possibilita di modificare, annotare, segnalare, eliminare
- Possibilita di aggiungere manualmente eventi non rilevati dal sistema
- Indicatori visivi di affidabilita
- Filtri per tipo evento, affidabilita, fonte

**E) Anteprima Report**
- Visualizzazione completa del report generato (sintesi + cronologia + anomalie + documentazione mancante)
- Il perito puo tornare alla revisione eventi per correzioni e rigenerare

**F) Esportazione**
- Download in HTML, CSV, RTF/DOCX
- Scelta del template (standard / CTU / CTP)

**G) Ricerca nel Caso**
- Barra di ricerca full-text su tutta la documentazione e gli eventi del caso
- Risultati con contesto (righe intorno al termine trovato)
- Filtri per tipo documento, intervallo date, tipo evento

**H) Strumenti Post-Report**
- Inserimento quesito peritale e mappatura automatica eventi → quesiti
- Visualizzazione calcoli medico-legali (giorni ricovero, ITT, ITP, periodi)
- Possibilita di correggere i calcoli proposti dal sistema

**I) Archivio Casi**
- Tutti i casi completati con possibilita di riaprirli, duplicarli o archiviarli

---

*Questo documento descrive COSA l'applicazione deve fare. Le scelte implementative (linguaggio, framework, architettura, servizi esterni) sono intenzionalmente escluse per consentire la valutazione di approcci diversi.*
