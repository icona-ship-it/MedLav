# Scheletro DPA — LegMed (Responsabile) / Medico legale cliente (Titolare)

> ⚠️ **BOZZA — da validare con consulenza legale prima della pubblicazione.**
>
> Scheletro dell'accordo ex Art. 28(3) GDPR da sottoporre a un legale. Questo
> documento **non è consulenza legale** e non va firmato né usato con clienti prima
> della validazione. Esiste già una bozza estesa in `docs/DPA-CLIENTE-TEMPLATE.md`:
> questo scheletro ne è l'indice ragionato, da usare come checklist di revisione e
> per allineare i due documenti. In caso di divergenza, il legale decide il testo
> finale unico.

**Data bozza**: 2026-07-04 · **Versione**: 0.1-draft

---

## Parti e premesse

- **Titolare**: il medico legale (o studio) cliente — [DATI IDENTIFICATIVI: nome/ragione sociale, sede, C.F./P.IVA, Ordine dei Medici e n. iscrizione, email, PEC].
- **Responsabile**: LegMed S.r.l. — [SEDE LEGALE, P.IVA, PEC — DA COMPLETARE CON LEGALE], contatto privacy: privacy@legmed.it.
- Premesse: il Titolare tratta documentazione clinica nell'ambito di incarichi peritali in qualità di titolare autonomo; LegMed la elabora per suo conto tramite la piattaforma SaaS; il DPA è parte integrante del contratto principale (Termini di Servizio accettati in registrazione o contratto separato) e prevale in materia di protezione dei dati.

## Art. 1 — Oggetto, durata, natura e finalità del trattamento

- **Oggetto**: dati personali contenuti nella documentazione clinica caricata e nei dati derivati (testo OCR, eventi clinici estratti, anomalie, calcoli, bozze di report, immagini estratte).
- **Durata**: per tutta la durata del contratto principale, fino a cancellazione/restituzione ex Art. 8.
- **Natura**: raccolta, conservazione, organizzazione, strutturazione, estrazione, consultazione, elaborazione automatizzata mediante sistemi di AI (OCR, estrazione, sintesi), comunicazione ai soli sub-responsabili autorizzati, cancellazione.
- **Finalità**: generazione di materiale preparatorio (bozza di perizia) per l'attività medico-legale del Titolare. Nessun uso ulteriore: no addestramento di modelli, no marketing, no comunicazione a terzi non autorizzati.
- [DA COMPLETARE CON LEGALE: rinvio all'Allegato A per il dettaglio delle operazioni.]

## Art. 2 — Categorie di dati e di interessati

- **Categorie di dati**: dati comuni (anagrafici presenti nei documenti, date, strutture sanitarie, nominativi di professionisti) e **categorie particolari ex Art. 9 GDPR** — dati relativi alla salute (diagnosi, referti, cartelle cliniche, esami, terapie, immagini diagnostiche). Possibile presenza incidentale di dati giudiziari (Art. 10) negli atti caricati.
- **Interessati**: periziandi (pazienti/danneggiati), terzi menzionati nella documentazione (familiari, professionisti sanitari, altre parti).
- Il Titolare garantisce di disporre di idonea base giuridica per il trattamento (per l'attività peritale di parte: Art. 9(2)(f) GDPR e regole deontologiche difensive, provv. Garante 512/2018) e di caricare solo dati pertinenti e non eccedenti rispetto all'incarico.

## Art. 3 — Istruzioni documentate del Titolare

- LegMed tratta i dati **solo su istruzione documentata del Titolare**; il presente DPA e l'uso delle funzioni della piattaforma costituiscono istruzione documentata.
- Obbligo di informare il Titolare se un'istruzione, a giudizio di LegMed, viola il GDPR o altre norme applicabili.
- Trattamenti richiesti dal diritto UE o nazionale: preventiva informazione al Titolare, salvo divieto di legge.
- [DA COMPLETARE CON LEGALE: perimetro delle istruzioni aggiuntive ammesse e forma (scritta, in-app).]

## Art. 4 — Riservatezza

- Le persone autorizzate da LegMed al trattamento sono vincolate da obblighi di riservatezza contrattuali [DA COMPLETARE CON LEGALE: o da adeguato obbligo legale] e formate sulla protezione dei dati.
- Accesso ai dati clinici da parte del personale LegMed limitato ai casi strettamente necessari (assistenza richiesta dal Titolare, incident response) e tracciato in audit log.

## Art. 5 — Misure di sicurezza (Art. 32 GDPR)

- Rinvio all'**Allegato B — Misure tecniche e organizzative**: crittografia in transito (TLS) e a riposo, Row Level Security per l'isolamento dei dati per utente, pseudonimizzazione (iniziali del paziente e codice caso come identificativi strutturati), log sanitizzati senza dati clinici, backup cifrati con retention limitata, controllo degli accessi, procedura di gestione delle violazioni.
- [DA COMPLETARE CON LEGALE: redigere l'Allegato B come documento separato versionato; valutare rinvio dinamico alla pagina "Sicurezza e conformità".]

## Art. 6 — Sub-responsabili

- Autorizzazione scritta **generale** del Titolare, con elenco allegato (**Allegato C**, mantenuto pubblico: vedi `docs/compliance/sub-processors.md`).
- Notifica preventiva delle modifiche (aggiunte/sostituzioni) con preavviso di [30] giorni e **diritto di obiezione** del Titolare; in caso di obiezione non risolvibile, facoltà di recesso per la parte di servizio interessata.
- Obblighi equivalenti imposti per contratto a ogni sub-responsabile; LegMed resta pienamente responsabile verso il Titolare dell'operato dei sub-responsabili (Art. 28(4)).
- Trasferimenti extra-UE: esclusi per i dati clinici (trattamento EU-only); per eventuali fornitori con sede extra-UE, SCC 2021/914 e transfer impact assessment.
- [DA COMPLETARE CON LEGALE: termine di preavviso definitivo e modalità della notifica.]

## Art. 7 — Assistenza al Titolare

- **Diritti degli interessati** (Artt. 12-22): assistenza con misure tecniche e organizzative adeguate — ricerca, esportazione, rettifica e cancellazione dei dati di un caso su richiesta del Titolare, tenuto conto della natura del trattamento. Le richieste degli interessati ricevute direttamente da LegMed sono inoltrate al Titolare senza risposta nel merito.
- **Sicurezza, violazioni, DPIA** (Artt. 32-36): assistenza al Titolare per la valutazione d'impatto e l'eventuale consultazione preventiva, mettendo a disposizione la documentazione tecnica (DPIA di LegMed, descrizione della pipeline, elenco sub-responsabili, model card).
- [DA COMPLETARE CON LEGALE: eventuali costi/limiti dell'assistenza oltre soglie ragionevoli.]

## Art. 8 — Violazioni di dati personali (data breach)

- Notifica al Titolare **senza ingiustificato ritardo** dopo essere venuto a conoscenza di una violazione che riguarda i dati trattati per suo conto [DA COMPLETARE CON LEGALE: valutare termine indicativo, es. entro 48/72 ore dalla conoscenza].
- Contenuto minimo della notifica: natura della violazione, categorie e numero approssimativo di interessati e di registrazioni, conseguenze probabili, misure adottate o proposte (allineato all'Art. 33(3)).
- Collaborazione nelle notifiche del Titolare al Garante e agli interessati; registro interno delle violazioni (Art. 33(5)) — procedura operativa in `docs/PROCEDURA-DATA-BREACH.md`.

## Art. 9 — Cancellazione e restituzione a fine servizio

- Al termine del contratto, **a scelta del Titolare**: restituzione dei dati (export documenti e report nei formati supportati) e successiva cancellazione, oppure cancellazione diretta — salvo obblighi di conservazione previsti dal diritto UE o nazionale.
- Termini: cancellazione entro [30/60 — DA COMPLETARE CON LEGALE] giorni dalla cessazione, inclusi i backup secondo il ciclo di rotazione (massimo 12 settimane), con attestazione scritta su richiesta.
- Retention in corso di servizio: cancellazione automatica configurabile dei casi archiviati (default 365 giorni, con preavviso email di 30 giorni), come da documentazione della piattaforma.

## Art. 10 — Audit e verifiche

- LegMed mette a disposizione del Titolare **tutte le informazioni necessarie a dimostrare la conformità** all'Art. 28 (documentazione, certificazioni dei sub-responsabili, DPIA, audit log del proprio account).
- Diritto del Titolare di condurre verifiche/ispezioni, anche tramite terzi incaricati, con [preavviso ragionevole, riservatezza, frequenza massima, orari — DA COMPLETARE CON LEGALE]; ove disponibili, i report di audit indipendenti dei fornitori (ISO 27001, SOC 2) soddisfano prioritariamente le richieste.

## Art. 11 — Disposizioni finali

- [DA COMPLETARE CON LEGALE: responsabilità e manleve, limitazioni di responsabilità, durata e sopravvivenza delle clausole, legge applicabile e foro competente, gerarchia dei documenti contrattuali, firma.]

## Allegati

- **Allegato A** — Dettaglio del trattamento (operazioni, pipeline di elaborazione, flussi di dati). [DA COMPLETARE]
- **Allegato B** — Misure tecniche e organizzative (Art. 32). [DA COMPLETARE]
- **Allegato C** — Elenco dei sub-responsabili autorizzati → `docs/compliance/sub-processors.md`.
