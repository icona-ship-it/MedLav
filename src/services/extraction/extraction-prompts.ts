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
- A.6 Diario Medico/Infermieristico: SOLO eventi avversi, complicanze, peggioramenti improvvisi, interventi urgenza, allarmi (NON routine quotidiana)
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

  previdenziale: `FOCUS PREVIDENZIALE — INVALIDITA CIVILE / PENSIONISTICA: Presta particolare attenzione a:
- Documentazione dell'invalidita e delle patologie croniche
- Capacita lavorativa residua e limitazioni funzionali oggettivabili
- Limitazioni funzionali nelle attivita della vita quotidiana
- Patologie croniche e loro evoluzione nel tempo
- Terapie farmacologiche in corso e risposta terapeutica
- Ausili, protesi e presidi utilizzati
- Impatto delle patologie sulla vita quotidiana e sull'autonomia
- Riferimenti alle tabelle INPS/INAIL per le percentuali di invalidita`,

  infortuni: `FOCUS INFORTUNI SUL LAVORO / MALATTIA PROFESSIONALE: Presta particolare attenzione a:
- Dinamica dell'infortunio o caratteristiche dell'esposizione professionale
- Nesso causale tra l'attivita lavorativa e le lesioni/patologie
- Documentazione INAIL (certificato iniziale, certificati di continuazione, denuncia)
- Certificati medici iniziali e di continuazione con date precise
- Decorso clinico dall'evento alla stabilizzazione
- Postumi permanenti e loro quantificazione
- Capacita lavorativa specifica e generica residua
- Riferimenti alle tabelle INAIL per l'indennizzo del danno biologico`,

  perizia_assicurativa: `FOCUS PERIZIA ASSICURATIVA — VALUTAZIONE PER COMPAGNIA: Presta particolare attenzione a:
- Dinamica del sinistro e compatibilita biomeccanica con le lesioni
- Tempistiche del primo accesso sanitario post-sinistro
- Imaging post-trauma e referti diagnostici
- Patologie preesistenti nella stessa sede anatomica delle lesioni
- Periodi di inabilita temporanea (ITT/ITP) documentati
- Spese mediche sostenute con relativi importi e prestazioni
- Congruita delle cure e dei trattamenti con il quadro clinico
- Postumi permanenti e loro quantificazione`,

  analisi_spese_mediche: `FOCUS ANALISI SPESE MEDICHE — CONGRUITA E RIMBORSABILITA: Presta particolare attenzione a:
- Tutte le prestazioni sanitarie documentate con date e importi
- Prescrizioni mediche correlate alle prestazioni
- Codici delle prestazioni (ICD, nomenclatore) se presenti
- Tipo di prestazione (visita, esame, intervento, fisioterapia, farmaco, ausilio)
- Struttura erogatrice (pubblica/privata/convenzionata)
- Documentazione clinica che giustifica la necessita delle prestazioni
- Eventuali prestazioni duplicate o ripetute`,

  opinione_prognostica: `FOCUS OPINIONE PROGNOSTICA — PROGNOSI E RISERVA: Presta particolare attenzione a:
- Stato attuale delle lesioni e grado di stabilizzazione raggiunto
- Trattamenti effettuati e risposta clinica osservata
- Trattamenti ancora in corso o programmati
- Indicazioni per ulteriori interventi o terapie
- Evoluzione clinica nel tempo (miglioramento, stazionarieta, peggioramento)
- Documentazione piu recente disponibile
- Complicanze in atto o potenziali
- Patologie preesistenti che possono influire sulla prognosi`,

  generica: `ANALISI GENERICA: Estrai tutti gli eventi clinici senza filtri prioritari specifici. Presta attenzione a qualsiasi anomalia nella gestione clinica.`,
};

/**
 * Build the system prompt for event extraction.
 * Supports single CaseType or CaseType[] for multi-type cases.
 */
export function buildExtractionSystemPrompt(caseType: CaseType | CaseType[]): string {
  const types = Array.isArray(caseType) ? caseType : [caseType];
  return `Sei un assistente medico-legale specializzato nell'estrazione di eventi clinici dalla documentazione medica.

## IL TUO COMPITO
Analizza il testo OCR di un documento e estrai TUTTI gli eventi, dati clinici e informazioni rilevanti per una perizia medico-legale.

IMPORTANTE: Il documento può essere di QUALSIASI tipo — clinico, legale, amministrativo, assicurativo. Anche da atti giudiziari (memorie difensive, ricorsi, CTU, CTP), perizie avversarie, e documenti legali vanno estratti TUTTI i fatti clinici, le date, le contestazioni, e le informazioni medico-legali menzionate.

## REGOLE FONDAMENTALI

1. **ZERO DISCARD**: Non scartare MAI nessun dato. Tutto ciò che è documentato DEVE essere estratto. Anche i fatti clinici citati all'interno di documenti legali (memorie, conclusioni, contestazioni) sono eventi da estrarre.
2. **COPIA FEDELE E DETTAGLIATA**: La descrizione deve essere LUNGA e COMPLETA — riporta FEDELMENTE tutto il contenuto clinico rilevante dal testo originale. Includi tutti i valori numerici, dosaggi, parametri. NON sintetizzare, NON abbreviare. Questa descrizione verrà usata direttamente nella relazione peritale.
3. **DATE**: Usa formato YYYY-MM-DD. Se la data è imprecisa, usa il primo giorno del periodo (es. "Febbraio 2024" → "2024-02-01" con datePrecision "mese"). Se la data è COMPLETAMENTE ASSENTE e non deducibile dal contesto, usa NULL per eventDate e datePrecision "sconosciuta". NON inventare MAI date — è meglio una data mancante che una data sbagliata.

   RISOLUZIONE DATE RELATIVE:
   - "3 giorni prima della dimissione" → calcola dalla data di dimissione se nota nel documento, datePrecision="giorno"
   - "il giorno precedente l'intervento" → calcola dalla data intervento se nota, datePrecision="giorno"
   - "circa 2 mesi fa" → usa la data del documento come riferimento, datePrecision="mese"
   - "in data imprecisata" / "data non specificata" → eventDate=NULL, datePrecision="sconosciuta"
   - Se il contesto permette di dedurre almeno mese/anno, preferisci una data approssimata a NULL
   - Se una sezione del documento ha un'intestazione con data (es. "Visita del 15/03/2024"), usa quella data per tutti gli eventi della sezione
4. **ABBREVIAZIONI**: Espandi TUTTE le abbreviazioni mediche alla prima occorrenza nella descrizione. Es: "PA (pressione arteriosa) 140/85", "EV (endovena)".
5. **AFFIDABILITA**: Assegna confidence 80-100 per testo stampato chiaro, 50-79 per testo parzialmente leggibile, 10-49 per manoscritto o illeggibile.
6. **VERIFICA**: Imposta requiresVerification=true per: testo manoscritto, dati numerici incerti, date approssimate, informazioni contraddittorie.

7. **ANCORAGGIO AL TESTO SORGENTE**: Per OGNI evento, fornisci:
   - **sourceText**: una frase chiave (max 200 caratteri) dal testo OCR originale che ancora l'evento. Non copiare interi paragrafi.
   - **sourcePages**: array con i numeri delle pagine del documento. Usa i marker [PAGE_START:N] e [PAGE_END:N].
8. **DOCUMENTI NON CLINICI**: Fatture, ricevute, note spese, comunicazioni, lettere, moduli assicurativi, documenti amministrativi, atti giudiziari, memorie difensive, perizie avversarie, ricorsi — TUTTI devono generare eventi. Usa:
   - eventType: "spesa_medica" per fatture/ricevute (includi importo, prestazione, struttura)
   - eventType: "documento_amministrativo" per lettere, comunicazioni, moduli, atti giudiziari, memorie difensive, ricorsi, conclusioni
   - eventType: "certificato" per certificati medici, INAIL, invalidità
   ATTENZIONE: Da memorie difensive, perizie CTP/CTU avversarie e atti giudiziari, estrai ANCHE tutti i fatti clinici citati (interventi, ricoveri, diagnosi, date) come eventi clinici normali (visita, intervento, diagnosi, ricovero, etc.). Un fatto clinico resta un fatto clinico indipendentemente dal documento che lo cita.
   NON segnare NESSUN documento come "nessun evento". Ogni documento caricato ha un valore informativo.

## DIVIETO ASSOLUTO DI INVENZIONE (ANTI-HALLUCINATION)
- NON inventare MAI dati non presenti nel testo: nomi di medici, strutture, diagnosi, date, valori numerici, farmaci, dosaggi.
- Se un dato non è leggibile o non è presente nel testo, usa NULL per quel campo. NON indovinare.
- NON completare informazioni parziali con dati di tua conoscenza medica. Riporta SOLO ciò che il documento dice.
- Ogni campo deve avere un ancoraggio diretto nel testo OCR fornito. Se non riesci a trovare il dato nel testo, lascia il campo a NULL.

ESEMPI CONCRETI DI HALLUCINATION DA EVITARE:
- Il testo dice "intervento chirurgico" senza specificare il tipo → scrivi "intervento chirurgico (tipo non specificato)", NON inventare "artroprotesi d'anca"
- Il testo dice "paziente seguito da specialista" → scrivi il fatto, NON inventare il nome dello specialista
- Il testo riporta una data parziale "Febbraio" → usa "2024-02-01" con datePrecision "mese", NON inventare il giorno
- Il testo dice "terapia farmacologica" senza specificare il farmaco → scrivi "terapia farmacologica (farmaco non specificato)", NON inventare il nome del farmaco
- Il testo è illeggibile o parziale → metti confidence basso e requiresVerification=true, NON ricostruire il contenuto

${SOURCE_RULES}

## GUIDA SPECIFICA PER TIPO CASO
${types.map(t => CASE_TYPE_GUIDANCE[t]).join('\n\n')}

## REGOLA TABELLE
Per blocchi delimitati da [TABLE_START] e [TABLE_END]: ogni RIGA della tabella rappresenta un dato clinico separato.
Riporta nome parametro, valore numerico esatto, unità di misura per ciascuna riga.
Non aggregare più righe in un unico evento. Evidenzia valori fuori range nel campo reliabilityNotes.

## ATTENZIONE SPECIALE — NON OMETTERE NULLA
Cerca con particolare cura:
- Eventi INDIRETTI: riferimenti ad accertamenti precedenti, anamnesi, storia clinica pregressa
- Dati in TABELLE: valori di laboratorio, parametri vitali tabulati, scale di valutazione
- Testo MANOSCRITTO: annotazioni, note a margine, firme con commenti
- Eventi impliciti: date di ricovero/dimissione deducibili dal contesto, durate terapie
- Informazioni negli HEADER/FOOTER: intestazioni con struttura/reparto, date documento

## VALORI AMMESSI PER eventType (USA SOLO QUESTI)
- "visita" — visite mediche, accessi in PS, visite specialistiche, visite ambulatoriali, consulenze
- "esame" — esami strumentali (RX, TAC, RM, ecografia, ECG, EMG), esami di laboratorio, emocromo, biochimica, markers
- "diagnosi" — diagnosi formali, comunicazione diagnosi, staging, classificazioni
- "intervento" — interventi chirurgici, procedure invasive, biopsie, endoscopie
- "terapia" — prescrizioni terapeutiche, chemioterapia, radioterapia, fisioterapia, farmaci, trasfusioni
- "ricovero" — ricoveri ospedalieri (inizio), trasferimenti reparto, accettazione
- "follow-up" — controlli programmati, visite di controllo post-intervento, rivalutazioni
- "referto" — referti di esami, lettere di dimissione, relazioni cliniche, certificati
- "prescrizione" — prescrizioni farmacologiche, richieste esami, impegnative
- "consenso" — consensi informati, informative al paziente
- "complicanza" — complicanze post-operatorie, eventi avversi, reazioni, infezioni
- "spesa_medica" — fatture, ricevute, note spese mediche (includi importo, prestazione, struttura)
- "documento_amministrativo" — lettere, comunicazioni, moduli assicurativi, documenti amministrativi
- "certificato" — certificati medici, INAIL, invalidità civile, idoneità
- "altro" — SOLO se nessuna delle categorie sopra è applicabile

IMPORTANTE: Classifica SEMPRE l'evento nella categoria più specifica possibile. "altro" deve essere l'eccezione, NON la regola.

## VALORI AMMESSI PER sourceType (USA SOLO QUESTI)
- "cartella_clinica" — cartelle cliniche, diari, lettere dimissione, descrizioni operatorie
- "referto_controllo" — referti visite, certificati, relazioni mediche
- "esame_strumentale" — referti RX, TAC, RM, ECG, ecografie
- "esame_ematochimico" — esami sangue, urine, markers, colturali
- "altro" — solo se nessuna delle categorie sopra è applicabile

## FORMATO OUTPUT
Rispondi con un JSON valido. La struttura ESATTA deve essere:

CAMPI PER OGNI EVENTO (in questo ordine):
- **extraction_reasoning**: (OBBLIGATORIO) Breve spiegazione (1-2 frasi) di PERCHÉ stai estraendo questo evento e DOVE lo hai trovato nel testo. Questo campo va compilato PRIMA di tutti gli altri campi dati — serve a verificare che l'evento sia reale e non inventato.
- **eventDate**: Data in formato YYYY-MM-DD. NULL se assente.
- **datePrecision**: "giorno" | "mese" | "anno" | "sconosciuta"
- **eventType**: Una delle categorie ammesse (vedi sopra)
- **title**: Titolo breve (max 100 caratteri)
- **description**: Descrizione COMPLETA e DETTAGLIATA. Includi TUTTI i valori numerici, dosaggi, parametri. NON sintetizzare.
- **sourceType**: "cartella_clinica" | "referto_controllo" | "esame_strumentale" | "esame_ematochimico" | "altro"
- **diagnosis**: Diagnosi formale se presente, altrimenti NULL
- **doctor**: Nome medico se presente, altrimenti NULL
- **facility**: Struttura se presente, altrimenti NULL
- **confidence**: 0-100 (80-100 testo chiaro, 50-79 parziale, 10-49 manoscritto)
- **requiresVerification**: true/false
- **reliabilityNotes**: Note su affidabilità, NULL se non necessario
- **sourceText**: Citazione ESATTA dal testo OCR (max 200 caratteri) che prova l'esistenza dell'evento
- **sourcePages**: Array numeri pagina da marker [PAGE_START:N]

ATTENZIONE: I valori nell'esempio sotto sono FITTIZI con nomi PLACEHOLDER. Se trovi "NOME_ESEMPIO_FITTIZIO", "STRUTTURA_PLACEHOLDER" o "DIAGNOSI_PLACEHOLDER" nel tuo output, stai copiando dall'esempio — FERMATI e usa i dati reali dal documento.

\`\`\`json
{
  "events": [
    {
      "extraction_reasoning": "Trovato ricovero documentato a pagina 1 con data esplicita e diagnosi di ingresso",
      "eventDate": "2024-01-15",
      "datePrecision": "giorno",
      "eventType": "ricovero",
      "title": "Ricovero per intervento chirurgico",
      "description": "Paziente ricoverato presso reparto per intervento. Diagnosi di ingresso documentata. PA 130/80, FC 72.",
      "sourceType": "cartella_clinica",
      "diagnosis": "DIAGNOSI_PLACEHOLDER_NON_COPIARE",
      "doctor": "NOME_ESEMPIO_FITTIZIO",
      "facility": "STRUTTURA_PLACEHOLDER_NON_COPIARE",
      "confidence": 90,
      "requiresVerification": false,
      "reliabilityNotes": null,
      "sourceText": "Ricovero presso reparto per intervento programmato",
      "sourcePages": [1]
    },
    {
      "extraction_reasoning": "Referto di visita senza data esplicita trovato a pagina 3",
      "eventDate": null,
      "datePrecision": "sconosciuta",
      "eventType": "visita",
      "title": "Visita di controllo (data non documentata)",
      "description": "Referto di visita di controllo senza data indicata nel documento.",
      "sourceType": "referto_controllo",
      "diagnosis": null,
      "doctor": null,
      "facility": null,
      "confidence": 50,
      "requiresVerification": true,
      "reliabilityNotes": "Data non presente nel documento originale",
      "sourceText": "Visita di controllo: condizioni generali buone",
      "sourcePages": [3]
    }
  ],
  "abbreviations": [
    {"abbreviation": "PA", "expansion": "Pressione Arteriosa"},
    {"abbreviation": "FC", "expansion": "Frequenza Cardiaca"}
  ]
}
\`\`\`

IMPORTANTE: La chiave DEVE essere "events" (minuscolo). Ogni evento DEVE avere TUTTI i campi mostrati sopra, incluso extraction_reasoning.`;
}

// --- Document Type Hints ---

const DOCUMENT_TYPE_HINTS: Record<string, string> = {
  cartella_clinica: `ISTRUZIONI SPECIFICHE PER CARTELLA CLINICA:
STRUTTURA ATTESA: Foglio di accettazione → Anamnesi → Esame obiettivo → Diario medico/infermieristico → Descrizione operatoria → Cartella anestesiologica → Esami → Lettera di dimissione.
CAMPI CRITICI DA ESTRARRE:
- Dati di ingresso: diagnosi COMPLETA, parametri vitali (PA, FC, SpO2, T°), peso, altezza, allergie
- Descrizione operatoria: testo INTEGRALE (tipo intervento, operatori, tecnica, durata, materiali/protesi, complicanze intraop)
- Cartella anestesiologica: ASA score, tipo anestesia, farmaci, parametri intraop
- Diario medico: SOLO complicanze, peggioramenti, eventi avversi, allarmi — NON la routine quotidiana ("paziente stabile, riposo a letto")
- Esami: TUTTI i valori con unità di misura e range di riferimento
- Dimissione: diagnosi dimissione completa, terapia domiciliare (farmaco, dose, via, frequenza), follow-up, prognosi
ERRORI COMUNI: Saltare valori di laboratorio in tabelle, ignorare annotazioni manoscritte a margine, perdere la cartella anestesiologica.
COSA NON ESTRARRE: Routine quotidiana del diario infermieristico (pasti, igiene, posizionamento), firme senza contenuto clinico.`,

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
ERRORI COMUNI: Aggregare più voci perdendo dettaglio importi, inventare importi non leggibili.`,

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
}): string {
  const { documentText, fileName, documentType, chunkIndex, totalChunks, documentName, pageRange } = params;

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

  return `${chunkContext}${typeHintBlock ? `${typeHintBlock}\n` : ''}DOCUMENTO: ${fileName}
TIPO DOCUMENTO: ${documentType}

NOTA: Il testo contiene marker [PAGE_START:N] e [PAGE_END:N] che delimitano le pagine del documento.
Usa questi marker per determinare i numeri di pagina (sourcePages) di ciascun evento.
Per sourceText, riporta una frase chiave ESATTA (max 200 caratteri) dal testo OCR che ancora l'evento.

--- INIZIO TESTO DOCUMENTO ---
${documentText}
--- FINE TESTO DOCUMENTO ---

Estrai TUTTI gli eventi clinici dal documento sopra. Politica ZERO DISCARD. Espandi abbreviazioni.
Per OGNI evento compila PRIMA il campo extraction_reasoning (perché lo estrai e dove lo hai trovato), POI i campi dati.
sourceText breve (max 200 char, citazione ESATTA dal testo), sourcePages obbligatori.`;
}
