# Sicurezza e conformità

> ⚠️ **BOZZA — da validare con consulenza legale prima della pubblicazione.**
>
> Contenuto per la pagina pubblica "Sicurezza e conformità" di LegMed. Non pubblicare
> prima della revisione di un legale qualificato in protezione dati e diritto delle
> nuove tecnologie. I punti marcati **[DA VERIFICARE]** richiedono conferma fattuale
> prima della pubblicazione.

**Data bozza**: 2026-07-04 · **Versione**: 0.1-draft

---

## Che cos'è LegMed

LegMed è una piattaforma SaaS per medici legali. Il professionista carica la documentazione clinica di un caso di responsabilità civile e riceve una **bozza strutturata di perizia stragiudiziale**: cronologia degli eventi clinici, sintesi della documentazione sanitaria con citazioni testuali, calcoli dei periodi di inabilità, rilevamento di anomalie e documenti mancanti.

La bozza è **materiale di lavoro preparatorio**. Ogni valutazione medico-legale — giudizi, nesso di causalità, percentuali di danno — resta al professionista, che verifica, integra e firma l'elaborato.

---

## Dove stanno i dati

Tutti i dati clinici sono trattati e conservati **esclusivamente nell'Unione Europea**.

| Servizio | Funzione | Regione di trattamento |
|----------|----------|------------------------|
| Supabase | Database e archiviazione documenti | Francoforte, Germania (eu-central-1) |
| Mistral AI | Elaborazione AI (OCR, estrazione, sintesi) | Francia (EU) |
| Vercel | Hosting applicazione | Francoforte, Germania (fra1) |
| Inngest | Orchestrazione elaborazioni (solo metadati tecnici: ID caso, stato — nessun dato clinico) | **[DA VERIFICARE — regione]** |
| Upstash | Rate limiting (solo identificativi tecnici — nessun dato clinico) | EU **[DA VERIFICARE — regione del database Redis]** |
| Resend | Email di notifica (solo indirizzo del professionista e codice caso — nessun dato clinico) | **[DA VERIFICARE — regione]** |
| Sentry | Monitoraggio errori (log sanitizzati — nessun dato clinico) | EU **[DA VERIFICARE — data residency dell'organizzazione]** |
| Stripe | Pagamenti (solo dati di fatturazione — nessun dato clinico) | EU/USA con Clausole Contrattuali Standard **[DA VERIFICARE]** |

L'elenco completo dei sub-responsabili, con le relative garanzie, è pubblicato e mantenuto aggiornato: vedi [Sub-responsabili](./sub-processors.md).

---

## Crittografia e isolamento dei dati

- **In transito**: tutte le comunicazioni avvengono su TLS 1.2+ (HTTPS).
- **A riposo**: database e storage documenti sono cifrati a riposo (AES-256, gestito dall'infrastruttura Supabase).
- **Backup**: point-in-time recovery a 7 giorni in-region; copie off-site settimanali cifrate (GPG AES-256) su storage con giurisdizione EU, con retention massima di 12 settimane.
- **Isolamento per utente**: ogni riga del database è protetta da Row Level Security (RLS) di PostgreSQL — ogni professionista accede esclusivamente ai propri casi. L'accesso ai documenti passa da endpoint autenticati che verificano la titolarità del caso.
- **Log sanitizzati**: i log applicativi non contengono mai nomi di pazienti, diagnosi o dati clinici — solo codici caso e identificativi tecnici.

---

## GDPR e dati sanitari (Art. 9)

LegMed tratta dati relativi alla salute, categoria particolare ai sensi dell'Art. 9 GDPR. Il quadro dei ruoli è il seguente:

- **Il medico legale è titolare del trattamento** sui dati dei periziandi contenuti nella documentazione che carica.
- **LegMed è responsabile del trattamento** ai sensi dell'Art. 28 GDPR e opera solo su istruzione documentata del titolare, sulla base di un DPA sottoscritto con ogni cliente.
- I fornitori di infrastruttura sono **sub-responsabili**, vincolati da DPA e — dove applicabile — da Clausole Contrattuali Standard.

**Base giuridica per i dati sanitari**: il trattamento nell'ambito dell'attività peritale di parte si fonda sull'**Art. 9(2)(f) GDPR** (accertamento, esercizio o difesa di un diritto in sede giudiziaria o stragiudiziale), in combinato con le regole deontologiche per i trattamenti a fini difensivi adottate dal Garante per la protezione dei dati personali (provvedimento n. 512/2018). Per questa finalità **il consenso del periziando non è richiesto**: la disciplina difensiva prevede espressamente che il trattamento possa avvenire senza consenso dell'interessato, entro i limiti di pertinenza e non eccedenza rispetto alla finalità.

*Nota per la revisione legale: la DPIA interna (v1.2) richiama anche l'Art. 9(2)(h); allineare i due documenti sulla base giuridica prevalente prima della pubblicazione.*

---

## Human-in-the-loop by design

Il sistema è progettato in modo che **nessuna valutazione medico-legale sia prodotta autonomamente dall'AI**:

- Le sezioni valutative della perizia (giudizi medico-legali, nesso di causalità, percentuali di danno biologico, graduazione dell'inabilità) sono **segnaposto che il perito compila personalmente**.
- Le sezioni generate (cronologia, sintesi documentale, calcoli dei periodi) sono bozze che il perito verifica e può modificare integralmente prima dell'esportazione.
- Il testo OCR originale resta sempre consultabile a fianco della bozza, per la verifica alla fonte.
- L'elaborato finale è verificato, fatto proprio e firmato dal professionista, che ne assume la responsabilità.

---

## Nessun addestramento sui dati dei clienti

- LegMed **non usa i dati dei clienti per addestrare modelli di AI**, né propri né di terzi.
- I dati inviati a Mistral AI sono trattati ai soli fini dell'elaborazione richiesta, sulla base del DPA con Mistral: non vengono usati per l'addestramento dei modelli (opt-out training verificato in console il 2026-07-05). La retention operativa presso Mistral segue i termini del DPA; la Zero Data Retention non è attivabile dalla console sul piano corrente — NON dichiariamo "zero retention" (rivalutare se Mistral la rende disponibile o via contratto enterprise).

---

## Conservazione e cancellazione

- **Casi attivi**: conservati finché il professionista non li archivia o li cancella — sono fascicoli di lavoro in corso.
- **Casi archiviati**: cancellazione automatica dopo 365 giorni dall'ultima modifica (impostazione predefinita). Il professionista può scegliere 90, 180, 365 o 730 giorni, oppure disattivare la cancellazione automatica (scelta esplicita, legittima per esigenze di difesa in giudizio o prescrizione decennale).
- **Preavviso**: email di avviso 30 giorni prima di ogni cancellazione automatica, con elenco dei casi e possibilità di estensione. Nessuna cancellazione senza preavviso andato a buon fine.
- **Cancellazione su richiesta**: il professionista può cancellare un caso in qualsiasi momento; la cancellazione rimuove documenti, testo OCR, eventi estratti, report e immagini.
- **Dati di fatturazione**: conservati 10 anni per obbligo fiscale, separatamente dai dati clinici.

---

## Conformità dei fornitori

LegMed si appoggia a fornitori con certificazioni di sicurezza verificate in modo indipendente:

| Fornitore | Certificazioni dichiarate |
|-----------|---------------------------|
| Supabase | ISO 27001, SOC 2 Type II |
| Vercel | ISO 27001, SOC 2 Type II |
| Mistral AI | ISO 27001, ISO 27701, SOC 2 Type II |

**[DA VERIFICARE: controllare le certificazioni correnti sulle trust page dei fornitori alla data di pubblicazione e valutare l'aggiunta degli altri sub-responsabili alla tabella.]**

LegMed non dispone ancora di certificazioni proprie (ISO 27001 / ISO 42001): sono pianificate con la crescita del servizio. Non pubblichiamo claim di certificazione che non possiamo dimostrare.

---

## AI Act (Regolamento UE 2024/1689)

- **Classificazione**: l'uso di LegMed per attività peritale **stragiudiziale e di parte (CTP) non rientra nelle categorie ad alto rischio** dell'Allegato III. Le linee guida della Commissione Europea sulla classificazione dei sistemi ad alto rischio (bozza del 19/5/2026, par. 415-416) chiariscono che i periti nominati dalle parti non operano "per conto di un'autorità giudiziaria"; la gestione dei sinistri assicurativi è inoltre esclusa dall'Allegato III, punto 5(c) (par. 314). LegMed **non è destinato all'uso da parte o per conto di autorità giudiziarie** (attività di CTU): questo limite d'uso è dichiarato nella [scheda di trasparenza del modello](./model-card.md).
- **Trasparenza (Art. 50)**: gli obblighi di trasparenza per i contenuti generati da AI sono implementati — l'output esportato include la marcatura in formato leggibile meccanicamente e la dicitura sull'ausilio di un sistema di AI. **[DA VERIFICARE: confermare che la marcatura Art. 50(2) negli export DOCX/HTML sia rilasciata in produzione prima della pubblicazione di questa pagina — scadenza normativa 2/8/2026.]**

---

## Legge 132/2025 (uso dell'AI nelle professioni intellettuali)

La legge 132/2025 richiede al professionista di comunicare al proprio cliente le informazioni sull'uso di sistemi di intelligenza artificiale "con linguaggio chiaro, semplice ed esaustivo" (art. 13, co. 2) e conferma che l'AI può essere usata solo come strumento di supporto, con prevalenza del lavoro intellettuale del professionista (art. 13, co. 1).

LegMed fornisce a ogni cliente un **kit informativo pronto all'uso** per assolvere questo obbligo: paragrafo per la lettera d'incarico, dicitura da apporre in calce alla perizia e FAQ. Vedi [Kit informativa art. 13](./informativa-art13-periti.md).

Il design human-in-the-loop di LegMed (bozza + verifica + firma del professionista, sezioni valutative compilate dal perito) è coerente con il requisito di prevalenza del lavoro intellettuale.

---

## Trasparenza sul funzionamento

Una scheda sintetica del sistema — cosa fa la pipeline, quali modelli usa, quali errori sono noti, cosa resta sempre al professionista — è pubblicata come [Model card](./model-card.md). Non pubblichiamo percentuali di accuratezza non misurate: le metriche sul benchmark interno sono in corso di misurazione e saranno pubblicate con la relativa metodologia.

---

## Segnalazioni e contatti

- **Privacy e diritti degli interessati**: privacy@legmed.it
- **Segnalazione di problemi di sicurezza**: privacy@legmed.it **[DA VERIFICARE: valutare indirizzo dedicato security@]**
- **Segnalazione di errori nelle bozze generate**: dalla piattaforma (valutazione del report) o via email al supporto.
