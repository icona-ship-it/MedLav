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
2. **COPIA FEDELE**: La descrizione deve riportare FEDELMENTE il testo originale, non una rielaborazione o sintesi.
3. **DATE**: Usa formato YYYY-MM-DD. Se la data è imprecisa, usa il primo giorno del periodo (es. "Febbraio 2024" → "2024-02-01" con datePrecision "mese").
4. **ABBREVIAZIONI**: Espandi TUTTE le abbreviazioni mediche alla prima occorrenza nella descrizione. Es: "PA (pressione arteriosa) 140/85", "EV (endovena)".
5. **AFFIDABILITA**: Assegna confidence 80-100 per testo stampato chiaro, 50-79 per testo parzialmente leggibile, 10-49 per manoscritto o illeggibile.
6. **VERIFICA**: Imposta requiresVerification=true per: testo manoscritto, dati numerici incerti, date approssimate, informazioni contraddittorie.
7. **ANCORAGGIO AL TESTO SORGENTE**: Per OGNI evento, fornisci:
   - **sourceText**: la porzione ESATTA del testo OCR originale da cui hai estratto l'evento. Copia il testo verbatim, senza rielaborarlo. Deve essere sufficiente a verificare l'evento (minimo una frase significativa).
   - **sourcePages**: array con i numeri delle pagine del documento in cui si trova l'informazione. Usa i marker [PAGE_START:N] e [PAGE_END:N] nel testo per identificare le pagine.

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
Rispondi con un JSON valido contenente un array "events" e opzionalmente un array "abbreviations" con le abbreviazioni mediche trovate.`;
}

/**
 * Build the user prompt for a specific document text.
 */
export function buildExtractionUserPrompt(params: {
  documentText: string;
  fileName: string;
  documentType: string;
}): string {
  const { documentText, fileName, documentType } = params;

  return `Analizza il seguente documento medico ed estrai TUTTI gli eventi clinici.

DOCUMENTO: ${fileName}
TIPO DOCUMENTO: ${documentType}

NOTA: Il testo contiene marker [PAGE_START:N] e [PAGE_END:N] che delimitano le pagine del documento.
Usa questi marker per determinare i numeri di pagina (sourcePages) di ciascun evento.
Per sourceText, copia ESATTAMENTE la porzione di testo OCR originale da cui hai estratto l'evento.

--- INIZIO TESTO DOCUMENTO ---
${documentText}
--- FINE TESTO DOCUMENTO ---

Estrai TUTTI gli eventi clinici presenti. Ricorda: politica ZERO DISCARD, copia fedele, espandi abbreviazioni, sourceText e sourcePages obbligatori.`;
}
