# Data Processing Agreement — Mistral AI (Sub-Responsabile)

> **BOZZA** — Questo documento deve essere rivisto da un legale e firmato bilateralmente con Mistral AI prima del lancio in produzione.

> **Nota**: Mistral AI pubblica il proprio DPA standard all'indirizzo
> [https://mistral.ai/terms/#data-processing-agreement](https://mistral.ai/terms/#data-processing-agreement).
> Il presente template deve essere confrontato e, se necessario, integrato con il DPA ufficiale Mistral per garantire coerenza e copertura completa.

---

## Accordo per il Trattamento dei Dati Personali

ai sensi dell'Art. 28 del Regolamento (UE) 2016/679 (GDPR)

**Tra:**

- **Titolare del trattamento** ("Titolare"): [Ragione sociale], con sede legale in [indirizzo], P.IVA [numero], nella persona del legale rappresentante pro tempore — di seguito "MedLav"

- **Responsabile del trattamento** ("Responsabile"): Mistral AI, SAS con sede legale a Parigi, Francia — di seguito "Mistral AI"

Congiuntamente denominate le "Parti".

---

## 1. Oggetto e durata del trattamento

1.1. Il presente Accordo disciplina il trattamento di dati personali che Mistral AI effettua per conto di MedLav nell'ambito della fornitura dei servizi API di intelligenza artificiale.

1.2. L'Accordo ha efficacia dalla data di sottoscrizione e rimane in vigore per l'intera durata del contratto di servizio tra le Parti. Al termine del contratto, si applicano le disposizioni di cui all'Art. 8 del presente Accordo.

1.3. Il trattamento ha carattere continuativo e si attiva ogni volta che la piattaforma MedLav effettua chiamate API verso i servizi Mistral.

---

## 2. Natura e finalita del trattamento

2.1. Il trattamento riguarda le seguenti operazioni, tutte finalizzate alla generazione automatizzata di report medico-legali:

| Servizio Mistral | Finalita | Modello |
|-------------------|----------|---------|
| **OCR documentazione clinica** | Estrazione testuale da documenti PDF, immagini e file clinici caricati dagli utenti | `mistral-ocr-latest` |
| **Estrazione eventi** | Identificazione e strutturazione degli eventi clinici rilevanti dal testo estratto via OCR | `mistral-large-latest` |
| **Generazione sintesi medico-legale** | Produzione del report medico-legale strutturato con analisi, valutazioni e conclusioni | `mistral-large-latest` |
| **Embedding semantici** | Generazione di vettori per il sistema RAG (retrieval di linee guida cliniche) | `mistral-embed` |

2.2. Il trattamento consiste nella trasmissione temporanea dei dati ai server Mistral AI, nella loro elaborazione algoritmica, e nella restituzione dei risultati a MedLav. Mistral AI non conserva i dati dopo il completamento della singola richiesta API (zero data retention policy).

2.3. Non e previsto alcun processo decisionale automatizzato ai sensi dell'Art. 22 GDPR. I report generati sono strumenti di supporto al perito medico-legale che mantiene piena autonomia decisionale.

---

## 3. Tipo di dati personali trattati

3.1. I dati personali trattati rientrano nelle **categorie particolari** di cui all'Art. 9 GDPR (dati relativi alla salute) e comprendono:

- **Dati sanitari**: diagnosi, referti medici, cartelle cliniche, esiti di esami diagnostici, lettere di dimissione, verbali di pronto soccorso, certificati medici
- **Dati anamnestici**: anamnesi patologica remota e prossima, terapie farmacologiche, allergie
- **Dati relativi a interventi**: protocolli operatori, note chirurgiche, referti anestesiologici
- **Dati di imaging**: referti radiologici, descrizioni di immagini diagnostiche (TAC, RMN, RX, ecografie)
- **Dati identificativi indiretti**: date, riferimenti temporali, codici nosologici che, combinati, potrebbero consentire l'identificazione dell'interessato

3.2. MedLav si impegna, ove tecnicamente possibile, ad anonimizzare o pseudonimizzare i dati prima della trasmissione a Mistral AI, rimuovendo nomi, codici fiscali e altri identificatori diretti.

---

## 4. Categorie di interessati

4.1. Gli interessati i cui dati personali sono oggetto del trattamento sono:

- **Pazienti**: soggetti la cui documentazione clinica e oggetto di perizia medico-legale
- **Terzi eventualmente menzionati**: familiari, testimoni o altri soggetti i cui dati possano comparire incidentalmente nella documentazione clinica

---

## 5. Obblighi del Responsabile (Mistral AI)

Mistral AI, in qualita di Responsabile del trattamento, si obbliga a:

### 5.1. Istruzioni documentate del Titolare

Trattare i dati personali esclusivamente sulla base di istruzioni documentate del Titolare, incluse quelle relative ai trasferimenti di dati personali verso paesi terzi o organizzazioni internazionali, salvo che lo richieda il diritto dell'Unione o dello Stato membro cui e soggetto il Responsabile.

### 5.2. Riservatezza del personale

Garantire che le persone autorizzate al trattamento dei dati personali si siano impegnate alla riservatezza o abbiano un adeguato obbligo legale di riservatezza.

### 5.3. Misure tecniche e organizzative (Art. 32 GDPR)

Adottare tutte le misure tecniche e organizzative adeguate per garantire un livello di sicurezza adeguato al rischio, come dettagliato all'Art. 8 del presente Accordo.

### 5.4. Sub-responsabili

Non ricorrere a un altro responsabile del trattamento (sub-responsabile) senza previa autorizzazione scritta, specifica o generale, del Titolare. In caso di autorizzazione generale, il Responsabile informa il Titolare di eventuali modifiche previste riguardanti l'aggiunta o la sostituzione di sub-responsabili, dando al Titolare l'opportunita di opporsi.

### 5.5. Assistenza al Titolare

Assistere il Titolare, tenendo conto della natura del trattamento, mediante misure tecniche e organizzative adeguate, al fine di soddisfare l'obbligo del Titolare di dare seguito alle richieste per l'esercizio dei diritti dell'interessato di cui al Capo III del GDPR.

### 5.6. Assistenza per gli obblighi di sicurezza (Art. 32-36 GDPR)

Assistere il Titolare nel garantire il rispetto degli obblighi di cui agli articoli 32, 33, 34, 35 e 36 del GDPR, tenendo conto della natura del trattamento e delle informazioni a disposizione del Responsabile. In particolare:

- Sicurezza del trattamento (Art. 32)
- Notifica di violazioni dei dati personali all'autorita di controllo (Art. 33)
- Comunicazione di violazioni dei dati personali all'interessato (Art. 34)
- Valutazione d'impatto sulla protezione dei dati (Art. 35)
- Consultazione preventiva (Art. 36)

### 5.7. Cancellazione o restituzione dei dati

Al termine della prestazione dei servizi, su scelta del Titolare, cancellare o restituire tutti i dati personali e cancellare le copie esistenti, salvo che il diritto dell'Unione o dello Stato membro preveda la conservazione dei dati.

### 5.8. Informazioni e audit

Mettere a disposizione del Titolare tutte le informazioni necessarie per dimostrare il rispetto degli obblighi di cui al presente articolo e consentire e contribuire alle attivita di revisione (audit), comprese le ispezioni, realizzate dal Titolare o da un altro soggetto da questi incaricato (vedi Art. 10).

---

## 6. Localizzazione dei dati

6.1. Tutti i dati personali devono essere trattati ed archiviati esclusivamente all'interno dell'Unione Europea.

6.2. Mistral AI conferma che l'infrastruttura utilizzata per l'erogazione dei servizi API e localizzata nell'UE (data center in area Frankfurt/EU).

6.3. MedLav configura la propria piattaforma per instradare tutte le chiamate API esclusivamente verso gli endpoint EU di Mistral AI.

6.4. Il Titolare e l'intero stack applicativo (Vercel fra1, Supabase EU Frankfurt) sono configurati per il trattamento EU-only.

---

## 7. Trasferimenti extra-UE

7.1. Il trasferimento di dati personali verso paesi terzi o organizzazioni internazionali e **vietato** salvo che:

- esista una decisione di adeguatezza della Commissione Europea ai sensi dell'Art. 45 GDPR; oppure
- siano state fornite garanzie adeguate ai sensi dell'Art. 46 GDPR, incluse le Clausole Contrattuali Standard (SCC) approvate dalla Commissione.

7.2. In caso di necessita di trasferimento extra-UE per motivi tecnici o operativi, Mistral AI deve:

- Informare preventivamente il Titolare con almeno 30 giorni di anticipo
- Predisporre le SCC o altro meccanismo di garanzia appropriato
- Effettuare una Transfer Impact Assessment (TIA)
- Ottenere l'approvazione scritta del Titolare prima di procedere

7.3. Allo stato attuale, nessun trasferimento extra-UE e previsto ne autorizzato.

---

## 8. Misure di sicurezza specifiche Mistral AI

8.1. Mistral AI garantisce le seguenti misure tecniche e organizzative minime:

### Zero Data Retention

- Le chiamate API non vengono salvate, conservate o utilizzate per l'addestramento dei modelli
- I dati trasmessi vengono elaborati in memoria e scartati al completamento della richiesta
- Nessun log contenente dati personali o dati sanitari viene conservato da Mistral AI

### Crittografia

- **In transito**: TLS 1.3 (minimo) per tutte le comunicazioni tra MedLav e le API Mistral
- **A riposo**: crittografia AES-256 (o equivalente) per qualsiasi dato eventualmente conservato temporaneamente durante l'elaborazione

### Infrastruttura EU-only

- Server di elaborazione localizzati esclusivamente nell'Unione Europea
- Nessun instradamento del traffico attraverso nodi extra-UE
- Isolamento logico dei dati per ciascun cliente

### Controllo degli accessi

- Autenticazione API tramite chiavi crittografiche univoche
- Rate limiting e monitoraggio delle chiamate API
- Principio del minimo privilegio per il personale Mistral AI con accesso ai sistemi

### Disponibilita e resilienza

- Sistemi di alta disponibilita con meccanismi di failover
- Backup e disaster recovery conformi agli standard di settore

---

## 9. Notifica data breach

9.1. Mistral AI notifica al Titolare qualsiasi violazione dei dati personali (data breach) **senza ingiustificato ritardo** e comunque entro **72 ore** dal momento in cui ne viene a conoscenza.

9.2. La notifica deve contenere almeno:

- La natura della violazione, incluse, ove possibile, le categorie e il numero approssimativo di interessati e di registrazioni coinvolti
- Il nome e i dati di contatto del DPO o altro punto di contatto di Mistral AI
- La descrizione delle probabili conseguenze della violazione
- La descrizione delle misure adottate o di cui si propone l'adozione per porre rimedio alla violazione e, se del caso, per attenuarne i possibili effetti negativi

9.3. Mistral AI collabora con il Titolare per:

- Contenere la violazione e minimizzarne gli effetti
- Investigare le cause e documentare l'accaduto
- Fornire tutte le informazioni necessarie affinche il Titolare possa adempiere ai propri obblighi di notifica all'autorita di controllo (Art. 33 GDPR) e di comunicazione agli interessati (Art. 34 GDPR)

9.4. I canali di comunicazione per la notifica sono:

- Email: [indirizzo email dedicato]
- Telefono di emergenza: [numero]
- Referente: [nome e ruolo]

---

## 10. Clausola audit

10.1. Mistral AI consente al Titolare, o a un revisore terzo indipendente incaricato dal Titolare, di effettuare audit per verificare la conformita al presente Accordo e agli obblighi di cui all'Art. 28 GDPR.

10.2. L'audit puo comprendere:

- Ispezione delle misure tecniche e organizzative
- Verifica delle policy di sicurezza e data retention
- Revisione dei log di accesso ai sistemi
- Verifica della localizzazione dei dati
- Esame delle procedure di gestione data breach

10.3. Modalita dell'audit:

- Il Titolare comunica la richiesta di audit con almeno **30 giorni** di preavviso
- L'audit viene condotto durante il normale orario lavorativo e senza interferire con le operazioni di Mistral AI
- I costi dell'audit sono a carico del Titolare, salvo che l'audit evidenzi non conformita imputabili a Mistral AI
- I risultati dell'audit sono trattati come informazioni riservate da entrambe le Parti

10.4. In alternativa o in aggiunta all'audit in loco, Mistral AI puo fornire:

- Certificazioni di sicurezza (SOC 2 Type II, ISO 27001 o equivalenti)
- Report di audit di terze parti indipendenti
- Documentazione delle misure tecniche e organizzative aggiornata

---

## 11. Disposizioni finali

11.1. Il presente Accordo e parte integrante del contratto di servizio tra le Parti e prevale in caso di conflitto con altre disposizioni contrattuali in materia di protezione dei dati.

11.2. Eventuali modifiche al presente Accordo devono essere concordate per iscritto da entrambe le Parti.

11.3. Il presente Accordo e regolato dal diritto italiano. Per qualsiasi controversia derivante dall'interpretazione o dall'esecuzione del presente Accordo sara competente il Foro di [citta].

11.4. Le comunicazioni relative al presente Accordo devono essere inviate a:

**Titolare (MedLav):**
- Referente privacy: [nome]
- Email: [email]
- PEC: [pec]

**Responsabile (Mistral AI):**
- DPO: [contatto DPO Mistral AI]
- Email: privacy@mistral.ai

---

**Data**: ___________________

**Per il Titolare (MedLav)**

Nome: ___________________
Ruolo: ___________________
Firma: ___________________

**Per il Responsabile (Mistral AI)**

Nome: ___________________
Ruolo: ___________________
Firma: ___________________

---

## Allegato A — Dettaglio tecnico dei flussi dati

| Flusso | Dati trasmessi | Endpoint | Retention |
|--------|---------------|----------|-----------|
| OCR | PDF/immagini di documenti clinici (referti, cartelle, certificati) | EU API `mistral-ocr-latest` | Zero (elaborazione in-memory) |
| Estrazione eventi | Testo OCR contenente dati sanitari strutturati e non strutturati | EU API `mistral-large-latest` | Zero (elaborazione in-memory) |
| Sintesi report | Testo eventi estratti + contesto caso per generazione report | EU API `mistral-large-latest` | Zero (elaborazione in-memory) |
| Embedding linee guida | Testo di linee guida cliniche (non contiene dati personali) | EU API `mistral-embed` | Zero (elaborazione in-memory) |

## Allegato B — Misure di pseudonimizzazione implementate da MedLav

MedLav implementa le seguenti misure prima della trasmissione dei dati a Mistral AI:

1. I documenti clinici vengono identificati tramite UUID interno, senza associazione diretta con dati anagrafici nel payload API
2. Il caso medico-legale e identificato da un codice interno (ID caso), non dal nome del paziente
3. I log applicativi registrano solo ID e codici, mai dati clinici o anagrafici
4. L'accesso ai dati e filtrato tramite Row Level Security (RLS) per utente autenticato
