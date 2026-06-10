# Data Processing Agreement — LegMed (Responsabile) / Cliente (Titolare)

> # BOZZA TECNICA DA FAR VALIDARE A UN AVVOCATO PRIMA DELL'USO
>
> **Questo documento NON e consulenza legale.** E una bozza tecnica predisposta
> internamente per accelerare la revisione di un legale qualificato in materia di
> protezione dei dati. **Non utilizzare con clienti, non firmare e non pubblicare**
> prima della validazione di un avvocato. Le clausole su responsabilita, manleva,
> limitazioni e foro competente sono volutamente minimali e DEVONO essere riviste.
> I link ai DPA dei sub-responsabili (Allegato C) vanno verificati alla data della firma.

---

## Accordo per il Trattamento dei Dati Personali

### ai sensi dell'Art. 28(3) del Regolamento (UE) 2016/679 (GDPR)

**Tra:**

- **Titolare del trattamento** ("Titolare"): **[NOME E COGNOME DEL PERITO / RAGIONE SOCIALE DELLO STUDIO]**, con sede/studio in **[INDIRIZZO]**, C.F./P.IVA **[NUMERO]**, iscritto all'Ordine dei Medici di **[PROVINCIA]** n. **[NUMERO ISCRIZIONE]**, email **[EMAIL]**, PEC **[PEC]** — di seguito il "**Titolare**";

- **Responsabile del trattamento** ("Responsabile"): **LegMed S.r.l.**, con sede legale in **[INDIRIZZO SEDE LEGALE]**, P.IVA **[NUMERO]**, email privacy@legmed.it, PEC **[PEC LEGMED]**, nella persona del legale rappresentante pro tempore — di seguito "**LegMed**";

congiuntamente le "**Parti**".

### Premesse

a) Il Titolare e un medico legale (o studio medico-legale) che, nell'ambito di incarichi professionali come CTU, CTP o perito stragiudiziale, tratta documentazione clinica contenente dati personali, incluse categorie particolari ex Art. 9 GDPR, di pazienti e terzi ("**Interessati**"), in qualita di **titolare autonomo** del trattamento;

b) LegMed fornisce al Titolare, in forza di separato contratto di servizio ("**Contratto Principale**", sottoscritto in data **[DATA]** / costituito dai Termini di Servizio accettati in fase di registrazione), una piattaforma SaaS che elabora la documentazione clinica caricata dal Titolare e genera materiale preparatorio per le perizie medico-legali;

c) tale fornitura comporta un trattamento di dati personali da parte di LegMed **per conto** del Titolare, che le Parti intendono disciplinare ai sensi dell'Art. 28 GDPR;

d) il presente Accordo ("**DPA**") e parte integrante del Contratto Principale e prevale, in materia di protezione dei dati, su eventuali disposizioni difformi.

---

## Art. 1 — Oggetto, durata, natura e finalita del trattamento

1.1. **Oggetto**: trattamento dei dati personali contenuti nella documentazione clinica e nei materiali caricati dal Titolare sulla piattaforma LegMed, nonche dei dati generati dalla loro elaborazione (testo OCR, eventi clinici estratti, anomalie, calcoli medico-legali, report), come dettagliato nell'**Allegato A**.

1.2. **Durata**: il trattamento ha la durata del Contratto Principale. Alla cessazione si applica l'Art. 9 del presente DPA.

1.3. **Natura**: raccolta (upload), conservazione, organizzazione, strutturazione, estrazione, consultazione, elaborazione automatizzata (OCR e modelli linguistici), pseudonimizzazione, comunicazione al Titolare, cancellazione.

1.4. **Finalita**: esclusivamente la fornitura al Titolare delle funzionalita della piattaforma (generazione di bozze di report medico-legali, cronologia eventi, rilevamento anomalie, calcoli, export, dettatura vocale), su istruzione del Titolare. Sono espressamente **escluse**: profilazione degli Interessati, analytics su dati clinici, addestramento di modelli di intelligenza artificiale con i dati del Titolare, cessione a terzi per qualunque finalita propria di LegMed o di terzi, marketing.

1.5. **Processo decisionale automatizzato**: il trattamento non comporta decisioni basate unicamente sul trattamento automatizzato ai sensi dell'Art. 22 GDPR. Ogni output della piattaforma e materiale preparatorio soggetto a revisione, correzione e approvazione del Titolare.

---

## Art. 2 — Categorie di dati personali e di Interessati

2.1. **Categorie di dati**:

| Categoria | Qualificazione GDPR | Esempi |
|-----------|---------------------|--------|
| Dati relativi alla salute di terzi (pazienti) | **Art. 9 — categorie particolari** | Diagnosi, referti, cartelle cliniche, anamnesi, terapie, esiti di esami e imaging, decorso clinico, prognosi |
| Dati identificativi dei pazienti | Art. 4(1) | Iniziali (pseudonimizzate come campo strutturato), date di nascita, codici fiscali e nominativi ove presenti nei documenti caricati |
| Dati di terzi citati nella documentazione | Art. 4(1) | Nomi e qualifiche di medici curanti, strutture sanitarie, familiari, testimoni |
| Dati giudiziari eventualmente presenti nei documenti caricati | Art. 10 (ove ricorrano) | Riferimenti a procedimenti penali contenuti nella documentazione di causa |
| Dati audio del Titolare (dettatura vocale) | Art. 4(1); potenziale Art. 9 se pronunciati dati clinici | Clip audio temporanee (max 5 min), mai persistite |

2.2. **Categorie di Interessati**: pazienti oggetto di perizia; terzi citati nella documentazione clinica e di causa (medici, familiari, testimoni, altre parti).

2.3. Il Titolare garantisce di disporre di idonea base giuridica (per il contesto medico-legale italiano, tipicamente Art. 9(2)(h) GDPR in combinato con l'Art. 2-sexies D.Lgs. 196/2003 e con il mandato professionale ricevuto) per il trattamento dei dati che carica sulla piattaforma, e di caricare esclusivamente documentazione pertinente all'incarico.

---

## Art. 3 — Istruzioni documentate del Titolare

3.1. LegMed tratta i dati personali **soltanto su istruzione documentata del Titolare** (Art. 28(3)(a) GDPR). Costituiscono istruzioni documentate: il presente DPA, il Contratto Principale, la configurazione e i comandi impartiti dal Titolare tramite l'interfaccia della piattaforma (upload, avvio elaborazione, modifica, export, condivisione, cancellazione, impostazioni di retention).

3.2. LegMed informa immediatamente il Titolare qualora, a suo parere, un'istruzione violi il GDPR o altre disposizioni in materia di protezione dei dati (Art. 28(3), ultimo comma).

3.3. Qualora il diritto dell'Unione o dello Stato membro cui e soggetto LegMed imponga un trattamento ulteriore, LegMed informa il Titolare prima del trattamento, salvo che la legge lo vieti per rilevanti motivi di interesse pubblico.

---

## Art. 4 — Riservatezza

4.1. LegMed garantisce che le persone autorizzate al trattamento (dipendenti, collaboratori) si siano impegnate alla riservatezza per iscritto o siano soggette a un adeguato obbligo legale di riservatezza (Art. 28(3)(b) GDPR), e ricevano istruzioni e formazione adeguate al trattamento di dati sanitari.

4.2. L'accesso del personale LegMed ai dati del Titolare e limitato al principio del minimo privilegio ed e tracciato; l'accesso a contenuti clinici avviene solo ove strettamente necessario per assistenza richiesta dal Titolare o per la sicurezza del servizio.

---

## Art. 5 — Misure di sicurezza (Art. 32 GDPR)

5.1. LegMed adotta le misure tecniche e organizzative descritte nell'**Allegato B** (Misure di sicurezza), che le Parti concordano essere adeguate al rischio del trattamento, tenuto conto della natura dei dati (Art. 9 GDPR).

5.2. In sintesi, e con rinvio all'Allegato B per il dettaglio: cifratura in transito (TLS 1.3) e at-rest (AES-256); isolamento dei dati per utente tramite Row Level Security a livello di database; infrastruttura interamente localizzata nell'Unione Europea; audit log; pseudonimizzazione; retention configurabile con cancellazione automatica; backup giornalieri.

5.3. LegMed puo aggiornare le misure dell'Allegato B purche il livello di sicurezza complessivo non risulti diminuito.

---

## Art. 6 — Sub-responsabili (Art. 28(2) e 28(4) GDPR)

6.1. Il Titolare conferisce a LegMed **autorizzazione scritta generale** al ricorso ai sub-responsabili elencati nell'**Allegato C**.

6.2. LegMed informa il Titolare di ogni modifica prevista (aggiunta o sostituzione di sub-responsabili) con almeno **30 giorni** di preavviso tramite email all'indirizzo di registrazione, dando al Titolare la possibilita di opporsi. In caso di opposizione motivata e di impossibilita di soluzione alternativa, il Titolare puo recedere dal Contratto Principale; si applica in tal caso l'Art. 9 (restituzione e cancellazione).

6.3. LegMed impone a ciascun sub-responsabile, mediante contratto, **gli stessi obblighi in materia di protezione dei dati** previsti dal presente DPA, in particolare garanzie sufficienti ex Art. 28(1) e localizzazione del trattamento dei dati clinici nell'Unione Europea. LegMed conserva l'intera responsabilita verso il Titolare dell'adempimento degli obblighi dei sub-responsabili (Art. 28(4)).

6.4. Per i sub-responsabili con sede legale extra-UE ma trattamento in data center UE, i relativi DPA includono le Clausole Contrattuali Standard (Decisione 2021/914) e sono state condotte Transfer Impact Assessment, come documentato nella DPIA di LegMed.

---

## Art. 7 — Trasferimenti extra-UE

7.1. I dati clinici del Titolare sono trattati e conservati **esclusivamente all'interno dell'Unione Europea** (database e storage a Francoforte; elaborazione AI in Francia/UE; hosting a Francoforte). Nessun trasferimento verso paesi terzi e previsto ne autorizzato.

7.2. Qualsiasi futuro trasferimento extra-UE richiede: preventiva informazione al Titolare, garanzie ex Capo V GDPR (decisione di adeguatezza o SCC + TIA) e applicazione della procedura di modifica dei sub-responsabili di cui all'Art. 6.2.

---

## Art. 8 — Assistenza al Titolare (Artt. 28(3)(e)-(f), 32-36 GDPR)

8.1. **Diritti degli Interessati**: tenuto conto della natura del trattamento, LegMed assiste il Titolare con misure tecniche e organizzative adeguate a dare seguito alle richieste degli Interessati (Capo III GDPR). La piattaforma mette a disposizione del Titolare in autonomia: rettifica (modifica di eventi e report), cancellazione (per singolo caso o per intero account), limitazione (archiviazione del caso), esportazione dei dati in formato strutturato. Se un Interessato si rivolge direttamente a LegMed, LegMed inoltra la richiesta al Titolare senza ingiustificato ritardo e non vi da seguito autonomamente, salvo obbligo di legge.

8.2. **Sicurezza e DPIA**: LegMed assiste il Titolare nell'adempimento degli obblighi ex Artt. 32-36 GDPR, mettendo a disposizione la documentazione sulle misure di sicurezza (Allegato B), la propria DPIA in forma consultabile su richiesta, e le informazioni ragionevolmente necessarie per le valutazioni d'impatto del Titolare.

8.3. **Violazioni di dati personali**: LegMed informa il Titolare **senza ingiustificato ritardo, e comunque entro 48 ore** [NB PER IL LEGALE: termine da validare] dal momento in cui viene a conoscenza di una violazione dei dati personali che riguardi i dati trattati per conto del Titolare (Art. 33(2) GDPR), fornendo le informazioni di cui all'Art. 33(3) (natura della violazione, categorie e numero approssimativo di Interessati e registrazioni, probabili conseguenze, misure adottate o proposte), anche per fasi successive. LegMed assiste il Titolare nella eventuale notifica al Garante e nella comunicazione agli Interessati. La gestione interna delle violazioni da parte di LegMed segue la procedura formalizzata `docs/PROCEDURA-DATA-BREACH.md` e il registro ex Art. 33(5).

8.4. Punto di contatto LegMed per ogni comunicazione privacy: **privacy@legmed.it**.

---

## Art. 9 — Cancellazione e restituzione dei dati (Art. 28(3)(g) GDPR)

9.1. Alla cessazione del Contratto Principale, a scelta del Titolare, LegMed **restituisce** tutti i dati personali trattati per suo conto e/o li **cancella**, cancellando le copie esistenti, salvo obblighi di conservazione previsti dal diritto dell'Unione o nazionale.

9.2. Strumenti gia operativi in piattaforma, utilizzabili dal Titolare in autonomia in qualunque momento:

- **Esportazione**: funzione di export completo dei dati (profilo, casi, eventi, report, audit log) in formato JSON strutturato, oltre agli export per singolo caso (HTML/DOCX/CSV);
- **Cancellazione**: funzione di cancellazione dell'account con eliminazione **a cascata** di tutti i dati (profilo, casi, documenti, pagine OCR, eventi, immagini, anomalie, report, log) e dell'account di autenticazione; cancellazione per singolo caso parimenti disponibile;
- **Retention automatica**: cancellazione automatica configurabile dei casi archiviati alla scadenza impostata dal Titolare.

9.3. In assenza di scelta espressa entro **[30/60/90 — DA DEFINIRE]** giorni dalla cessazione, LegMed procede alla cancellazione, dandone conferma scritta al Titolare. I backup tecnici contenenti i dati cancellati decadono secondo il ciclo di rotazione dei backup (vedi Allegato B), entro il quale non sono utilizzati per alcun trattamento attivo.

9.4. I dati inviati ai servizi AI (Mistral) non sono mai conservati dal sub-responsabile (zero data retention): non residuano copie da cancellare presso tale fornitore.

---

## Art. 10 — Audit e informazioni (Art. 28(3)(h) GDPR)

10.1. LegMed mette a disposizione del Titolare tutte le informazioni necessarie a dimostrare il rispetto degli obblighi di cui all'Art. 28 GDPR e consente e contribuisce alle attivita di revisione, comprese le ispezioni, realizzate dal Titolare o da altro revisore da questi incaricato.

10.2. Modalita: (a) in prima istanza, LegMed fornisce documentazione (Allegato B aggiornato, DPIA, esiti di audit interni, certificazioni dei sub-responsabili); (b) audit diretto su richiesta scritta con preavviso di almeno **30 giorni**, in orario lavorativo, massimo **[una volta l'anno — DA VALIDARE]** salvo violazioni accertate, con obbligo di riservatezza del revisore e senza accesso a dati di altri clienti; (c) i costi dell'audit sono a carico del Titolare salvo che emergano non conformita imputabili a LegMed.

---

## Art. 11 — Responsabilita

> [SEZIONE DA REDIGERE/VALIDARE CON IL LEGALE: ripartizione di responsabilita ex Art. 82 GDPR,
> eventuali limitazioni e massimali coordinati con il Contratto Principale, manleve reciproche
> (es. manleva del Titolare per caricamento di documentazione priva di base giuridica),
> coperture assicurative.]

11.1. Ciascuna Parte risponde dei danni cagionati dal trattamento secondo quanto previsto dall'Art. 82 GDPR: il Responsabile risponde solo se non ha adempiuto agli obblighi del GDPR specificamente diretti ai responsabili o ha agito in modo difforme o contrario alle legittime istruzioni del Titolare.

---

## Art. 12 — Durata, modifiche, legge applicabile e foro

12.1. Il presente DPA decorre dalla data di sottoscrizione (o di accettazione contestuale al Contratto Principale) e resta efficace per tutta la durata del trattamento, incluse le attivita di restituzione/cancellazione ex Art. 9.

12.2. Modifiche solo per iscritto. LegMed puo proporre aggiornamenti del DPA (es. per evoluzioni normative o dello stack); gli aggiornamenti sono comunicati con almeno 30 giorni di preavviso.

12.3. Legge applicabile: diritto italiano. Foro competente: **[FORO — DA DEFINIRE COL LEGALE, coordinare col Contratto Principale]**.

---

### Firme

| | Titolare | Responsabile (LegMed S.r.l.) |
|---|---|---|
| Nome | [NOME] | [NOME LEGALE RAPPRESENTANTE] |
| Ruolo | [Medico legale / Legale rappresentante dello studio] | Legale rappresentante |
| Data | [DATA] | [DATA] |
| Firma | ____________________ | ____________________ |

---

## Allegato A — Descrizione del trattamento

| Fase | Operazione | Dati coinvolti | Dove |
|------|-----------|----------------|------|
| Upload | Caricamento documenti clinici su storage cifrato | File PDF, immagini, DOCX | Supabase Storage (Francoforte, UE) |
| OCR | Riconoscimento ottico del testo, incluse immagini estratte | Immagini pagine, testo clinico | Mistral OCR API (UE) — zero retention |
| Estrazione | Strutturazione eventi clinici dal testo OCR | Testo clinico, eventi strutturati | Mistral Large (UE) — zero retention |
| Consolidamento e anomalie | Ordinamento, deduplicazione, rilevamento anomalie (algoritmico, senza AI) | Eventi strutturati | Infrastruttura LegMed (UE) |
| Analisi immagini | Analisi di immagini diagnostiche | Immagini cliniche | Mistral Pixtral (UE) — zero retention |
| Generazione report | Produzione della bozza di report medico-legale | Eventi, anomalie, calcoli, linee guida | Mistral Large (UE) — zero retention |
| Dettatura vocale (opzionale) | Trascrizione di clip audio del Titolare (max 5 min) | Audio in transito, mai persistito | Mistral Voxtral (UE) — zero retention |
| Conservazione | Persistenza di documenti, testi OCR, eventi, report | Tutti i dati del caso | Supabase PostgreSQL + Storage (Francoforte, UE) |
| Export e cancellazione | Restituzione (HTML/DOCX/CSV/JSON) e cancellazione on-demand o automatica | Tutti i dati del caso | Infrastruttura LegMed (UE) |

---

## Allegato B — Misure tecniche e organizzative (Art. 32 GDPR)

Sintesi delle misure; il dettaglio completo e mantenuto nella DPIA di LegMed (disponibile al Titolare su richiesta) ed e aggiornato nel tempo senza diminuzione del livello di sicurezza.

| Ambito | Misura |
|--------|--------|
| Cifratura | TLS 1.3 in transito su tutti i flussi; AES-256 at-rest su database e storage |
| Isolamento dati | Row Level Security (RLS) PostgreSQL su tutte le tabelle: ogni utente accede esclusivamente ai propri dati; verifica di ownership applicativa su ogni operazione |
| Localizzazione | Intera infrastruttura in UE: database/storage Francoforte, hosting Francoforte (Vercel fra1), AI Francia/UE; vincolo architetturale: nessun servizio extra-UE tratta dati sanitari |
| Autenticazione | Email/password con verifica email obbligatoria, hashing sicuro, sessioni con scadenza, reset password con token monouso, rate limiting |
| Pseudonimizzazione | Identificazione dei pazienti tramite iniziali e codice caso; modulo di anonimizzazione automatica nei report (CF, telefoni, email, nomi di parti) |
| Minimizzazione AI | Zero data retention contrattuale presso il fornitore AI; divieto di uso per addestramento modelli; nessun feedback loop |
| Logging | Log applicativi sanitizzati (solo ID e codici, mai dati clinici); audit log immutabile delle azioni rilevanti |
| Retention | Cancellazione on-demand (caso/account, a cascata); retention automatica configurabile dal Titolare con cron giornaliero; log tecnici 90 giorni |
| Backup e resilienza | Backup giornalieri automatici, Point-in-Time Recovery; pipeline a step atomici con retry |
| Sicurezza applicativa | CSP, HSTS, X-Frame-Options DENY, nosniff, validazione input (Zod) su ogni endpoint, query parametrizzate (ORM), protezione CSRF sulle mutazioni |
| Gestione violazioni | Procedura formalizzata di incident response e notifica (`docs/PROCEDURA-DATA-BREACH.md`), registro violazioni ex Art. 33(5) (`docs/REGISTRO-DATA-BREACH.md`), monitoraggio errori in tempo reale (UE) |
| Organizzazione | DPIA ex Art. 35 redatta, approvata e revisionata annualmente; rotazione credenziali documentata; 2FA sui pannelli di amministrazione dell'infrastruttura |

---

## Allegato C — Sub-responsabili autorizzati

> NB: verificare versioni e URL dei DPA pubblici alla data della firma; alcuni fornitori
> aggiornano periodicamente i propri termini.

| Sub-responsabile | Servizio | Sede legale | Regione di trattamento dati | Dati trattati | DPA pubblico |
|------------------|----------|-------------|------------------------------|---------------|--------------|
| Supabase, Inc. | Database PostgreSQL, storage file, autenticazione | USA | **UE — Francoforte (Germania)** | Tutti i dati persistiti (documenti, testi OCR, eventi, report) | https://supabase.com/legal/dpa |
| Mistral AI SAS | Elaborazione AI: OCR, estrazione, sintesi, analisi immagini, dettatura | **Francia (UE)** | **UE** | Testo e immagini dei documenti, audio dettatura — in transito, zero retention | https://mistral.ai/terms/#data-processing-agreement |
| Vercel, Inc. | Hosting applicazione web | USA | **UE — Francoforte (regione fra1)** | Richieste HTTP, log di accesso | https://vercel.com/legal/dpa |
| Inngest, Inc. | Orchestrazione job asincroni | USA | Integrato con hosting UE | **Solo metadati job** (ID caso, stato) — nessun dato clinico | DPA su richiesta (https://www.inngest.com/security) |
| Upstash, Inc. | Rate limiting (Redis) | USA | **UE — eu-central-1 Francoforte** | Contatori tecnici di rate limiting — nessun dato clinico | https://upstash.com/trust |
| Stripe, Inc. / Stripe Payments Europe Ltd. | Pagamenti e fatturazione | USA / Irlanda (UE) | **UE** | Dati di fatturazione del Titolare — nessun dato clinico | https://stripe.com/legal/dpa |
| Resend (Plus Five Five, Inc.) | Email transazionali (notifiche) | USA | UE/USA per il solo routing email — nessun contenuto clinico nelle email | Indirizzo email del Titolare, notifiche di stato (solo codici caso) | https://resend.com/legal/dpa |
| Functional Software, Inc. (Sentry) | Monitoraggio errori | USA | **UE (ingest de.sentry.io)** | Stacktrace ed errori applicativi sanitizzati — nessun dato clinico | https://sentry.io/legal/dpa/ |

Per i sub-responsabili con sede extra-UE: DPA con Clausole Contrattuali Standard (Decisione 2021/914) e Transfer Impact Assessment condotte, come documentato nella DPIA di LegMed (Allegato C della DPIA).

---

*Bozza tecnica redatta il 10 giugno 2026. Stato: **in attesa di validazione legale** — non utilizzare prima della revisione di un avvocato.*
