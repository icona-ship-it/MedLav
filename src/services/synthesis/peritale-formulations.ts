/**
 * Standard medico-legal formulations for report sections.
 * These phrases are commonly used in real CTU/CTP perizie
 * and ensure professional tone in generated reports.
 */

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
