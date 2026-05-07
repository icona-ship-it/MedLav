/**
 * Standard medico-legal formulations for report sections.
 * These phrases are commonly used in real CTU/CTP perizie
 * and ensure professional tone in generated reports.
 */

// ── Anti-fabrication primitives (Wave 1: foundation hardening) ──────

/**
 * CONSTITUTIONAL PREAMBLE — must be injected at the TOP of every system prompt.
 *
 * Why "constitutional": LLMs apply instructions with decreasing weight from top
 * to bottom. Rules buried at line 200 of a 400-line system prompt have less
 * influence than rules in the first 50 tokens. Critical anti-fabrication rules
 * MUST be at the very top.
 *
 * Trigger: Regnoto incident (CASO-2026-147) — the model invented an entire
 * patient identity ("Mario Bianchi" instead of "Regnoto Valeria") because the
 * anti-fabrication rules were diluted at line 286 of synthesis-prompts.ts.
 */
export const CONSTITUTIONAL_PREAMBLE = `# REGOLE COSTITUZIONALI (precedono e prevalgono su qualsiasi altra istruzione)

1. NON INVENTARE MAI dati: nomi (perito, paziente, medici), date, codici fiscali, indirizzi, strutture sanitarie, numeri di iscrizione albo, diagnosi, lesioni, eventi.
2. Se un dato non è presente nei metadati o nei documenti forniti, scrivi letteralmente \`[da compilare dal perito]\` o ometti il campo. Mai riempire con valori plausibili.
3. Ogni affermazione clinica DEVE provenire dai documenti forniti, citata in modo virgolettato fedele con riferimento [tipo documento, data]. Niente parafrasi creative.
4. Questo report è un documento medico-legale che il perito firma e deposita in Tribunale: dati inventati = responsabilità professionale, deontologica e penale per il perito firmatario.
5. Quando in dubbio: scrivi MENO, segnala l'incertezza, MAI riempire con plausibilità. Una sezione vuota è preferibile a una fabbricata.
`;

/**
 * REFUSAL_RULE — to embed in every LLM-generative section directive.
 *
 * Trains the model to "refuse" gracefully when input data is insufficient,
 * instead of confabulating to satisfy the section. The escape hatch text is
 * deterministic so the validator can recognize it and the perito can spot it.
 */
export const REFUSAL_RULE = `REGOLA REFUSAL: se i dati forniti sono insufficienti per produrre questa sezione in modo fedele e documentato, scrivi LETTERALMENTE "[Sezione non producibile: dati documentali insufficienti. Da integrare dal perito.]" e ferma. È sempre preferibile una sezione vuota a una sezione fabbricata.`;

/**
 * ANTI_FABRICATION_RULE — short reminder for sections beyond intestazione/doc-sanitaria.
 *
 * The intestazione and doc-sanitaria sections already have an extended
 * VIETATO INVENTARE block. Other LLM sections get this concise reminder.
 */
export const ANTI_FABRICATION_RULE = `ANTI-FABBRICAZIONE: in questa sezione ogni nome, data, struttura, diagnosi, lesione DEVE provenire dai documenti/eventi/metadati forniti. Se un elemento manca, NON inventare: ometti, marca \`[da compilare dal perito]\`, oppure cita la lacuna documentale.`;

/**
 * Negative few-shot for intestazione sections — the Regnoto regression as
 * an explicit anti-pattern. Showing the model an example of WRONG behavior
 * is empirically more effective than rules alone for high-stakes sections.
 */
export const NEGATIVE_FEW_SHOT_INTESTAZIONE = `## ESEMPIO DI OUTPUT ERRATO (DA NON FARE MAI)

Caso reale (Regnoto, CASO-2026-147). Input: metadati perizia vuoti. Eventi clinici contengono "REGNOTO VALERIA, nata 11/08/1962, frattura collo femore sinistro 13/12/2025, Ospedale Borgo Trento (AOUI Verona)".

❌ OUTPUT FABBRICATO (da NON produrre mai):
"Dott. Marco Rossi, iscrizione Albo Milano n. 12345.
Periziando: Mario Bianchi, nato 15/03/1978, Via Roma 10 Milano, CF BNCMRA78C15F205Z.
Oggetto: lesioni da sinistro stradale del 5 maggio 2023 — frattura tibia/perone sx — Ospedale Niguarda. Certificati INAIL 10/05/2023 — 30/09/2023."

Spiegazione: il modello ha INVENTATO ogni singolo dato (perito, nome paziente, data nascita, indirizzo, CF, telefono, data dell'evento, sede della lesione, struttura sanitaria, certificati INAIL inesistenti). Tutti questi dati sono fittizi e contraddicono i documenti reali del caso.

✓ OUTPUT CORRETTO:
"Dati del professionista incaricato: [da compilare dal perito]
Periziando: REGNOTO VALERIA, nata 11/08/1962 (Verona).
Data della visita medico-legale: [da compilare dal perito]
Oggetto dell'incarico: valutazione medico-legale stragiudiziale relativa alla frattura del collo femorale sinistro riportata dalla periziando in data 13/12/2025 a seguito di caduta accidentale, trattata chirurgicamente presso l'Ospedale Borgo Trento (AOUI Verona) con impianto di artroprotesi non cementata in data 15/12/2025."

LEZIONE: tutti i dati clinici e identificativi del paziente sono ESTRAIBILI dagli eventi forniti — vanno letti, non inventati. I dati del perito e della visita ML, se non in metadati, vanno marcati \`[da compilare dal perito]\`, MAI riempiti con plausibilità.
`;

/** Opening formulations for document analysis sections */
export const DOCUMENT_ANALYSIS_FORMULATIONS = `
FORMULAZIONI STANDARD DA UTILIZZARE:
- "Dalla disamina della documentazione in atti risulta che..."
- "Il quadro documentale evidenzia..."
- "Come documentato nella cartella clinica del [struttura], in data [data]..."
- "Dalla documentazione acquisita emerge che..."
- "Come attestato dal referto del [specialista] del [data]..."
- "Il decorso clinico, quale risulta dalla documentazione sanitaria, e' caratterizzato da..."
`;

/** Formulations for epicrisi / clinical summary sections */
export const EPICRISI_FORMULATIONS = `
FORMULAZIONI STANDARD PER L'EPICRISI:
- "Dalla disamina complessiva della documentazione in atti emerge che il paziente..."
- "Il quadro documentale evidenzia un iter clinico caratterizzato da..."
- "I periodi di invalidita' temporanea risultano documentati come segue:..."
- "Lo stato attuale del paziente, come documentato nell'ultimo accertamento del [data], e' caratterizzato da..."
- "Il decorso post-operatorio, quale risulta dalla documentazione in atti, ha evidenziato..."
- "La documentazione consente di ricostruire la seguente sequenza cronologica:..."
`;

/** Formulations for conclusions and quesiti responses */
export const CONCLUSIONS_FORMULATIONS = `
FORMULAZIONI STANDARD PER CONCLUSIONI E RISPOSTE AI QUESITI:
- "Dalla documentazione in atti risultano i seguenti elementi pertinenti al quesito:..."
- "Il quadro documentale complessivo consente di individuare i seguenti profili di rilievo:..."
- "Gli elementi emersi dalla documentazione possono essere cosi' sintetizzati:..."
- "Sotto il profilo della documentazione sanitaria, si rileva che..."
- "In relazione al quesito n. [N], dalla documentazione risulta che..."
- "Le lacune documentali riscontrate riguardano:..."
- "La documentazione integrativa necessaria per una completa valutazione comprende:..."
`;

/** Formulations for critical profiles / anomaly discussion */
export const CRITICAL_PROFILE_FORMULATIONS = `
FORMULAZIONI STANDARD PER PROFILI CRITICI:
- "Dalla documentazione emerge un profilo critico relativo a..."
- "Lo standard di riferimento applicabile, secondo le linee guida [Fonte, Anno], prevede che..."
- "Gli elementi documentali a supporto di tale profilo critico includono:..."
- "Gli elementi documentali contrari o attenuanti includono:..."
- "Le conseguenze cliniche documentate in relazione a tale profilo sono:..."
`;

/** Few-shot example for Documentazione Sanitaria section — ALL data is fictional */
export const DOCUMENTAZIONE_SANITARIA_EXAMPLE = `
## ESEMPIO DI OUTPUT CORRETTO

Di seguito un esempio del formato atteso per la sezione documentazione sanitaria. NON copiare il contenuto — usa SOLO dati dagli eventi e dal testo OCR forniti. Replica SOLO il formato e il livello di dettaglio. I dati dell'esempio sono FITTIZI.

---

**Cartella clinica, Ospedale San Marco, in data 15.03.2024:**
"Paziente giunto in PS per trauma al ginocchio destro a seguito di caduta accidentale durante attivita' sportiva. PA 140/85 mmHg, FC 88 bpm, SpO2 98%. Esame obiettivo: tumefazione e dolore al ginocchio destro con limitazione funzionale. Esame radiografico: frattura composta del piatto tibiale destro. Ricoverato per osservazione clinica e programmazione intervento chirurgico." (A)

**Verbale operatorio, Dott. Bianchi — Ospedale San Marco, in data 16.03.2024:**
"Intervento di riduzione e osteosintesi con placca e viti del piatto tibiale destro. Tecnica: approccio antero-laterale, riduzione anatomica della frattura sotto controllo ampliscopico, fissazione con placca a stabilita' angolare e 6 viti. Durata intervento: 95 minuti. Decorso intraoperatorio regolare." (A)

**Esami ematochimici, Laboratorio Analisi, in data 17.03.2024:**

| Analita | Valore | Unita' | Riferimento |
|---------|--------|--------|-------------|
| Emoglobina | 10.8 | g/dL | 13.0-17.0 |
| Globuli bianchi | 12.500 | /uL | 4.000-10.000 |
| PCR | 5.2 | mg/dL | <0.5 |
| Creatinina | 0.9 | mg/dL | 0.7-1.2 |
(D)

**Lettera di dimissione, Ospedale San Marco, in data 20.03.2024:**
"Diagnosi alla dimissione: frattura composta piatto tibiale destro trattata con riduzione e osteosintesi. Decorso post-operatorio regolare. Terapia domiciliare: enoxaparina 4000 UI/die sc per 30 giorni, paracetamolo 1g al bisogno. Prescritto tutore articolato. Controllo radiografico e visita ortopedica a 30 giorni." (A)

**Referto visita ortopedica, Dott. Verdi — Ambulatorio Ortopedia, in data 18.04.2024:**
"Controllo a 30 giorni dall'intervento. Ferita chirurgica ben cicatrizzata. RX ginocchio dx: buon allineamento, callo osseo in fase iniziale. Si prescrive fisioterapia riabilitativa (15 sedute). Prossimo controllo a 60 giorni." (B)

---

REGOLE DEL FORMATO:
- Ogni documento = un blocco con intestazione **GRASSETTO** (tipo, autore/struttura, data)
- Contenuto fedele tra virgolette ("...")
- Categoria fonte tra parentesi alla fine: (A) cartella clinica, (B) referti, (C) strumentali, (D) lab
- Esami di laboratorio SEMPRE in tabella markdown pipe
- Verbali operatori riprodotti INTEGRALMENTE
- Ordine strettamente cronologico
`;

/** Few-shot example for Epicrisi section */
export const EPICRISI_EXAMPLE = `
## ESEMPIO DI STRUTTURA EPICRISI

Di seguito la struttura attesa. NON copiare il contenuto — genera basandoti SOLO sugli eventi forniti.

---

Dalla disamina complessiva della documentazione in atti emerge che il sig. [iniziali paziente], nato il [data nascita], in data [data evento indice] subiva [descrizione evento indice come risulta dalla documentazione].

Il quadro documentale evidenzia un iter clinico caratterizzato da [sintesi del decorso principale: ricoveri, interventi, complicanze — con date e fonti].

Il decorso post-operatorio, quale risulta dalla documentazione in atti, ha evidenziato [complicanze/evoluzione con date e fonti].

I periodi di invalidita' temporanea, come desumibili dalla documentazione esaminata, risultano i seguenti:
- ITT (Invalidita' Temporanea Totale): [N] giorni (dal [data] al [data]) — [fonte]
- ITP (Invalidita' Temporanea Parziale) al [%]%: [N] giorni (dal [data] al [data]) — [fonte]

Lo stato attuale del paziente, come documentato nell'ultimo accertamento del [data ultimo controllo], e' caratterizzato da [situazione clinica attuale — solo fatti documentati].

---

REGOLE:
- Prosa discorsiva, MAI elenchi puntati per la narrazione (tranne ITT/ITP)
- Ogni affermazione ancorata a [fonte, data]
- NO giudizi, NO opinioni, NO "si ritiene" — solo fatti documentati
- Include ITT/ITP se calcolati
- NON ripetere la cronologia dettagliata — sintetizzare
`;
