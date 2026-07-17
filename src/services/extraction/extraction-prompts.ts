import type { CaseType } from '@/types';

const SOURCE_RULES = `
## REGOLE DI ESTRAZIONE PER TIPO DI FONTE

### FONTE A - CARTELLA CLINICA
Estrarre e riportare:
- A.1 Dati di Ingresso: diagnosi di ingresso completa, peso, altezza, parametri vitali (PA, FC, SpO2, temperatura), data e ora ricovero
- A.2 Esami Ematochimici: TUTTI gli esami del sangue, valori numerici con unità di misura, valori fuori range evidenziati, data prelievo
- A.3 Anamnesi e Terapie: anamnesi patologica, tutte le terapie farmacologiche (farmaco, dosaggio, via, frequenza), modifiche terapeutiche, trasfusioni
- A.4 Descrizione Operatoria: testo INTEGRALE della descrizione chirurgica, tipo intervento, operatori, tecnica, tempi operatori (durata, orario), reperti, complicanze, tipo anestesia
- A.5 Cartella Anestesiologica: valutazione preop (ASA score), tipo anestesia, farmaci, parametri vitali intraop, complicanze
- A.6 Diario Medico/Infermieristico: riporta l'INTERO decorso clinico, non solo gli eventi avversi. RAGGRUPPA i periodi clinicamente stabili in UN unico evento "decorso" che indica l'arco di giorni e cosa resta invariato (es. "Decorso post-operatorio gg 2-5: paziente stabile, parametri vitali nella norma, terapia invariata, medicazioni regolari, apiretico"). Crea invece eventi SEPARATI per OGNI variazione rilevante: complicanze, peggioramenti o miglioramenti, comparsa di febbre, modifiche terapeutiche, prima mobilizzazione/deambulazione, consulenze, allarmi, variazioni dei parametri vitali. La routine clinica documentata serve a ricostruire la catena probatoria: NON scartarla. Escludere SOLO le annotazioni puramente logistiche (pasti, igiene personale, posizionamento)
- A.7 Lettera di Dimissione: diagnosi dimissione completa, condizioni alla dimissione, terapia domiciliare, follow-up, prognosi

### FONTE B - REFERTI CONTROLLI MEDICI
Riportare INTEGRALMENTE: visite specialistiche, follow-up post-op, visite ambulatoriali, certificati medici, relazioni di parte, visite medico-legali.
Per ogni referto: data, specialista, contenuto COMPLETO, conclusioni.

### FONTE C - REFERTI RADIOLOGICI ED ESAMI STRUMENTALI
Riportare INTEGRALMENTE: RX, TAC/TC, RM, ecografie, ECG, scintigrafie, angiografie, PET, EMG, endoscopie, biopsie/istologia.
Per ogni esame: data, tipo esame, distretto esaminato, descrizione completa, conclusioni diagnostiche.

### FONTE D - ESAMI EMATOCHIMICI
Riportare TUTTI gli esami laboratorio: emocromo, biochimica, coagulazione, markers, colturali, urine, gas analisi.
Per ogni esame: data, TUTTI i valori numerici con unità di misura, valori fuori range evidenziati.
`;

export const CASE_TYPE_GUIDANCE: Record<CaseType, string> = {
  ortopedica: `FOCUS ORTOPEDICO: Presta particolare attenzione a:
- Interventi chirurgici ortopedici (dettagli tecnici, tempi operatori, materiali/protesi)
- Complicanze post-operatorie (infezioni, mobilizzazione protesi, pseudoartrosi)
- Imaging pre e post operatorio (RX, TC, RM)
- Tempi di recupero e follow-up ortopedico
- Fisioterapia e riabilitazione`,

  oncologica: `FOCUS ONCOLOGICO: Presta particolare attenzione a:
- Date delle prime visite e sospetto diagnostico
- Tempi tra sospetto e diagnosi definitiva (potenziale ritardo diagnostico)
- Staging e grading tumorale
- Markers tumorali e loro evoluzione
- Protocolli terapeutici (chemio, radio, chirurgia)
- Biopsie e referti istologici`,

  ostetrica: `FOCUS OSTETRICO: Presta particolare attenzione a:
- Tracciato cardiotocografico (CTG) e sue interpretazioni
- Partogramma e tempi del travaglio
- APGAR score neonatale
- Decisioni su modalità del parto (naturale vs cesareo, tempi decisione)
- Complicanze del parto (emorragia, sofferenza fetale)
- Cartella neonatale`,

  anestesiologica: `FOCUS ANESTESIOLOGICO: Presta particolare attenzione a:
- Cartella anestesiologica completa
- Valutazione preoperatoria e ASA score
- Farmaci anestesiologici somministrati
- Parametri vitali intraoperatori (monitoraggio continuo)
- Complicanze anestesiologiche
- Consenso informato per anestesia`,

  infezione_nosocomiale: `FOCUS INFEZIONE NOSOCOMIALE: Presta particolare attenzione a:
- Esami colturali e antibiogrammi
- Data insorgenza sintomi infettivi
- Antibioticoterapia (farmaco, dosaggio, durata, razionale)
- Profilassi antibiotica pre/post chirurgica
- Markers infiammatori (PCR, procalcitonina, leucociti)
- Misure di isolamento e prevenzione`,

  errore_diagnostico: `FOCUS ERRORE DIAGNOSTICO: Presta particolare attenzione a:
- Sequenza temporale di tutti gli esami diagnostici
- Referti e loro interpretazione
- Diagnosi formulate nel tempo (evoluzione diagnostica)
- Tempi tra esami e comunicazione risultati
- Eventuali esami non prescritti che sarebbero stati indicati`,

  rc_auto: `FOCUS RC AUTO — SINISTRO STRADALE: Presta particolare attenzione a:
- Dinamica del sinistro e modalita dell'impatto
- Lesioni da trauma stradale e loro compatibilita con la dinamica
- Tempistiche del primo soccorso e del primo accesso al pronto soccorso
- Imaging post-trauma (RX, TC, RM) e relativi referti
- Evoluzione clinica delle lesioni nel tempo
- Periodi di inabilita temporanea (ITT, ITP) documentati
- Postumi permanenti e loro quantificazione
- Congruita tra dinamica del sinistro e lesioni documentate`,


  generica: `ANALISI GENERICA: Estrai tutti gli eventi clinici senza filtri prioritari specifici. Presta attenzione a qualsiasi anomalia nella gestione clinica.`,
};

/**
 * Build the system prompt for event extraction.
 * Supports single CaseType or CaseType[] for multi-type cases.
 */
export function buildExtractionSystemPrompt(caseType: CaseType | CaseType[]): string {
  const types = Array.isArray(caseType) ? caseType : [caseType];
  return `## CONTESTO
Sei un medico legale che analizza documentazione clinica per una perizia. Il tuo compito e' estrarre OGNI fatto clinico rilevante dal testo OCR. Il documento puo' essere clinico, legale o amministrativo — estrai sempre i fatti del PAZIENTE.

## DATI
Ricevi testo OCR con marker [PAGE_START:N] e [PAGE_END:N] per ogni pagina. Tipo documento e nome file sono indicati nel messaggio utente.

## COMPITO
Segui questi 5 passi IN ORDINE:
1. **SCORRI** il testo e identifica TUTTE le date menzionate
2. **PER OGNI DATA**, identifica cosa e' successo (visita, esame, diagnosi, intervento, terapia, ricovero, referto, spesa_medica, documento_amministrativo)
3. **PER OGNI EVENTO**, copia una frase chiave ESATTA dal testo OCR (sourceText, max 200 char). COPIA CARATTERE-PER-CARATTERE, inclusi errori/abbreviazioni dell'OCR: MAI riassumere, riformulare o "ripulire" — un sourceText parafrasato è inutilizzabile come ancora di verifica. Se non riesci a individuare una frase copiabile, lascia sourceText vuoto ("").
4. **COMPILA extraction_reasoning** PRIMA degli altri campi — spiega dove hai trovato l'evento
5. **VERIFICA FINALE**: nessuna data del testo omessa, nessun dato inventato

### REGOLA ZERO DISCARD
Non scartare MAI nessun dato del paziente. Ogni esame, visita, valore di laboratorio, prescrizione = un evento. Se hai dubbi, ESTRAILO.
- Da documenti legali (memorie, CTU, CTP): estrai i fatti CLINICI del paziente come eventi normali
- NON estrarre: riferimenti legislativi puri, giurisprudenza generica, premesse giuridiche (a meno che collegati a un fatto concreto del paziente)

### REGOLE DATE
- Formato SEMPRE YYYY-MM-DD (ISO). NON usare mai DD/MM/YYYY in output: evita lo scambio giorno/mese.
- **Data dell'EVENTO CLINICO, non del documento**: usa la data nel contesto testuale immediato dell'evento (quando l'esame/visita/intervento è AVVENUTO). La data di stampa/invio/protocollo/intestazione è METADATO del documento: NON usarla per datare gli eventi clinici, a meno che non coincida realmente con la data dell'evento.
- Data approssimata e' MOLTO meglio di NULL, MA solo se desunta dal contesto clinico (non dal metadato del documento)
- "Febbraio 2024" → "2024-02-01", datePrecision="mese"
- Solo l'ANNO noto (es. "nel 2002", "cesareo del 2013") → "2002-01-01" / "2013-01-01" con datePrecision="anno". È SOLO l'anno: NON spacciarlo per una data precisa (il giorno/mese 01.01 è un riempitivo, non un dato reale).
- Data relativa → calcola se possibile ("3 giorni dopo l'intervento del 10/05" → 2024-05-13)
- NESSUN indizio → NULL, datePrecision="sconosciuta"
- **VIETATO date generiche tipo "metà ottobre 2025"**: NON creare eventi nuovi a partire da espressioni vaghe tipo "metà ottobre", "fine novembre", "inizi 2026" se non hanno un giorno preciso. Se vuoi rappresentare comunque l'evento, usa il primo del mese con datePrecision="mese", MA solo se è l'unica menzione di quell'evento (vedi regola RIFERIMENTI sotto).

### EVENTI vs RIFERIMENTI RETROSPETTIVI (regola anti-duplicazione)
Un documento clinico spesso menziona eventi PASSATI come contesto (anamnesi, "esiti di intervento del...", "frattura avvenuta a metà ottobre 2025", "trauma di 6 mesi fa"). Questi sono RIFERIMENTI RETROSPETTIVI, NON nuovi eventi.

REGOLA: crea un evento nuovo SOLO per cosa accade NEL documento corrente (visita, esame, terapia, intervento del giorno del documento). NON creare eventi nuovi per cosa è già successo PRIMA.

Esempio anti-pattern:
- Documento: visita controllo del 10/02/2026 che dice "Paziente con esiti di osteosintesi del polso destro per frattura avvenuta a metà ottobre 2025."
- ❌ ERRATO: creare evento "Osteosintesi" eventDate=2025-10-15 + evento "Visita controllo" eventDate=2026-02-10. (Crea fake date e duplica l'osteosintesi se è già documentata altrove.)
- ✓ CORRETTO: creare SOLO l'evento "Visita controllo" eventDate=2026-02-10. La menzione dell'osteosintesi e della frattura va nella descrizione della visita, NON come evento separato.

Eccezione: se il documento è la FONTE PRIMARIA di un evento (es. lettera dimissione che riporta l'intervento del giorno precedente, e nessun altro documento attesta quell'intervento), crea l'evento con la sua data reale.

### ANTI-HALLUCINATION (4 regole)
1. NON inventare MAI dati assenti dal testo: nomi, date, diagnosi, valori, farmaci. Se manca, usa NULL.
2. NON completare informazioni parziali con conoscenza medica esterna. Riporta SOLO cio' che il testo dice.
3. Ogni evento DEVE avere sourceText verificabile nel testo OCR. Se non lo trovi, non estrarre l'evento.
4. Il marker [ILLEGGIBILE] indica testo che l'OCR NON ha saputo leggere: NON ricostruirlo, NON indovinarlo, NON sostituirlo con termini clinici plausibili. Riporta il marker cosi' com'e' nella description/sourceText e abbassa la confidence dell'evento.

### REGOLE PRONTO SOCCORSO
Quando il documento è verbale o cartella di Pronto Soccorso (PS), includi SEMPRE nella description dell'evento "ricovero" o "visita" PS:
- **N. Episodio** (etichette possibili: "N. Episodio", "Episodio N.", "Cartella PS n.", "Episodio:") — es. "Episodio n. 2025066445"
- **Unità operativa + Ente erogante** — es. "MDA Pronto Soccorso Pediatrico BT, AOUI Verona"
- **Data e ora di accettazione** se distinte dalla data evento

Questi dati sono critici per identificare univocamente il documento e devono comparire nella description (non solo nel facility).

### REGOLE AGGIUNTIVE
- **Descrizione COMPLETA**: riporta fedelmente tutto il contenuto clinico. Includi valori numerici, dosaggi, parametri. NON sintetizzare.
- **Abbreviazioni**: espandi alla prima occorrenza. Es: "PA (pressione arteriosa) 140/85"
- **Confidence**: 80-100 testo chiaro, 60-79 scansioni, 40-59 parziale, 10-39 illeggibile
- **requiresVerification=true** SOLO per: manoscritto illeggibile, numeri OCR dubbi, informazioni contraddittorie
- **Tabelle** [TABLE_START]/[TABLE_END]: ogni riga = un dato separato con valore e unita' di misura
- **documento_amministrativo**: UN SOLO evento per atto legale che riassuma il contenuto essenziale

${SOURCE_RULES}

## GUIDA SPECIFICA PER TIPO CASO
${types.map(t => CASE_TYPE_GUIDANCE[t]).join('\n\n')}

## FORMATO
JSON con chiave "events" (minuscolo). Campi per ogni evento:
extraction_reasoning, eventDate, datePrecision, eventType, title (max 100 char), description, sourceType, diagnosis, doctor, facility, confidence, requiresVerification, reliabilityNotes, sourceText (max 200 char), sourcePages

**15 tipi evento**: visita | esame | diagnosi | intervento | terapia | ricovero | follow-up | referto | prescrizione | consenso | complicanza | spesa_medica | documento_amministrativo | certificato | altro
**sourceType**: cartella_clinica | referto_controllo | esame_strumentale | esame_ematochimico | altro

## ESEMPIO 1 — Accesso Pronto Soccorso (referto semplice)

Input: "[PAGE_START:1] Pronto Soccorso Ospedale San Marco 15.03.2024. Pz maschio 52aa giunge per trauma ginocchio dx post caduta accidentale durante attivita sportiva. PA 140/85, FC 88, SpO2 98%. EO: tumefazione ginocchio dx, dolore, limitazione funzionale. RX ginocchio dx: frattura composta piatto tibiale destro. Diagnosi: frattura piatto tibiale dx. Ricoverato per osservazione. [PAGE_END:1]"

Output:
\`\`\`json
{
  "events": [
    {
      "extraction_reasoning": "Pagina 1: data 15.03.2024 con ricovero PS e diagnosi esplicita frattura piatto tibiale",
      "eventDate": "2024-03-15",
      "datePrecision": "giorno",
      "eventType": "ricovero",
      "title": "Ricovero PS per trauma ginocchio destro post caduta",
      "description": "Paziente maschio 52 anni giunge per trauma al ginocchio destro a seguito di caduta accidentale durante attivita' sportiva. All'ingresso: PA (pressione arteriosa) 140/85 mmHg, FC (frequenza cardiaca) 88 bpm, SpO2 (saturazione periferica) 98%. Esame obiettivo: tumefazione al ginocchio destro con dolore e limitazione funzionale. RX ginocchio destro: frattura composta del piatto tibiale destro. Ricoverato per osservazione clinica.",
      "sourceType": "cartella_clinica",
      "diagnosis": "Frattura composta piatto tibiale destro",
      "doctor": null,
      "facility": "Pronto Soccorso Ospedale San Marco",
      "confidence": 95,
      "requiresVerification": false,
      "reliabilityNotes": null,
      "sourceText": "Pz maschio 52aa giunge per trauma ginocchio dx post caduta. RX: frattura composta piatto tibiale dx.",
      "sourcePages": [1]
    }
  ],
  "abbreviations": [
    {"abbreviation": "PA", "expansion": "Pressione Arteriosa"},
    {"abbreviation": "FC", "expansion": "Frequenza Cardiaca"},
    {"abbreviation": "SpO2", "expansion": "Saturazione Periferica di Ossigeno"},
    {"abbreviation": "EO", "expansion": "Esame Obiettivo"},
    {"abbreviation": "RX", "expansion": "Radiografia"}
  ]
}
\`\`\`

## ESEMPIO 2 — Cartella clinica complessa (intervento + esami lab + dimissione)

Input: "[PAGE_START:3] Descrizione operatoria 16.03.2024 ore 14:00. Intervento: riduzione e osteosintesi piatto tibiale dx con placca e viti. Chirurgo: Dott. Bianchi, Assistente: Dott. Neri. Tecnica: approccio antero-laterale, riduzione anatomica sotto ampliscopio, fissazione con placca a stabilita angolare e 6 viti. Durata: 95 min. Decorso intraoperatorio regolare. [PAGE_END:3] [PAGE_START:4] Esami ematochimici 17.03.2024: [TABLE_START] Hb 10.8 g/dL (rif 13.0-17.0) | WBC 12.500/uL (rif 4.000-10.000) | PCR 5.2 mg/dL (rif <0.5) | Creatinina 0.9 mg/dL (rif 0.7-1.2) [TABLE_END] Lettera di dimissione 20.03.2024. Diagnosi: frattura composta piatto tibiale dx trattata con osteosintesi. Prescritto tutore articolato per 45 giorni. Terapia: enoxaparina 4000 UI/die sc, paracetamolo 1g x3/die. Controllo a 30 giorni con RX. [PAGE_END:4]"

Output:
\`\`\`json
{
  "events": [
    {
      "extraction_reasoning": "Pagina 3: data 16.03.2024, descrizione operatoria con chirurgo e tecnica dettagliata",
      "eventDate": "2024-03-16",
      "datePrecision": "giorno",
      "eventType": "intervento",
      "title": "Osteosintesi piatto tibiale destro con placca e viti",
      "description": "Intervento di riduzione e osteosintesi del piatto tibiale destro con placca e viti. Chirurgo operatore: Dott. Bianchi, assistente: Dott. Neri. Tecnica: approccio antero-laterale, riduzione anatomica sotto controllo ampliscopico, fissazione con placca a stabilita' angolare e 6 viti. Durata intervento: 95 minuti. Decorso intraoperatorio regolare, nessuna complicanza segnalata.",
      "sourceType": "cartella_clinica",
      "diagnosis": null,
      "doctor": "Dott. Bianchi",
      "facility": null,
      "confidence": 95,
      "requiresVerification": false,
      "reliabilityNotes": null,
      "sourceText": "Riduzione e osteosintesi piatto tibiale dx con placca e viti. Chirurgo: Dott. Bianchi. Approccio antero-laterale.",
      "sourcePages": [3]
    },
    {
      "extraction_reasoning": "Pagina 4: tabella esami ematochimici datata 17.03.2024 con valori fuori range",
      "eventDate": "2024-03-17",
      "datePrecision": "giorno",
      "eventType": "esame",
      "title": "Esami ematochimici post-operatori",
      "description": "Esami ematochimici del 17.03.2024: Hb (emoglobina) 10.8 g/dL (rif. 13.0-17.0, BASSO), WBC (globuli bianchi) 12.500/uL (rif. 4.000-10.000, ALTO), PCR (proteina C reattiva) 5.2 mg/dL (rif. <0.5, ALTO), creatinina 0.9 mg/dL (rif. 0.7-1.2, nella norma).",
      "sourceType": "esame_ematochimico",
      "diagnosis": null,
      "doctor": null,
      "facility": null,
      "confidence": 90,
      "requiresVerification": false,
      "reliabilityNotes": "Hb bassa, WBC e PCR elevati — valori attesi in fase post-operatoria",
      "sourceText": "Hb 10.8 g/dL (rif 13.0-17.0) | WBC 12.500/uL (rif 4.000-10.000) | PCR 5.2 mg/dL",
      "sourcePages": [4]
    },
    {
      "extraction_reasoning": "Pagina 4: lettera di dimissione datata 20.03.2024 con diagnosi, prescrizioni e follow-up",
      "eventDate": "2024-03-20",
      "datePrecision": "giorno",
      "eventType": "referto",
      "title": "Dimissione con prescrizione tutore e terapia",
      "description": "Lettera di dimissione del 20.03.2024. Diagnosi alla dimissione: frattura composta piatto tibiale destro trattata con riduzione e osteosintesi. Prescritto tutore articolato da indossare per 45 giorni. Terapia domiciliare: enoxaparina 4000 UI/die per via sottocutanea, paracetamolo 1g tre volte al giorno. Programmato controllo a 30 giorni con esame radiografico (RX).",
      "sourceType": "cartella_clinica",
      "diagnosis": "Frattura composta piatto tibiale destro",
      "doctor": null,
      "facility": null,
      "confidence": 95,
      "requiresVerification": false,
      "reliabilityNotes": null,
      "sourceText": "Dimissione 20.03.2024. Frattura composta piatto tibiale dx trattata con osteosintesi. Tutore 45gg.",
      "sourcePages": [4]
    }
  ],
  "abbreviations": [
    {"abbreviation": "Hb", "expansion": "Emoglobina"},
    {"abbreviation": "WBC", "expansion": "Globuli Bianchi (White Blood Cells)"},
    {"abbreviation": "PCR", "expansion": "Proteina C Reattiva"},
    {"abbreviation": "RX", "expansion": "Radiografia"}
  ]
}
\`\`\`

IMPORTANTE: Gli esempi sopra mostrano formato e livello di dettaglio. I dati sono FITTIZI — tu devi usare SOLO dati dal testo OCR reale fornito.`;
}

// --- Document Type Hints ---

const DOCUMENT_TYPE_HINTS: Record<string, string> = {
  cartella_clinica: `ISTRUZIONI SPECIFICHE PER CARTELLA CLINICA:
STRUTTURA ATTESA: Foglio di accettazione → Anamnesi → Esame obiettivo → Diario medico/infermieristico → Descrizione operatoria → Cartella anestesiologica → Esami → Lettera di dimissione.
CAMPI CRITICI DA ESTRARRE:
- Dati di ingresso: diagnosi COMPLETA, parametri vitali (PA, FC, SpO2, T°), peso, altezza, allergie
- Descrizione operatoria: testo INTEGRALE (tipo intervento, operatori, tecnica, durata, materiali/protesi, complicanze intraop)
- Cartella anestesiologica: ASA score, tipo anestesia, farmaci, parametri intraop
- Diario medico: riporta TUTTO il decorso clinico, non solo le complicanze. RAGGRUPPA i giorni stabili in un unico evento "decorso" (es. "gg 2-6: stabile, parametri nella norma, terapia invariata") e crea eventi SEPARATI per ogni variazione rilevante (complicanze, peggioramenti, febbre, modifiche terapia, prima mobilizzazione, consulenze). NON limitarti agli eventi avversi: anche la routine clinica documenta la catena probatoria
- Esami: TUTTI i valori con unità di misura e range di riferimento
- Dimissione: diagnosi dimissione completa, terapia domiciliare (farmaco, dose, via, frequenza), follow-up, prognosi
ERRORI COMUNI: Saltare valori di laboratorio in tabelle, ignorare annotazioni manoscritte a margine, perdere la cartella anestesiologica.
COSA NON ESTRARRE: Annotazioni puramente logistiche del diario (pasti, igiene personale, posizionamento letto), firme senza contenuto clinico.`,

  referto_specialistico: `ISTRUZIONI SPECIFICHE PER REFERTO SPECIALISTICO:
STRUTTURA ATTESA: Intestazione (specialista, data, struttura) → Motivo della visita → Anamnesi → Esame obiettivo → Esami richiesti/visionati → Diagnosi/Conclusioni → Terapia/Follow-up.
CAMPI CRITICI: Data visita, nome specialista e qualifica, struttura, motivo della visita, esame obiettivo COMPLETO (misurazioni, test funzionali, scale di valutazione), diagnosi, terapia prescritta, follow-up programmato.
ERRORI COMUNI: Sintetizzare l'esame obiettivo perdendo misurazioni specifiche, ignorare le scale di valutazione (VAS, Barthel, WOMAC), perdere la terapia prescritta.`,

  esame_strumentale: `ISTRUZIONI SPECIFICHE PER ESAME STRUMENTALE:
STRUTTURA ATTESA: Tipo esame → Distretto/regione anatomica → Tecnica (con/senza mdc) → Descrizione → Conclusioni diagnostiche.
CAMPI CRITICI: Data esame, tipo esame (RX/TAC/RM/ECO/ECG/EMG/endoscopia), distretto esaminato, tecnica usata, descrizione COMPLETA dei reperti, conclusioni diagnostiche INTEGRALI.
ERRORI COMUNI: Riassumere le conclusioni perdendo dettagli (es. dimensioni lesioni, grading, classificazioni), ignorare il confronto con esami precedenti citato nel referto.
UN EVENTO PER ESAME: ogni esame strumentale = un evento separato, anche se nello stesso giorno. NON aggregare RX + RM in un unico evento.`,

  esame_laboratorio: `ISTRUZIONI SPECIFICHE PER ESAMI DI LABORATORIO:
STRUTTURA ATTESA: Data prelievo → Tabella valori con: parametro, valore, unità di misura, range di riferimento, flag (H/L/N).
CAMPI CRITICI: Data prelievo OBBLIGATORIA, OGNI valore numerico con unità e range. Evidenzia valori fuori range nel campo reliabilityNotes.
ERRORI COMUNI: Aggregare più parametri in un solo evento perdendo valori, inventare range di riferimento non presenti nel documento, saltare valori normali che potrebbero essere significativi nel contesto del caso.
FORMATO DESCRIZIONE: Per ogni pannello/prelievo, elenca TUTTI i parametri: "Emocromo (01/03/2024): WBC 12.5 x10^3/uL (rif. 4.0-11.0, ALTO), RBC 4.2 x10^6/uL (rif. 4.5-5.5, BASSO), Hb 11.2 g/dL (rif. 13.0-17.0, BASSO), PLT 245 x10^3/uL (rif. 150-400, nella norma)..."
Raggruppa per DATA DI PRELIEVO — un evento per data, con tutti i valori di quella data.`,

  lettera_dimissione: `ISTRUZIONI SPECIFICHE PER LETTERA DI DIMISSIONE:
STRUTTURA ATTESA: Dati ricovero (date ingresso/dimissione) → Diagnosi ingresso → Interventi eseguiti → Decorso → Diagnosi dimissione → Terapia domiciliare → Follow-up.
CAMPI CRITICI:
- Date ricovero e dimissione (ENTRAMBE obbligatorie, crea eventi "ricovero" e "referto" separati)
- Diagnosi di ingresso e di dimissione INTEGRALI (non abbreviate)
- Interventi eseguiti: tipo, data, operatore se citato
- Decorso: SOLO eventi significativi (complicanze, modifiche terapia, consulenze)
- Terapia alla dimissione: OGNI farmaco con dosaggio, via, frequenza
- Follow-up: controlli programmati con date e specialista
ERRORI COMUNI: Perdere la terapia alla dimissione, non distinguere diagnosi ingresso da dimissione, saltare il follow-up programmato.`,

  certificato: `ISTRUZIONI SPECIFICHE PER CERTIFICATO:
CAMPI CRITICI: Tipo certificato (medico, INAIL, invalidità, malattia, idoneità), data emissione, ente/medico emittente, contenuto, periodi di inabilità con date precise, percentuali di invalidità se presenti.
ERRORI COMUNI: Non distinguere tra certificato iniziale e di continuazione INAIL, perdere le date di prognosi.`,

  spese_mediche: `ISTRUZIONI SPECIFICHE PER SPESE MEDICHE:
CAMPI CRITICI: Per OGNI voce di spesa crea un evento "spesa_medica" separato con: data prestazione/fattura, descrizione prestazione, importo ESATTO (€), struttura erogatrice, codice prestazione se presente.
Se una fattura contiene più voci con importi separati, crea un evento per voce.
Se più fatture hanno la stessa data, crea eventi separati per ciascuna.

REGOLA CRITICA SULLA DATA (segnalata dal perito 2026-05-11):
- NON SCARTARE MAI una voce di spesa per assenza di data. L'importo e' il dato vincolante, la data e' opzionale.
- Se la data di pagamento NON e' leggibile, usa la data della fattura.
- Se NEMMENO la data fattura e' leggibile, usa la data della prestazione clinica correlata.
- Se NESSUNA data e' presente, lascia eventDate=null e datePrecision="sconosciuta" — la voce sara' COMUNQUE conservata in tabella spese.
- Esempi di voci tipicamente senza data: imposta di bollo (2 EUR su fatture > 77,47 EUR), riepiloghi totali, righe di sintesi, contanti senza ricevuta.

REGOLA CRITICA SU IMPOSTA DI BOLLO E ONERI ACCESSORI (segnalata dal perito 2026-05-11):
- L'imposta di bollo (2 EUR sulle fatture > 77,47 EUR, ai sensi DPR 642/1972) NON va sommata all'importo della prestazione: e' un onere fiscale separato.
- Crea un evento "spesa_medica" SEPARATO per il bollo, con: title="Imposta di bollo", importo=2.00, description="Bollo ex DPR 642/1972 su fattura n.X del...".
- Stesso trattamento per: marca da bollo, oneri amministrativi, spese postali, contributi ENPAM/cassa previdenziale, IVA esposta separatamente.
- Cosi il perito vede la composizione completa della fattura: prestazione + bollo + altri oneri = totale fatturato.

ERRORI COMUNI: Aggregare piu voci perdendo dettaglio importi, inventare importi non leggibili, scartare voci senza data, sommare il bollo all'importo della prestazione.`,

  memoria_difensiva: `ISTRUZIONI SPECIFICHE PER MEMORIA DIFENSIVA:
Questo è un ATTO LEGALE. Contiene sia argomentazioni giuridiche sia fatti clinici citati.
DOPPIA ESTRAZIONE OBBLIGATORIA:
1. Ogni FATTO CLINICO citato (intervento, ricovero, diagnosi, esame, data) → evento clinico normale (visita, intervento, diagnosi, etc.)
2. Ogni ARGOMENTAZIONE LEGALE (contestazione, richiesta, conclusione) → evento "documento_amministrativo"
Le date citate nella memoria sono fatti clinici da estrarre nella timeline.
NON ignorare nulla: ogni affermazione fattuale è rilevante per la perizia.`,

  perizia_ctp: `ISTRUZIONI SPECIFICHE PER PERIZIA CTP (Consulenza Tecnica di Parte):
CAMPI CRITICI: Fatti accertati dal CTP, valutazioni di danno biologico (% permanente), periodi ITT/ITP con date, nesso causale, conclusioni, ogni documentazione clinica citata.
Estrai i fatti accertati come eventi clinici normali. Estrai valutazioni e conclusioni come eventi separati.`,

  perizia_ctu: `ISTRUZIONI SPECIFICHE PER PERIZIA CTU (Consulenza Tecnica d'Ufficio):
CAMPI CRITICI: Quesiti del giudice, fatti accertati dal CTU, valutazioni di danno, risposte ai quesiti, conclusioni, documentazione esaminata.
Estrai quesiti e risposte come "documento_amministrativo". Estrai fatti clinici come eventi normali. Estrai conclusioni e quantificazioni come eventi separati.`,

  perizia_precedente: `ISTRUZIONI SPECIFICHE PER PERIZIA PRECEDENTE:
Estrai i fatti clinici accertati dal perito come eventi clinici normali. Estrai valutazioni di danno biologico (%, ITT/ITP) come eventi separati. Estrai ogni riferimento a documentazione esaminata. Estrai conclusioni come "documento_amministrativo".`,
};

/**
 * Get document-type specific hints for extraction.
 */
export function getDocumentTypeHint(documentType: string): string {
  return DOCUMENT_TYPE_HINTS[documentType] ?? '';
}

/**
 * Build the user prompt for a specific document text.
 * Supports chunk context for multi-chunk documents.
 */
export function buildExtractionUserPrompt(params: {
  documentText: string;
  fileName: string;
  documentType: string;
  chunkIndex?: number;
  totalChunks?: number;
  documentName?: string;
  pageRange?: string;
  /** Wave C.4: ISO-639-1 hint when the OCR is not Italian. */
  languageHint?: 'de' | 'en' | 'mixed';
}): string {
  const { documentText, fileName, documentType, chunkIndex, totalChunks, documentName, pageRange, languageHint } = params;

  let chunkContext = '';
  if (chunkIndex !== undefined && totalChunks !== undefined && totalChunks > 1) {
    chunkContext = '[CONTESTO SEGMENTO]\n';
    if (documentName) chunkContext += `Documento: "${documentName}"\n`;
    chunkContext += `Segmento: ${chunkIndex + 1} di ${totalChunks}`;
    if (pageRange) chunkContext += ` (${pageRange})`;
    chunkContext += '\n';
    if (chunkIndex > 0) {
      chunkContext += 'Questo è un segmento intermedio del documento. Alcuni eventi del confine con il segmento precedente potrebbero essere già stati estratti — NON duplicarli se il contesto è identico.\n';
    }
    chunkContext += '[FINE CONTESTO]\n\n';
  }

  const typeHint = getDocumentTypeHint(documentType);
  const typeHintBlock = typeHint ? `\n${typeHint}\n` : '';

  // Wave C.4: when the document is not Italian (e.g. cartelle cliniche di
  // Bolzano/Alto Adige in tedesco), instruct the model explicitly so it does
  // not skip events whose surrounding prose is in another language.
  let languageBlock = '';
  if (languageHint === 'de') {
    languageBlock = `\n[LINGUA] Il documento è in TEDESCO. Estrai comunque tutti gli eventi clinici. Per ogni evento:
- title/description: traduci in italiano i concetti medici (es. "Aufnahme" → "Ricovero", "Diagnose" → "Diagnosi"), mantenendo i nomi propri (paziente, medico, struttura) nella forma originale.
- sourceText: mantieni la citazione testuale ESATTA in tedesco (NON tradurre).
- diagnosis/doctor/facility: nomi propri in originale; codici ICD/diagnosi in originale + traduzione se evidente.\n\n`;
  } else if (languageHint === 'en') {
    languageBlock = `\n[LINGUA] Il documento è in INGLESE. Stesse regole della clausola tedesca: traduci i concetti, mantieni le citazioni e i nomi propri in originale.\n\n`;
  } else if (languageHint === 'mixed') {
    languageBlock = `\n[LINGUA] Il documento contiene testo in italiano e in un'altra lingua. Estrai eventi da entrambe le sezioni linguistiche. Per le sezioni non italiane: traduci i concetti medici, mantieni citazioni testuali e nomi propri.\n\n`;
  }

  return `${chunkContext}${typeHintBlock ? `${typeHintBlock}\n` : ''}${languageBlock}DOCUMENTO: ${fileName}
TIPO DOCUMENTO: ${documentType}

NOTA: Il testo contiene marker [PAGE_START:N] e [PAGE_END:N] che delimitano le pagine del documento.
Usa questi marker per determinare i numeri di pagina (sourcePages) di ciascun evento.
Per sourceText, riporta una frase chiave ESATTA (max 200 caratteri) dal testo OCR che ancora l'evento.

--- INIZIO TESTO DOCUMENTO ---
${documentText}
--- FINE TESTO DOCUMENTO ---

Estrai TUTTI gli eventi clinici seguendo i 5 PASSI del sistema: (1) trova date, (2) identifica eventi, (3) copia sourceText, (4) scrivi extraction_reasoning, (5) verifica completezza.

ZERO DISCARD: ogni dato del paziente = un evento. NON inventare dati assenti. sourceText obbligatorio.`;
}
