# Audit LegMed — Punto di Vista del Perito Medico-Legale

## Overview

Analisi completa dell'app dal punto di vista di un medico legale che la usa ogni giorno. Tre categorie: (A) Cose che non funzionano correttamente, (B) Cose da migliorare, (C) Cose che mancano. Prioritizzate per impatto reale sul lavoro del perito.

---

## A — COSE CHE NON FUNZIONANO (Bug e Problemi di Qualità)

### A1. CRITICO — Il diario clinico perde dati routinari importanti
**File**: `src/services/extraction/extraction-prompts.ts`
**Problema**: Il prompt di estrazione dice al LLM di estrarre dal diario clinico "SOLO eventi avversi, complicanze, peggioramenti" e NON la routine quotidiana. Ma in un caso di malasanità, la catena probatoria vive proprio nelle annotazioni "routine" — parametri vitali stabili che poi peggiorano, somministrazioni farmacologiche effettive vs prescritte, bilancio idrico, ispezioni ferite.
**Impatto perito**: In un caso di failure to escalate, il perito non vede i dati che provano il ritardo nell'intervenire.
**Fix**: Rimuovere il filtro "solo eventi avversi" dal diario clinico. Estrarre TUTTO, anche la routine, lasciando al perito il giudizio su cosa è rilevante.

### A2. CRITICO — I calcoli ITT/ITP non hanno percentuali graduate
**File**: `src/services/calculations/medico-legal-calc.ts`
**Problema**: Il sistema calcola solo i giorni totali ITT e ITP, senza le percentuali graduate (75%, 50%, 25%). La perizia reale del Dott. Lavini dice: "ITT 75% di 28 gg, ITP 50% di 7 gg, ITP 25% di 30 gg". LegMed produce solo "ITT: 28 giorni, ITP: 37 giorni".
**Impatto perito**: Il calcolo è inutilizzabile nella forma attuale — il perito deve ricalcolare tutto a mano.
**Fix**: Implementare la logica di graduazione ITP basata sui periodi documentati (ricovero → immobilizzazione → riabilitazione → stabilizzazione) con percentuali standard 75/50/25.

### A3. CRITICO — Il validatore del report non blocca mai il salvataggio
**File**: `src/services/synthesis/report-validator.ts`
**Problema**: Il validatore rileva errori (sezioni mancanti, date fantasma, copertura eventi bassa) ma non blocca MAI il salvataggio del report. Un report senza la sezione "Documentazione sanitaria" viene salvato e presentato al perito come se fosse completo.
**Impatto perito**: Il perito potrebbe non accorgersi che il report è incompleto e usarlo come base per la sua relazione.
**Fix**: Bloccare il salvataggio per errori critici (sezioni obbligatorie mancanti, report vuoto). I warning restano non bloccanti.

### A4. ALTO — Lo spezzettamento in chunk da 15 pagine taglia i documenti a metà
**File**: `src/inngest/steps/extract-events.ts`
**Problema**: I documenti vengono divisi in blocchi da 15 pagine senza overlap. Una lettera di dimissione che va da pagina 14 a pagina 17 viene tagliata: la prima metà in un chunk, la seconda nell'altro. Il LLM non può ricostruire il contesto completo.
**Impatto perito**: Referti, descrizioni operatorie e tabelle di esami vengono troncati e ricostruiti in modo frammentario.
**Fix**: Aggiungere overlap di 2-3 pagine tra chunk consecutivi. Già previsto nel codice (`OVERLAP_PAGES`) ma commentato/non attivo.

### A5. ALTO — La deduplicazione elimina eventi legittimi dello stesso giorno
**File**: `src/services/consolidation/event-consolidator.ts`
**Problema**: Due ECG o due prelievi dello stesso giorno (es. mattina e pomeriggio post-intervento) vengono mergiati come duplicati perché hanno stesso tipo + stessa data + titolo simile. La seconda rilevazione viene scartata silenziosamente.
**Impatto perito**: Dati clinici critici vengono persi senza traccia. Il perito non sa che un esame è stato eliminato.
**Fix**: Aggiungere `discrepancyNote` quando un evento viene considerato duplicato ma ha contenuto diverso. Ridurre la soglia Jaccard o aggiungere confronto orario se disponibile.

### A6. ALTO — Abbreviazioni mediche ignorate nella deduplicazione
**File**: `src/services/consolidation/event-consolidator.ts`
**Problema**: Il calcolo di similarità Jaccard esclude parole di ≤3 caratteri. Ma le abbreviazioni mediche italiane sono quasi tutte ≤3 caratteri: TAC, ECG, RMN, PCR, INR, PTT, TSH, FT3, FT4, PET, EEG, EMG. Due eventi "TAC torace" e "TAC addome" potrebbero essere incorrettamente mergiati.
**Fix**: Mantenere le abbreviazioni mediche note nel calcolo di similarità.

### A7. ALTO — Il map-reduce perde il 93% del contenuto per casi grandi
**File**: `src/services/synthesis/document-summarizer.ts`
**Problema**: Per casi con 10+ documenti, ogni documento viene riassunto da 30.000 a 2.000 caratteri (93% di perdita). Le ultime pagine (spesso dimissione, ultime analisi, terapia domiciliare) vengono tagliate dal cap a 30.000 caratteri.
**Impatto perito**: In casi complessi con molti documenti, il report perde dettagli critici delle ultime pagine di ogni documento.
**Fix**: Aumentare il budget di riassunto a 4.000 chars per documento. Per le ultime pagine (dimissione/terapia domiciliare), dare priorità nell'inclusione.

---

## B — COSE DA MIGLIORARE

### B1. ALTO — Nessun download PDF diretto
**File**: `src/app/(dashboard)/cases/[id]/report-action-bar.tsx`
**Problema**: "Stampa PDF" apre il dialogo di stampa del browser. Il perito deve fare 3 click: pulsante → nuova tab → salva come PDF. Non c'è un download diretto del PDF.
**Impatto perito**: Frustrante per chi deve inviare PDF via email più volte al giorno.
**Fix**: Generazione PDF server-side (es. con Puppeteer o wkhtmltopdf) con download diretto.

### B2. ALTO — "Approva e finalizza" nascosto nel menu overflow
**File**: `src/app/(dashboard)/cases/[id]/report-action-bar.tsx`
**Problema**: L'azione più importante del workflow (marcare il report come definitivo prima del deposito) è nascosta nel menu a tre puntini. Dovrebbe essere un pulsante primario visibile.
**Fix**: Spostare "Approva e finalizza" come pulsante primario nella barra azioni.

### B3. ALTO — Errori upload mostrati in inglese tecnico
**File**: `src/app/(dashboard)/cases/[id]/file-upload.tsx`
**Problema**: Gli errori di Supabase Storage vengono mostrati al perito in inglese tecnico ("row-level security policy violation"). La funzione `toUserMessage()` non viene applicata qui.
**Fix**: Applicare `toUserMessage()` a tutti i messaggi di errore nell'upload.

### B4. ALTO — Nessuna notifica reale al completamento
**File**: `src/app/(dashboard)/cases/[id]/processing-section.tsx`
**Problema**: L'interfaccia dice "Riceverai una notifica quando sarà pronta" ma non c'è alcun meccanismo di notifica in-app. L'email viene inviata (Resend), ma la promessa nell'UI si riferisce a una notifica che non esiste.
**Fix**: Aggiungere una notifica browser (Web Push) o almeno un badge/contatore nella navbar.

### B5. MEDIO — DOCX non rispetta i requisiti formali dei tribunali
**File**: `src/services/export/docx-export.ts`
**Problema**: I tribunali italiani richiedono: interlinea 1.5, font Times New Roman 12pt, interruzioni di pagina tra sezioni principali. Il DOCX attuale non rispetta questi requisiti.
**Impatto perito**: Il perito deve riformattare manualmente il DOCX prima del deposito.
**Fix**: Aggiungere opzioni di formattazione DOCX (font, interlinea, page break tra sezioni).

### B6. MEDIO — Nessuna anteprima A4 durante la modifica
**File**: `src/app/(dashboard)/cases/[id]/report-tab.tsx`
**Problema**: Quando il perito modifica il report nell'editor, non può vedere come apparirà stampato. Deve salvare, chiudere l'editor, e guardare il viewer A4.
**Fix**: Split view editor/preview A4 in tempo reale.

### B7. MEDIO — Stima tempo elaborazione sempre "pochi minuti"
**File**: `src/app/(dashboard)/cases/[id]/processing-section.tsx`
**Problema**: Indipendentemente dal numero di documenti caricati, il messaggio dice sempre "Di solito pochi minuti". Con 30 documenti grandi, il perito aspetta 15-20 minuti senza sapere quanto manca.
**Fix**: Stima dinamica basata su numero di documenti e pagine (es. "~2 min per documento").

### B8. MEDIO — Lista documenti nascosta durante upload
**File**: `src/app/(dashboard)/cases/[id]/documents-section.tsx`
**Problema**: Mentre un nuovo upload è in corso, la lista dei documenti già caricati sparisce. Il perito pensa di aver perso i file precedenti.
**Fix**: Mantenere visibile la lista documenti esistenti durante l'upload di nuovi file.

### B9. MEDIO — Limite 30 documenti visibili nella lista
**File**: `src/app/(dashboard)/cases/[id]/documents-section.tsx`
**Problema**: Oltre 30 documenti, appare solo "...e altri N documenti" senza modo di vederli o gestirli.
**Fix**: Paginazione o lista scrollabile completa.

---

## C — COSE CHE MANCANO

### C1. CRITICO — Dati paziente completi (nome, indirizzo, CF)
**Impatto**: La perizia reale include nome completo, indirizzo, codice fiscale. LegMed ha solo le iniziali. Senza questi dati, il report non può essere usato come base per la perizia formale.
**Fix**: Aggiungere campi opzionali nel form perizia: nome completo, indirizzo, CF, data di nascita. Questi dati appaiono solo nel report e nell'export, mai nei log.

### C2. ALTO — Calcoli ITT/ITP editabili da UI
**Impatto**: Quando il sistema calcola date errate (es. estrae una data sbagliata dall'OCR), il perito non può correggere il calcolo senza modificare manualmente il report. Dovrebbe poter cambiare le date e ricalcolare.
**Fix**: UI per editare date inizio/fine ITT/ITP e ricalcolare automaticamente.

### C3. ALTO — Diff colorata tra versioni report
**Impatto**: Quando il perito rigenera una sezione, non può vedere cosa è cambiato. Deve confrontare visivamente le due versioni.
**Fix**: Implementare diff parola-per-parola stile "tracked changes" di Word.

### C4. ALTO — Toggle "Verificato" visibile su ogni evento
**Impatto**: Il perito deve verificare decine di eventi. Attualmente deve aprire il form di modifica completo per ogni evento per cambiare il flag. Serve un toggle rapido.
**Fix**: Aggiungere checkbox/toggle visibile direttamente nell'EventCard.

### C5. ALTO — Filtro eventi per data e medico/struttura
**Impatto**: Con 200+ eventi, trovare quelli di un certo periodo o medico è impossibile senza scrollare tutto.
**Fix**: Aggiungere filtri: range date (da/a), medico, struttura, confidenza.

### C6. ALTO — Intestazione studio nei DOCX
**Impatto**: Ogni perito vuole il proprio logo, indirizzo e recapiti nell'intestazione del DOCX/HTML. Attualmente mancano.
**Fix**: Nelle Settings, aggiungere campi per logo, indirizzo, telefono, email, PEC. Usarli nell'header dell'export.

### C7. MEDIO — Statistiche personali del perito
**Impatto**: Il perito vuole sapere quanti casi ha gestito, tempo medio, stato dei casi. Queste statistiche esistono nell'admin ma non sono visibili all'utente finale.
**Fix**: Dashboard personale con: casi totali/mese, tempo medio elaborazione, distribuzione per modulo.

### C8. MEDIO — Paginazione lista casi
**Impatto**: Con 100+ casi la dashboard diventa inutilizzabile.
**Fix**: Paginazione server-side con 20 casi per pagina.

### C9. MEDIO — Condivisione collaborativa CTP ↔ CTU
**Impatto**: CTU e CTP lavorano sullo stesso procedimento. La condivisione attuale è solo un link di lettura. Non c'è modo di commentare, annotare, o discutere.
**Fix**: Invito collaboratore registrato con ruolo lettura/commento.

### C10. MEDIO — Aggiunta immagini esterne al report
**Impatto**: Il perito scatta foto durante la visita (esame obiettivo) o ha radiografie su PACS. Non può inserirle nel report LegMed.
**Fix**: Upload immagini nel report editor con drag-and-drop.

### C11. MEDIO — "Il Fatto" come narrativa separata
**Impatto**: Nella perizia reale, "Il Fatto" è una narrazione pura dell'incidente, separata dalla storia clinica. LegMed lo fonde con la cronistoria.
**Fix**: Aggiungere una sezione "Il Fatto" dedicata nel template stragiudiziale, con prompt focalizzato sulla dinamica dell'evento.

### C12. BASSO — Firma elettronica qualificata
**Impatto**: La "firma digitale" attuale è solo un'immagine PNG. Per depositi in tribunale serve firma elettronica qualificata (PAdES/CAdES). Almeno un disclaimer chiaro.
**Fix**: Disclaimer che la firma è solo visiva + piano futuro per integrazione con certificato qualificato.

### C13. BASSO — Template riutilizzabili per tipo caso
**Impatto**: Se un perito fa sempre le stesse perizie (es. RC Auto con gli stessi quesiti), deve reinserire tutto ogni volta.
**Fix**: Salvare template con quesiti precompilati, intestazione, struttura report.

### C14. BASSO — Import da altro sistema
**Impatto**: Chi migra da Docsy non può portare i suoi casi.
**Fix**: Import CSV/JSON strutturato con mapping campi.

---

## PRIORITÀ DI IMPLEMENTAZIONE

### Sprint 1 — Fix bloccanti (il perito non può usare l'app se questi non funzionano)
1. **A2** — ITT/ITP graduate con percentuali 75/50/25
2. **A1** — Rimuovere filtro "solo eventi avversi" dal diario clinico
3. **A3** — Validatore blocca salvataggio per errori critici
4. **C1** — Dati paziente completi nel form perizia

### Sprint 2 — Qualità output (il report deve essere usabile senza riscriverlo)
5. **A4** — Overlap pagine tra chunk
6. **A5** — Fix deduplicazione eventi stesso giorno
7. **B5** — DOCX con Times New Roman 12pt, interlinea 1.5, page break
8. **C6** — Intestazione studio nei DOCX

### Sprint 3 — UX essenziale (il perito deve poter lavorare efficientemente)
9. **C4** — Toggle "Verificato" su EventCard
10. **C5** — Filtro eventi per data/medico/struttura
11. **B1** — Download PDF diretto
12. **B2** — "Approva e finalizza" visibile
13. **C2** — Calcoli ITT/ITP editabili da UI

### Sprint 4 — Differenziazione (vantaggi competitivi vs Docsy)
14. **C3** — Diff colorata versioni report
15. **C7** — Statistiche personali perito
16. **C8** — Paginazione lista casi
17. **B3** — Errori upload in italiano
18. **B4** — Notifica reale al completamento

### Sprint 5 — Polish e feature avanzate
19. **C9** — Condivisione collaborativa
20. **C10** — Immagini esterne nel report
21. **C11** — "Il Fatto" come sezione separata
22. **C13** — Template riutilizzabili
23. **A7** — Map-reduce con meno perdita di contenuto

---

## Note per la discussione con i periti

Mostrare questo documento ai periti chiedendo:
1. **Quali di questi problemi avete riscontrato?** (conferma priorità)
2. **Cosa manca che non abbiamo elencato?** (discovery)
3. **Quale sarebbe il primo fix che vi farebbe usare l'app più spesso?** (priorità reale)
