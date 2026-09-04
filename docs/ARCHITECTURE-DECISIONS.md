# Architecture Decision Records

## ADR-001: Stack Tecnologico
- **Data**: 2026-02-25
- **Contesto**: Definizione dello stack per una web app medico-legale con elaborazione documenti AI, requisiti GDPR stringenti per dati sanitari, e target 20-100 utenti.
- **Decisione**: Next.js 15 (App Router) + React 19 + TypeScript 5.9 strict + Supabase (EU) + Mistral API (EU) + Inngest + Vercel
- **Alternative considerate**:
  - Nuxt 4 (Vue) — scartato per ecosistema componenti piu limitato per app complesse
  - SvelteKit — scartato per ecosistema UI componenti meno maturo
  - Backend separato Python (FastAPI) — scartato per complessita doppio deploy, Inngest gestisce i job pesanti
- **Conseguenze**: Stack unificato JS/TS, deploy singolo su Vercel, background jobs gestiti da Inngest

---

## ADR-002: Mistral come unico provider AI
- **Data**: 2026-02-25
- **Contesto**: I dati sanitari sotto GDPR Art. 9 non possono transitare fuori dall'EU. Serve un LLM con capacita vision (OCR) e analisi testuale.
- **Decisione**: Usare esclusivamente Mistral API (azienda francese, dati processati in EU). Pixtral Large per vision/immagini diagnostiche, Mistral OCR per estrazione testo documenti, Mistral Large per estrazione strutturata, classificazione documenti, sintesi e generazione report.
- **Alternative considerate**:
  - Claude API (Anthropic) — ottime capacita ma data residency EU non garantita al 100%
  - Azure OpenAI (EU region) — possibile ma Mistral e piu semplice per compliance EU-native
  - OCR dedicato (Azure Document Intelligence) + LLM separato — piu complesso, doppio vendor
- **Conseguenze**: Dipendenza da singolo provider. Se la qualita OCR di Pixtral non e sufficiente per testo manoscritto, valuteremo un OCR dedicato EU-compliant come fallback.

---

## ADR-003: Supabase come piattaforma dati
- **Data**: 2026-02-25
- **Contesto**: Serve database PostgreSQL, storage file, autenticazione e realtime updates. Tutto in EU.
- **Decisione**: Supabase con progetto in EU region (Frankfurt). PostgreSQL per dati strutturati, Supabase Storage per documenti, Supabase Auth per autenticazione, Supabase Realtime per progress updates.
- **Alternative considerate**:
  - PostgreSQL self-hosted + MinIO + custom auth — piu controllo ma molto piu lavoro di setup e manutenzione
  - PlanetScale + Clerk + Uploadthing — buoni servizi ma non tutti EU-native
- **Conseguenze**: Vendor lock-in moderato su Supabase. Drizzle ORM come layer di astrazione rende la migrazione possibile.

---

## ADR-004: Inngest per background jobs su Vercel
- **Data**: 2026-02-25
- **Contesto**: L'elaborazione documenti (OCR + LLM) puo richiedere minuti. Vercel ha timeout di 300s per le serverless functions. Serve un sistema di job queue che funzioni con Vercel.
- **Decisione**: Inngest — si integra nativamente con Vercel, permette job long-running spezzati in step (ogni step < 300s), retry automatico, logging integrato.
- **Alternative considerate**:
  - BullMQ + Redis — richiede un server separato, non funziona su Vercel serverless
  - Trigger.dev — valida alternativa ma Inngest ha community piu ampia
  - Supabase Edge Functions — timeout troppo brevi (150s) per elaborazione documenti grandi
- **Conseguenze**: Dipendenza da Inngest. La pipeline di elaborazione deve essere progettata a step atomici.

---

## ADR-005: Drizzle ORM
- **Data**: 2026-02-25
- **Contesto**: Serve un ORM TypeScript per interagire con PostgreSQL. Deve essere type-safe, leggero, e compatibile con Supabase.
- **Decisione**: Drizzle ORM — type-safe, zero overhead a runtime, schema-as-code, ottimo supporto PostgreSQL.
- **Alternative considerate**:
  - Prisma — piu popolare ma piu pesante, cold start piu lenti su serverless, schema separato
  - Kysely — query builder puro, meno feature di ORM
  - Raw SQL con Supabase client — troppo manuale per le operazioni complesse necessarie
- **Conseguenze**: Schema definito in TypeScript, migration con drizzle-kit.

---

## ADR-006: shadcn/ui per componenti UI
- **Data**: 2026-02-25
- **Contesto**: L'app richiede componenti UI professionali (tabelle, form, dialog, select, tabs) per un'interfaccia medico-legale.
- **Decisione**: shadcn/ui — componenti copiati nel progetto (non dipendenza npm), basati su Radix UI, completamente personalizzabili, Tailwind CSS.
- **Alternative considerate**:
  - Material UI — troppo opinionated, bundle size grande
  - Ant Design — stile non adatto, bundle size grande
  - Headless UI — meno componenti disponibili
- **Conseguenze**: Componenti UI nel progetto sotto src/components/ui/, personalizzabili al 100%.

---

## ADR-007: Pipeline elaborazione documenti con Inngest a step
- **Data**: 2026-02-25
- **Contesto**: Implementazione della pipeline core dell'app: upload → OCR → estrazione eventi → consolidamento → anomalie → doc mancanti → sintesi.
- **Decisione**: Una singola funzione Inngest per caso (`processCaseDocuments`) con 13 step logici (molti più step atomici). Ogni step e atomico e retryable. OCR con `mistral-ocr-latest`, classificazione con `mistral-large-latest`, estrazione con `mistral-large-latest` (streaming), sintesi con `mistral-large-latest`, analisi immagini con `pixtral-large-latest`.
- **Alternative considerate**:
  - 1 funzione Inngest per documento — piu parallelismo ma consolidamento richiede tutti i doc, coordinazione piu complessa
  - Step separati per ogni documento (OCR-doc-1, OCR-doc-2) — vantaggi di retry granulare ma complessita di orchestrazione
  - Pipeline sincrona in API route — impossibile per documenti grandi (timeout Vercel 300s)
- **Conseguenze**:
  - I documenti OCR vengono processati in parallelo (Promise.all su step.run), l'estrazione per chunk è parallela per documento
  - Se un documento fallisce OCR, gli altri continuano (graceful degradation)
  - Admin Supabase client usato negli step Inngest (no cookie utente)
  - Signed URL generate per step per evitare scadenza
  - Polling 3s lato client per progress tracking

---

## ADR-008: Anomaly detection algoritmica con soglie configurabili
- **Data**: 2026-02-25
- **Contesto**: Servono 7 tipi di anomalia medico-legale con soglie specifiche (da REQUIREMENTS.md).
- **Decisione**: Detection puramente algoritmica (no LLM) basata su soglie temporali e confronto eventi. Le soglie sono costanti configurabili.
- **Rationale**: Determinismo, velocita, costo zero (no API calls), risultati prevedibili e verificabili.
- **Conseguenze**: Anomalie limitate a pattern temporali e relazionali. Anomalie semantiche (es. "terapia inappropriata") richiederebbero LLM in futuro.

---

## ADR-009: Report quality guardrails post-generazione
- **Data**: 2026-03-13
- **Contesto**: Il report generato da Mistral Large puo contenere sezioni mancanti, date sentinel leaked (01/01/1900), o eventi omessi dalla cronologia. Senza validazione, questi problemi finiscono nel report salvato.
- **Decisione**: Validatore post-generazione (`report-validator.ts`) che controlla 5 condizioni: report vuoto, troppo corto (<200 parole), sezioni obbligatorie mancanti, date sentinel nel testo, copertura eventi <50%. Non blocca la pipeline — logga warning/errori e salva comunque (meglio un report imperfetto che niente).
- **Rationale**: Determinismo e velocita (regex + conteggi, no LLM). Fornisce metriche osservabili (eventCoverage %) per monitoring qualita nel tempo.
- **Conseguenze**: I log di sintesi ora includono validation errors/warnings e % copertura eventi, utili per identificare pattern di bassa qualita.

---

## ADR-010: OCR parallelo nella pipeline Inngest
- **Data**: 2026-03-13
- **Contesto**: L'OCR dei documenti era sequenziale (for loop con await). Con 5 documenti, il tempo era 5x il singolo OCR.
- **Decisione**: OCR parallelizzato con Promise.all su step.run — stesso pattern gia usato per l'estrazione chunk. Ogni step.run ha il suo budget timeout Inngest indipendente.
- **Alternative considerate**: Mantenere sequenziale per semplicita — scartato perche il guadagno di tempo e significativo senza rischi aggiuntivi (il semaforo nel client Mistral gestisce i rate limit).
- **Conseguenze**: Tempo OCR = max(singolo documento) invece di sum(tutti i documenti). Con 5 documenti, riduzione tipica da ~150s a ~30s.

---

## ADR-011: Prompt versioning con SHA-256 hash
- **Data**: 2026-03-13
- **Contesto**: I report generati da Mistral non hanno tracciabilità della versione del prompt che li ha generati. Se il prompt cambia, non si sa quale versione ha prodotto quale report. Critico per audit di qualità e compliance.
- **Decisione**: Ogni report generato include un `promptVersion` (hash SHA-256 troncato a 12 caratteri del system prompt) salvato nel campo `generation_metadata` (JSONB) della tabella reports.
- **Alternative considerate**:
  - Versione manuale (v1, v2, v3) — richiede aggiornamento manuale, errore umano
  - Hash completo — troppo lungo per display, 12 char sufficienti per unicità pratica
  - Salvataggio intero prompt — spreco di storage, il hash è sufficiente per identificazione
- **Conseguenze**: Ogni report è tracciabile alla versione del prompt. Permette analisi di qualità per versione, rollback, e A/B testing futuro. Richiede migration DB per aggiungere colonna `generation_metadata`.

---

## ADR-012: Struttura report diversa per ruolo (CTU/CTP/Stragiudiziale)
- **Data**: 2026-03-29
- **Contesto**: Il report aveva struttura unica per tutti i ruoli (10 sezioni universali + specialty). Analisi di 4 benchmark reali del perito + questionario compilato ha rivelato: report 9x troppo lunghi, sezioni sbagliate, ridondanza estrema, sezioni specialistiche non volute dal perito.
- **Decisione**: Tre strutture separate in `section-catalog.ts`: CTU (15 sezioni), CTP (14), Stragiudiziale (8). Sezioni placeholder per il perito (Verbale, Visita, Considerazioni ML, Bibliografia). Epicrisi sostituisce Riassunto. Rimosse sezioni specialistiche e Elementi di Rilievo. Rimossi [Ev.N] — citazioni per documento/autore/data.
- **Alternative considerate**: Template singolo con flag per ruolo — troppo complesso, sezioni fondamentalmente diverse tra CTU e stragiudiziale.
- **Conseguenze**: Token budget ridotto del 62% (~120K → ~45K). Target report 5-8K parole. Tempo generazione stimato 8-12 min (da 25-40).

---

## ADR-013: Data integrity safeguards nella pipeline
- **Data**: 2026-03-29
- **Contesto**: Audit ha rivelato 3 rischi critici: diagnosi discordanti auto-risolte silenziosamente, nomi medici hallucinated dal LLM accettati senza validazione, date inferite con confidence alta.
- **Decisione**: (1) Diagnosi discordanti: mai auto-risolte, confidence cap 30%, requiresVerification=true. (2) Nomi medici/strutture: validati vs testo OCR — nullificati se non trovati. (3) Date inferite: confidence cap 25%, nota esplicita. (4) Report troncati: throw error invece di salvare.
- **Conseguenze**: Pipeline piu' conservativa — preferisce segnalare incertezza al perito piuttosto che produrre dati potenzialmente errati. Allineato con requisiti medico-legali.

---

## ADR-014: Classificazione documenti parallela
- **Data**: 2026-03-30
- **Contesto**: La classificazione era sequenziale (for loop), ogni documento ~5s. Con 10 documenti: 50s di attesa.
- **Decisione**: Classificazione parallelizzata con Promise.allSettled — uno step Inngest per documento.
- **Conseguenze**: 10 documenti passano da ~50s a ~5s. Fault-tolerant: se un documento fallisce, gli altri procedono.

---

## ADR-015: Dettatura vocale via Mistral Voxtral (batch, multilingua auto-detect, no persistenza audio)
- **Data**: 2026-05-22
- **Contesto**: Il perito spende tempo significativo digitando contenuti discorsivi della perizia (SOGGETTIVO/OBIETTIVO della visita, quesiti del giudice, considerazioni medico-legali, note su eventi e anomalie). La digitazione e' un collo di bottiglia, tipicamente a fine giornata dopo le visite. Una soluzione di dettatura vocale ridurrebbe il tempo del 50-70% su questi campi.
- **Alternative valutate**:
  - **Web Speech API browser** (`webkitSpeechRecognition`) — gratuito ma su Chrome inoltra l'audio a Google. Inaccettabile per GDPR Art. 9.
  - **Whisper WASM client-side** — privacy ottima ma scarica 150MB-1.5GB di modello, lento su mobile, UX scadente al primo uso.
  - **OpenAI Whisper API** — qualita' ottima ma introdurrebbe un nuovo provider e DPA fuori EU.
  - **Mistral Voxtral via API** — scelta adottata.
- **Decisione**: Endpoint `POST /api/transcribe` che inoltra clip audio (multipart) a `client.audio.transcriptions.complete()` (modello `voxtral-mini-latest`) tramite l'SDK Mistral v1.14. UX: push-to-talk toggle con auto-stop a 5 minuti, ESC per annullare, contesto di dominio (`contextBias`) per migliorare accuratezza. Componente riusabile `<DictationButton>` con hook `useDictation` integrato in: RichTextEditor (toolbar), perizia-form (esame obiettivo + quesiti), event-card (descrizione + note), anomalies-section (nota perito).
- **GDPR Art. 9**:
  - Audio NON persistito ne' da LegMed (no Storage/DB) ne' da Mistral (per default le richieste API non vengono conservate, vedi DPA).
  - Audit log registra solo metadata (durata, lingua, costo, modello) — MAI il testo trascritto.
  - Disclaimer first-use mostrato al primo click del microfono, invita a evitare identificatori diretti del paziente.
  - DPA Mistral copre il flusso (vedi `docs/DPA-MISTRAL.md` Allegato A aggiornato).
- **Costo & rate limiting**: Voxtral Mini batch = $0.003/min. Flat 1 credito per dettatura (clip cappata a 5 min server-side → worst case $0.015 = ~1.5 crediti). Rate limit Upstash 30 trascrizioni/ora/utente per protezione cost runaway.
- **Multilingua**: una sola implementazione, auto-detect lingua (IT/DE/EN coperti — Voxtral supporta 13 lingue). Override possibile dall'UI futura.
- **Conseguenze**: Riduce tempo di compilazione campi testo lunghi. Aggiunge un nuovo flusso dati (audio) verso Mistral EU. Nessuna migration DB. Nessun nuovo env var.
- **SUPERATA il 2026-06-10**: funzionalità rimossa su decisione di prodotto (ridondante rispetto alla dettatura nativa OS; eliminato il flusso audio verso Mistral). Rimossi endpoint `/api/transcribe`, `services/transcription/`, `DictationButton`/`useDictation`, credito `dettatura`, rate limit `DICTATION`, modello `voxtral-mini-latest`; `Permissions-Policy: microphone` riportata a deny. I record storici in audit log e transazioni crediti restano in DB.

---

## ADR-016: Allineamento struttura report ai gold standard (benchmark/gold/) per tipo di analisi
- **Data**: 2026-06-10
- **Contesto**: 12 perizie reali depositate dal Dott. Lavini (gold standard, locali e gitignored in `benchmark/gold/`) sono state confrontate con i prompt/template di generazione tramite gap analysis multi-agente (11 gap report, 110 osservazioni, sintetizzate in 42 change prioritizzate — `scratchpad/synthesis-plan-gold-2026-06-10.json`). I prompt erano allineati ai soli benchmark storici (Del Porto, Antoniazzi).
- **Decisione** (forma, mai contenuto; giudizi sempre placeholder del perito):
  - **CTU**: premesse e documentazione_atti mutuamente esclusive nel piano (5/6 gold riproducono gli atti UNA volta in "I Dati della Documentazione in Atti"; il profilo Del Porto resta raggiungibile escludendo doc_atti dal selettore). Quesiti come blocco virgolettato unico con numerazione ORIGINALE (6/6 gold), agganciato all'intestazione con formula-ponte ("era precisato nei seguenti quesiti:" / ATP: "Lo scopo dell'accertamento era indicato dai seguenti quesiti:"). Considerazioni ML ristrutturate PER QUESITO con formule SIMLA 2016, guida polizza infortuni e chiusura bozza. Operazioni peritali = scheletro-verbale completo (comparizioni, dichiarazioni a verbale, visita in rubriche veronesi, firme). Nuove sezioni opzionali: profilo_metodologico (gold Del Porto), accertamento_ausiliario (condition has-ausiliario), preventivi_spese_ml (condition has-ctp-nominati). Pareri tecnici riprodotti INTEGRALMENTE (budget HUGE). Conciliazione attivata anche dal quesito "tenti la conciliazione".
  - **Varianti**: ambito PENALE (intestazione "Perizia Tecnica" presso la Corte, N. R.G. App., imputati/parte civile, "I Dati dell'Incontro Peritale", considerazioni con sinossi + risposta per-quesito alla Corte e diagnosi differenziale eziologica); DECESSO civile (flag `decesso` in perizia_metadata: considerazioni su causa morte/"più probabile che non"/iure proprio-hereditatis senza ITT-ITP-SIMLA, operazioni senza visita, niente tabella ITT/ITP deterministica); COLLEGIO (coCtuName/coCtuTitle: conferimento plurale, doppia carta intestata, firma "Il Collegio di CC.TT.U."/"I Periti").
  - **Stragiudiziale**: intestazione deterministica a carta intestata (renderStragiudizialeHeader — perito+specializzazioni, formula del consenso, dati periziando riga per riga, riga-scopo); il vecchio render a schede resta SOLO per i pareri. Epicrisi con scheletro guidato a 7 punti (nesso, attribuzione, INABILITÀ TEMPORANEA graduata "AL X% di gg. N", danno biologico in punti, formula SIMLA 2016, grado di sofferenza, congruità spese). Spese spostate dopo la visita, prima dell'Epicrisi.
  - **Cronistoria** (diff Passaniti pre/post revisione perito): eliminati titolo e meta-block (la riga "Paziente:" era anche un'esposizione GDPR), tipo evento ed etichette FONTE; testata evento = "data — titolo"; resta l'attribuzione "Dr. — Struttura", watermark RISERVATO e footer. Rank intra-day: l'accesso/ammissione apre la giornata. Filtro non-clinici anche dentro le funzioni export (difesa in profondità).
  - **Doc sanitaria deterministica**: header di blocco "**Tipo, Struttura in data DD.MM.YYYY:**" (mai il filename, che resta solo nell'elenco analitico).
- **Conflitti tra gold (scelte documentate)**: ordine spese↔pareri (Del Porto inverso a benchmark-giudiziale/Leoni → scelta maggioranza: pareri prima delle spese); titolo spese ("Spese Mediche Esibite" mantenuto, "Le Spese Sanitarie in Atti" variante non adottata); Premesse (solo Del Porto la usa → soppressa di default, raggiungibile da selettore); qualifica giudice ("Giudice Delegato" per ATP, "Giudice Istruttore" altrimenti).
- **Rimandati con motivazione**: backstop deterministico anti eventi-inferiti nel consolidator (richiede percorso di persistenza dei flag nello step consolidate-events, oggi aggiorna solo order_number — da fare con QA sul caso Passaniti); blocchi multi-parte multilinea nell'intestazione; colonna "Numero fattura" nella tabella spese (dato non estratto in modo affidabile); rinomina sezione documentale unica penale (collisione di titolo con documentazione_atti); alias parser per titoli alternativi; titoli stragiudiziali con articolo.
- **Conseguenze**: 16 sezioni CTU (da 13), 15 CTP, 7 stragiudiziale (ordine cambiato). Nuovi campi nullable in perizia_metadata JSONB (decesso, coCtuName/coCtuTitle, oggettoIncarico, termineBozza/termineOsservazioni, provvedimentiOrdinanza) — NESSUNA migration. I testi placeholder lunghi vivono in `section-placeholders.ts` (nuovo modulo). Gate di qualità rimasto manuale: generare report sui casi gold e lanciare `pnpm eval:golden` (benchmark/generated/ ancora vuota).

### ADR-016 — Addendum verifica avversariale (2026-06-10, secondo giro)
- **Contesto**: 4 verificatori indipendenti hanno confrontato il codice AGGIORNATO con i gold: verdetto "quasi-allineato" su tutte le aree, 14 gap residui (report in `scratchpad/verify-residual-gold-2026-06-10.json`).
- **Chiusi**: blocco operativo dell'intestazione (CC.TT.P./termini/fondo/provvedimenti) spostato DOPO i quesiti come in 3/3 gold CTU-RC (coda deterministica della sezione Quesiti, `buildOperativeCodaFromMetadata`); premesse standalone quando doc_atti è esclusa (la directive copre anche gli stragiudiziali); considerazioni DECESSO ristrutturate per-quesito; numero di ruolo "Causa Civile N.R.G." per cause ordinarie; qualifica giudice = campo del perito (fallback euristico); lessico penale "periti"; carta intestata co-perito con specializzazioni multi-riga; `accompagnatore` estraibile dall'header LLM; titoli stragiudiziali con articolo (I Dati Anamnestici, La Visita Clinica); anamnesi stragiudiziale a scheda telegrafica; indice cronologico senza colonna Tipo; `extractReceiptRef` con pattern PagoPA; colonna "N. Ricevuta/Fattura" nella tabella spese del report (riferimento `benchmark/Spese mediche/`).
- **Conflitti tra gold lasciati come sono (documentati)**: conferimento collegiale civile "ai sottoscritti" (benchmark-giudiziale) vs "in collegio con" (calascibetta) → tenuta la prima; titolo operazioni "I Dati delle Operazioni Tecniche" vs variante "…e degli Incontri con le Parti" (calascibetta); formula-ponte penale "al Perito/ai Periti" vs "al Consulente Tecnico" (vitali r.61); ATP: "Numero di Ruolo Generale" (calascibetta) vs "n. R.G." (del-porto) → tenuta la prima.

## ADR-017: Scala dei report su casi voluminosi (OOM e cliff 4MB Inngest)
- **Data**: 2026-06-18
- **Contesto**: caso-195 (1477 eventi, 47 doc, 16 immagini) andava in **OOM** (~340s, sotto gli 800s di maxDuration → memoria, non tempo) nella fase finale; a ~3000+ eventi l'array eventi restituito come **step-output Inngest** sforava i 4MB (fallimento netto). Diagnosi da design multi-agente + critica avversariale (`tasks/welytiisg.output`). Lavini: 1477 eventi = caso **NORMALE**, ce ne sono di molto più grandi → la scala è il REQUISITO BASE, non un edge case.
- **Decisione**: **(P0, `5e231c4`)** OCR scoped per-finestra `fetchDocumentsOcrContext(caseId, docIds)` (non l'OCR dell'intero caso a ogni finestra); doc-sanitaria batchata per **FINESTRE CRONOLOGICHE di eventi** (~50/finestra, ogni finestra = step Inngest separato, modulo `doc-sanitaria-batch.ts`); memoria Vercel 1024→**3008 MB**; **lock per-caso** (Inngest concurrency `key=event.data.caseId, limit=1`) — rimosso il per-utente (Inngest accetta max 2 entry concurrency); throttle avvii 8/min. **(P1, `ce918fd`)** `allEvents` e `synthesisParams` letti nel **BODY** della funzione, NON come step-output (mirror di `process-case.ts` già P1-safe) → payload/memoria per step indipendenti dal n° eventi; il lock per-caso garantisce il determinismo tra i replay.
- **Conseguenze**: nessuna migration. caso-195 v2 rigenerato senza OOM (472K char). **Aperti (P2)**: cap Mistral GLOBALE (oggi semaforo process-local, non per-chiamata-LLM) + path LLM inline fuori Inngest (regenerate-section, resolveAnomalies). Scala O(1) davvero illimitata (fan-out per-sezione + tabella `report_sections`) **dietro il re-sync migration** (vedi ADR-022).

## ADR-018: "Mai perdere un fatto" — integrità dell'estrazione eventi
- **Data**: 2026-06-19/23
- **Contesto**: invariante sacro del progetto ("mai perdere un fatto"). Audit: il `catch` di `extractChunkEvents` rilanciava solo i transitori di rete → troncamento output LLM (`finishReason=length`), JSON irrecuperabile, insert DB fallito, pages-not-found, stream vuoto venivano **ingoiati come `{count:0}`** (perdita silenziosa di un intero chunk su doc multi-chunk). Il recupero JSON parziale (jsonrepair L2 / manuale L3) tornava eventi monchi come "successo" senza flag. Il sequence-validator non girava in rigenerazione.
- **Decisione** (`6b0e08d`, `2162174`, `3054043`): `isRetriableExtractionError` (pura, testata) rilancia transitori (+`etimedout/econnrefused/epipe`) **E** errori di INTEGRITÀ → Inngest retry → se persistente la guard a valle marca il doc/avvisa; `maxTokens` estrazione 8192→16384. Il retry-insert di recupero fa **`throw`** (non `return {count:0}`). Il recupero JSON parziale (L2/L3, non parse pulito) flagga gli eventi `requires_verification` + nota + `pipelineWarning` doc-level (aggregato per file). Le route `/regenerate` e `/regenerate-section` passano `{caseType, caseTypes}` a `detectAnomalies` (sequence-validator). Degradazione **graceful** via `Promise.allSettled` (nessun caso prima-ok ora fallisce).
- **Conseguenze**: perdite parziali su doc multi-chunk non più silenziose. Bias verso il retry/flag in caso di dubbio. Validato da panel avversariale (3/3 PASS). Residuo: errori generici/unknown su un singolo chunk multi-chunk restano `{count:0}` (scelta conservativa per non far fallire casi prima-ok).

## ADR-019: GDPR Art.9 — nessun contenuto clinico nei log e negli Error
- **Data**: 2026-06-22/23
- **Contesto**: `sanitizeLogMessage` (`logger.ts`) redige SOLO CF/email/telefono via regex, NON nomi/diagnosi/filename (non regexabili in modo affidabile). Più siti loggavano (o lanciavano in `Error` → Inngest → Sentry) il **body LLM grezzo**, i `message` degli issue di validazione (che includono anteprime di citazioni cliniche), o i **nomi file** (es. "Cartella_Mario_Rossi.pdf"). Dati sanitari = categoria speciale Art.9 (sanzioni fino al 4% del fatturato).
- **Decisione** (`f8f66f7`, `b4ad7f4`): la disciplina sta ai **call-site** (non si può redigere a valle nomi/diagnosi). Mai loggare/lanciare contenuto clinico grezzo. Nuovo `formatIssuesForLog` (tipo×conteggio, MAI il `message`). Chiusi **6 sink** (estrazione, spese, validazione sezionale, throw→Sentry, `finalize` nomi-file, synthesis-service). Export anonimizzato: anche le date ISO ora redatte; token-expansion case-sensitive sui cognomi noti (redige "Costa" il nome, non "costa" la parola); immagini base64 non corrotte dai regex numerici (`imageProtectedRanges`); i log di estrazione = solo conteggi.
- **Conseguenze**: superficie GDPR ridotta nei log/Sentry. Residuo backlog: NER per nomi liberi non presenti nei metadata; CONTEXT_NAME_REGEX da estendere (consulente/medico/perito).

## ADR-020: Grounding delle citazioni verbatim esteso a tutte le sezioni
- **Data**: 2026-06-23
- **Contesto**: la verifica hard delle citazioni vs OCR (`verifyGeneratedQuotes` — annota inline le citazioni non riscontrate, mai cancella) girava SOLO su `documentazione_sanitaria` (caporali «...»). Le altre sezioni verbatim (`documentazione_atti`, `premesse`, `pareri_tecnici`) istruiscono citazioni con virgolette dritte "..." ma **senza grounding** → una citazione fabbricata o ALTERATA (es. una percentuale di invalidità in una conclusione CTP riprodotta) passava inosservata.
- **Decisione** (`d02cdb0`): flag `SectionSpec.verifyQuotes` (true su atti/premesse/pareri; CTP eredita via `buildCTPSections`) + `VerifyQuotesOptions.annotateStraightQuotes` → `verifyGeneratedQuotes` annota inline anche le "..." dritte/curve (oltre alle «...»), soglia `MIN_STRAIGHT_QUOTE_LEN=12` (cattura "INVALIDITÀ 25%"=14). doc-sanitaria invariata (default off: «...» inline + nota di sezione). STRICT: pulita solo su match esatto/normalizzato; un `near` (una parola decisiva alterata) è flaggato.
- **Conseguenze**: una citazione verbatim non riscontrata viene flaggata in TUTTE le sezioni verbatim, non solo doc-sanitaria. Non-bloccante (mai perdere un fatto). Aperto: la sezione Quesiti (fonte = form del perito, non OCR → non verificabile) e le citazioni verbatim multi-riga (limite del regex single-line).

## ADR-021: Perizia RC stragiudiziale "semplice" — riproduzione PER-TIPO di documento (direttiva Lavini)
- **Data**: 2026-06-23
- **Contesto**: Lavini ha dettato (nota manoscritta + 7 decisioni, ancorate ai benchmark reali **MOTTA TERESA** e **Antoniazzi**) come strutturare la perizia RC stragiudiziale: "**PERIZIA SEMPLICE**" = togliere il RUMORE, tenere la SOSTANZA verbatim in ordine cronologico fedele. È un raffinamento oltre ADR-016.
- **Decisione** (scopata a stragiudiziale via flag `SectionSpec.excludeLabTests` come marker RC; CTU/CTP **invariati**):
  - **Documentazione sanitaria per-tipo** (`b9cbf61`, `021f827`): esami **ematochimici/laboratorio ESCLUSI** (filtro deterministico: OCR `documentType=esame_laboratorio` + eventi `eventType=esame_ematochimico` + coverage anti-omissione allineata); **Pronto Soccorso CONDENSATO** a diagnosi+dimissione (con ECCEZIONE "mai perdere un fatto": un reperto/lesione documentato SOLO nel PS va incluso verbatim); cartella clinica / lettere di dimissione / referti RX-strumentali / visite / altri referti = **TESTO FEDELE verbatim** tra «...» (costante `DOC_SANITARIA_RC_RULES` appesa alla direttiva selettiva, "PREVALGONO sulla regola di parafrasi"). Header per documento in grassetto **Tipo, struttura, in data GG.MM.AAAA:**, raggruppamento referti stessa data.
  - **Intestazione** (`4763f00`): rimosso "con il suo consenso" (#2, MOTTA/Antoniazzi non lo scrivono); riga-scopo con ENTRAMBE le formule "valutare le lesioni patite" + "accertarne le conseguenze di ordine temporaneo e permanente" (#3); blocco perito in **TESTO PIANO** senza grassetto/corsivo (#7).
  - **Invariati per scelta di Lavini**: ITT/ITP resta una **TABELLA** (#1); anamnesi, "Il Fatto" e spese restano **deselezionabili** dal perito (#4/#5, già non in MANDATORY_SECTION_IDS).
- **Conseguenze**: l'esclusione lab pulisce anche i `phantom_date` che gonfiavano l'HRS del caso-195. Gold di riferimento (`benchmark/gold/antoniazzi-stragiudiziale.md`) **NON aggiornato** (scelta utente) → `score-pair` mostrerà una divergenza ATTESA finché non lo si aggiorna con Lavini. **I cambi-prompt (PS condensato + verbatim) sono da VALIDARE su output reale** (caso-test `scratchpad/test-rc-colpo-frusta/`) — i test coprono routing/scoping, non lo stile LLM. Residuo stile-LLM da osservare: distinguere "verbale/triage PS" (da condensare, stile MOTTA) da una "consulenza specialistica RESA in PS coi reperti" (che Antoniazzi NON condensa).

## ADR-022: decesso/ITT — tassonomia `event_type 'decesso'` richiesta; euristica substring RIFIUTATA; bloccata da migration
- **Data**: 2026-06-23
- **Contesto**: una degenza FATALE (decesso del periziando in reparto, senza un evento "dimissione" accoppiabile) non viene conteggiata in "Giorni di ricovero" da `medico-legal-calc` (under-count sui casi fatali). Un primo fix euristico (substring "decesso/morte" in `isDischargeEvent`) era già stato revertito per falsi positivi (anamnesi familiare/consenso/prognosi).
- **Decisione**: l'approccio **substring (blocklist + anchor positivo) è RIFIUTATO** dopo 2 round di panel avversariale che l'hanno provato ROTTO in ENTRAMBE le direzioni: falsi negativi da collisione di substring (`'rianimazione'.includes('zio')`, `'periziando'.includes('zia')` → sopprimono decessi REALI del paziente); falsi positivi da anchor d'ambiente ("vicino di letto/altro degente in reparto", "the patient witnessed the death of his neighbour" → contano morti di TERZI). Distinguere il **SOGGETTO** del decesso richiede NLP reale o un **evento TIPIZZATO**: la soluzione corretta è un valore `event_type 'decesso'` nella tassonomia (l'LLM in estrazione distingue il soggetto; il calc si fida del tag, niente substring). `event_type` è un **`pgEnum`** (`db/schema/events.ts`) → aggiungere il valore richiede `ALTER TYPE ... ADD VALUE` = **migration, BLOCCATA** finché il re-sync journal non è eseguito su Supabase (vedi CLAUDE.md).
- **Conseguenze**: under-count originale RIPRISTINATO (revert pulito) — un under-count è meno dannoso di una perizia che asserisce un decesso sbagliato. Da implementare dopo il re-sync. **Nota correlata**: l'ITT di 1954gg @100% del caso-195 NON è un bug silenzioso (esce già col flag "[DA VERIFICARE: supera l'intervallo documentato]"); l'aggressività dell'euristica immobilizzazione (`medico-legal-calc.ts:440-455`, estesa all'ultima menzione di tutore/gesso) è una decisione di dominio → Lavini.

## ADR-023: Ambito temporale degli eventi (`temporal_scope`) — un referto = una voce
- **Data**: 2026-09-04
- **Contesto**: feedback medici 2026-08-19 (Mail 2) riprodotto sugli allegati veri: un referto di visita oncologica fotografato in 3 pagine, anche dopo l'unione in UN documento (migration 0033), veniva esploso in 12 eventi cronologici — la visita del 22.05 più 8 fatti della "storia oncologica" (anamnesi) e un esame programmato — con intestazione-blocco "dal 27.02 al 18.06". Il perito: "è il contenuto di un unico referto". La regola prompt-only "non estrarre i riferimenti retrospettivi" non reggeva (l'eccezione "fonte primaria" la aggirava) e collideva con ADR-018 "mai perdere un fatto".
- **Decisione** (`4852305`, `83a09bf`): da SOPPRIMERE a DICHIARARE. Ogni evento porta `temporalScope` ∈ {`corrente`, `retrospettivo`, `programmato`} deciso dal LLM (schema strict + few-shot; "corrente" = ciò che avviene nell'episodio di cura descritto, anche se raccontato al passato; "retrospettivo" = riferito come già avvenuto prima, con la data riferita; "programmato" = previsto). Cross-check deterministico: data futura → programmato (mai su un retrospettivo); testo "programmato" = solo nota, mai override (un ricovero elettivo "programmato" è avvenuto); anno/mese assente dal testo → data scartata (evento in coda, fatto conservato). Persistenza `events.temporal_scope` (migration 0034, NOT NULL DEFAULT 'corrente' + CHECK, fallback insert se assente). Consumo: intestazione e ordine dei blocchi-documento dalle sole date correnti (fallback a gradini corrente → riferito → programmato); riferiti e programmati come sotto-elenchi nel blocco (HTML, DOCX; senza-data ammessi lì); CRONO e doc-sanitaria etichettano/datano di conseguenza; prompt di sintesi marcati; calcoli (ITT/ITP/ricovero/stima danno, tutti i percorsi UI inclusa) escludono i `programmato` anche a data passata; un `retrospettivo` datato CONTA (fatto reale documentato solo in anamnesi) ma non due volte se la fonte primaria attesta lo stesso fatto; nel consolidamento il corrente vince nel dedup e una menzione non cappa mai la fonte primaria (le discordanze VERE restano escalate). Il perito può correggere l'ambito dalla scheda evento. Default `corrente` = comportamento storico su ogni riga pre-migration.
- **Conseguenze**: sulle 3 foto vere: intestazione "in data 22.05.2026", 5 correnti / 11 riferiti / 6 programmati. Il campo NON elimina mai un evento: pilota la resa e, per i soli programmati, l'aritmetica. Residui dichiarati: un `retrospettivo` a data precisa senza `dataSinistro` compilata entra nei computi come prima (la leva resta la data del sinistro); le note informative di consolidamento non sono persistite (solo le ⚠ raggiungono il prompt); righe legacy flaggate "[AUTO] appuntamento programmato" restano `corrente` finché non rielaborate (nessun backfill: il perito potrebbe averle già verificate).

## ADR-024: Cronistoria documentale — trascrizione per documento e appendice di verifica come deliverable
- **Data**: 2026-09-04
- **Contesto**: valutazione onesta post-feedback (2026-09-04): sui casi dei medici il concorrente consegna "un documento = un blocco verbatim" con intestazione data/tipo/struttura/medico e chiude con una riga "nessuna omissione rilevata" non verificabile; noi consegnavamo la scomposizione in eventi con tag interni ("[FONTE B]", confidenza) come output primario, e le reti anti-errore (verifica citazioni, coda "da verificare", copertura) restavano invisibili al medico. La trascrizione verbatim per documento esisteva già nella perizia RC (`formatDocumentazioneSanitaria`), non nella cronistoria.
- **Decisione** (stesso treno di ADR-023): gli export della cronistoria (HTML e DOCX basic) aggiungono (A) "Trascrizione dei documenti" = `formatDocumentazioneSanitaria` con opzioni nuove `includeFileNames:false` (i nomi file possono contenere il nome del paziente) e `pageFilter:false` (trascrizione integrale, non le sole pagine con reperti come nella perizia); (B) "Appendice di verifica" = `buildVerificationAppendix`, conteggi CALCOLATI e mai dichiarati: documenti ricevuti / trascritti integralmente / parzialmente (copertura dal renderer via `computeTranscriptionCoverage`, stessa regola) / non trascritti con motivo dalla stessa sorgente del renderer (`EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA_REASONS`, test di invariante), pagine lette/senza testo, eventi in cronistoria (riferiti, programmati), senza data, da verificare, esclusi dal perito, documenti trascritti senza eventi, eventi da documenti non trascritti; modalità `spese` per il modulo spese (giustificativi, voci, escluse dal totale). Anonimizzazione ALLA FONTE (`anonymizeDocsForExport` + `anonymizeEventsForExport` prima del rendering) più il passaggio prosa a valle. File uniti (0033): `documentsForExport` esclude un secondario SOLO se non ha più pagine proprie (fail-safe: unione su caso già elaborato non ancora riavviato → i file restano documenti e l'appendice lo dice); la select documenti fallisce rumorosamente se la colonna manca. La cronistoria HTML non risponde più 404 senza eventi se c'è testo letto.
- **Conseguenze**: il medico riceve la forma che usa (trascrizione) e la prova delle reti (appendice) nello stesso file; le reti diventano confrontabili col concorrente. Giro avversariale sull'anonimizzato (script sui moduli reali, 2026-09-04) e relativi fix: le pagine di un documento si anonimizzano in UN passaggio (separatore + fallback per-pagina) così il nome rilevato a pagina 1 propaga alla forma minuscola/invertita di pagina 5 e i placeholder sono coerenti nel documento; medici e strutture degli EVENTI del caso (≥2 token, forma invertita inclusa, valori generici esclusi) sono redatti anche nel corpo OCR (`collectKnownIdentityNames`); `Dr.`/`Dr.ssa` e `Studio/Centro/Poliambulatorio/Laboratorio/Fondazione/IRCCS/AOU/Presidio` entrano nei regex prosa (con `Studio RM/TC/...` escluso come contenuto clinico); un documento con pagine tutte senza testo NON è più "trascritto integralmente" (`withText` nella copertura → non trascritto con motivo, o parziale con conteggio). Residui dichiarati: le immagini nel testo OCR restano rimosse senza marcatore nel verbatim (scelta: niente rumore nella perizia depositabile); una riga OCR che inizia con `*[` può essere letta come blocco-placeholder dai parser markdown (raro); i cognomi SINGOLI di medici senza titolo nel corpo OCR restano affidati ai regex prosa (redigerli case-insensitive corromperebbe parole comuni); la numerazione dei placeholder riparte da [DATA_1]/[PERSONA_1] a ogni DOCUMENTO (coerente entro il documento, non tra documenti — come nel DOCX della perizia); per il modulo spese l'appendice non elenca i motivi di esclusione per documento.

## ADR-025: Documentazione sanitaria "passaggi-chiave per rubrica" — copiata dal codice, non scritta dal modello

- **Data**: 2026-09-04
- **Contesto**: tre misure sui casi gold nello stesso giorno (panel `confronto-rc-gold`, rubrica v1): trascrizione LLM 72/45/40 sugli eventi di giugno, 67/47/37 sui casi riprocessati da zero con l'estrazione nuova, 57/54/39 con una doc-sanitaria deterministica costruita dalle ancore ≤200 caratteri degli eventi. I gate sono 90/85/80. Lettura onesta: né la trascrizione integrale (direttiva 21/07) né le ancore degli eventi sono l'unità giusta. Il gold del perito è una recensione selettiva: per ogni documento i PASSAGGI-CHIAVE del medico (anamnesi prossima, esame obiettivo, diagnosi, conclusioni, prognosi, indicazioni, intervento, dimissione) copiati per intero, una volta, senza rumore (triage, parametri, laboratorio, consensi, checklist); l'epicrisi è corta. Un modello generativo parafrasa per natura: chiedergli la fotocopia e correggerlo a valle (aggancio citazioni, verificatore, stripper) è il difetto di progetto.
- **Decisione**: nuova modalità `docSanitariaMode: 'rubriche'` (`src/services/synthesis/doc-rubriche/`): (1) `rubric-parser` segmenta il testo OCR di ogni documento nelle rubriche del medico (vocabolario tollerante all'OCR: maiuscole, "Diagnosi: …" inline, "Si consiglia …", titoli d'esame "RX …", tabelle HTML/markdown → testo; le intestazioni-carta non sono rubriche); (2) `rubric-policy` dice per tipo di documento cosa si copia, cosa si omette e il tetto per rubrica (default = nostra lettura dei gold; policy JSON sovrascrivibile senza codice; laboratorio e spese esclusi; certificati in una riga aggregata); (3) `rubric-renderer` produce un blocco per documento in ordine cronologico, intestazione dai metadati (`block-header`, UNA implementazione condivisa col prompt LLM), rubriche copiate verbatim tra «...» nell'ordine del documento, dedup dei passaggi identici già riprodotti (PS ↔ cartella ↔ lettera di dimissione), taglio su frase con "[...]" oltre il tetto; invariante "un documento clinico = un blocco" (fallback al corpo o riga di rimando, mai un documento perso). Zero LLM nella sezione. Come 'integrale' è un placeholder deterministico espanso a lettura su tutti i punti (viewer, confronto versioni, export HTML/DOCX, link pubblico, validazione), quindi vale anche per i report già generati. Selettore nello step Elaborazione (salvato con `updateDocSanitariaMode`, preservato dal form perizia). Pulizia: stesso `sanitizeVerbatimOcr` dell'integrale + recapiti omessi.
- **Conseguenze**: la sezione non può più inventare, parafrasare, spostare date o riprodurre tre volte lo stesso episodio; ciò che resta da decidere è di dominio (quali rubriche per tipo: la specifica per Lavini è `scratchpad/spec-doc-sanitaria-lavini-2026-09-04.md`) e si cambia nella policy, non nel codice. Misure del 2026-09-04 (panel, rubrica v1; gate 90/85/80): trascrizione LLM 67/47/37 → rubriche v1 60/40/40 → rubriche v2 (regole della specifica) 61/**59**/**43** (miglior B e C mai misurati) → v3 in misura. Il default resta 'selettiva' finché 'rubriche' non batte il LLM anche sul caso semplice; poi diventa il default RC previa conferma di Lavini sulla specifica. Residui dichiarati: il parser riconosce solo rubriche del vocabolario (documenti senza rubriche → corpo intero o rimando); i diari di degenza lunghi non sono condensati per giorno; i nomi del personale sanitario restano nel verbatim (come nei gold); la selezione dei passaggi entro una rubrica non esiste (o tutta o niente, con tetto).
