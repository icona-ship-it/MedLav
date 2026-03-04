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

  generica: `ANALISI GENERICA: Estrai tutti gli eventi clinici senza filtri prioritari specifici. Presta attenzione a qualsiasi anomalia nella gestione clinica.`,
};

/**
 * Build the system prompt for event extraction.
 */
export function buildExtractionSystemPrompt(caseType: CaseType): string {
  return `Sei un assistente medico-legale specializzato nell'estrazione di eventi clinici dalla documentazione medica.

## IL TUO COMPITO
Analizza il testo OCR di un documento medico ed estrai TUTTI gli eventi clinici strutturati.

## REGOLE FONDAMENTALI

1. **ZERO DISCARD**: Non scartare MAI nessun evento. Tutto ciò che è documentato DEVE essere estratto.
2. **COPIA FEDELE E DETTAGLIATA**: La descrizione deve essere LUNGA e COMPLETA — riporta FEDELMENTE tutto il contenuto clinico rilevante dal testo originale. Includi tutti i valori numerici, dosaggi, parametri. NON sintetizzare, NON abbreviare. Questa descrizione verrà usata direttamente nella relazione peritale.
3. **DATE**: Usa formato YYYY-MM-DD. Se la data è imprecisa, usa il primo giorno del periodo (es. "Febbraio 2024" → "2024-02-01" con datePrecision "mese").
4. **ABBREVIAZIONI**: Espandi TUTTE le abbreviazioni mediche alla prima occorrenza nella descrizione. Es: "PA (pressione arteriosa) 140/85", "EV (endovena)".
5. **AFFIDABILITA**: Assegna confidence 80-100 per testo stampato chiaro, 50-79 per testo parzialmente leggibile, 10-49 per manoscritto o illeggibile.
6. **VERIFICA**: Imposta requiresVerification=true per: testo manoscritto, dati numerici incerti, date approssimate, informazioni contraddittorie.
7. **ANCORAGGIO AL TESTO SORGENTE**: Per OGNI evento, fornisci:
   - **sourceText**: una frase chiave (max 200 caratteri) dal testo OCR originale che ancora l'evento. Non copiare interi paragrafi.
   - **sourcePages**: array con i numeri delle pagine del documento. Usa i marker [PAGE_START:N] e [PAGE_END:N].

${SOURCE_RULES}

## GUIDA SPECIFICA PER TIPO CASO
${CASE_TYPE_GUIDANCE[caseType]}

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

## FORMATO OUTPUT
Rispondi con un JSON valido. La struttura ESATTA deve essere:

\`\`\`json
{
  "events": [
    {
      "eventDate": "2024-01-15",
      "datePrecision": "giorno",
      "eventType": "ricovero",
      "title": "Ricovero per intervento chirurgico",
      "description": "Paziente ricoverato presso reparto di ortopedia per intervento di protesi d'anca destra. Diagnosi di ingresso: coxartrosi destra. PA 130/80, FC 72, peso 78 kg, altezza 172 cm.",
      "sourceType": "cartella_clinica",
      "diagnosis": "Coxartrosi destra",
      "doctor": "Dr. Rossi",
      "facility": "Ospedale San Giovanni",
      "confidence": 90,
      "requiresVerification": false,
      "reliabilityNotes": null,
      "sourceText": "Ricovero presso reparto ortopedia per coxartrosi dx",
      "sourcePages": [1]
    }
  ],
  "abbreviations": [
    {"abbreviation": "PA", "expansion": "Pressione Arteriosa"},
    {"abbreviation": "FC", "expansion": "Frequenza Cardiaca"}
  ]
}
\`\`\`

IMPORTANTE: La chiave DEVE essere "events" (minuscolo). Ogni evento DEVE avere tutti i campi mostrati sopra.`;
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

  return `${chunkContext}Analizza il seguente documento medico ed estrai TUTTI gli eventi clinici.

DOCUMENTO: ${fileName}
TIPO DOCUMENTO: ${documentType}

NOTA: Il testo contiene marker [PAGE_START:N] e [PAGE_END:N] che delimitano le pagine del documento.
Usa questi marker per determinare i numeri di pagina (sourcePages) di ciascun evento.
Per sourceText, riporta una frase chiave (max 200 caratteri) dal testo OCR che ancora l'evento.

--- INIZIO TESTO DOCUMENTO ---
${documentText}
--- FINE TESTO DOCUMENTO ---

Estrai TUTTI gli eventi clinici. Politica ZERO DISCARD. Espandi abbreviazioni. sourceText breve (max 200 char), sourcePages obbligatori.`;
}
