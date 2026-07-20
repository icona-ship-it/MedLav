// Case types — rc-mvp: solo il tipo del modulo RC (rc_auto), il fallback
// (generica) e le specialità cliniche che un caso RC può assumere.
// I tipi previdenziali/INAIL/assicurativi vivono in legacy/ (pivot 2026-07-02).
export type CaseType =
  | 'ortopedica'
  | 'oncologica'
  | 'ostetrica'
  | 'anestesiologica'
  | 'infezione_nosocomiale'
  | 'errore_diagnostico'
  | 'rc_auto'
  | 'generica';

// rc-mvp: l'MVP fa SOLO la perizia RC stragiudiziale. I ruoli ctu/ctp sono
// parcheggiati con i loro cataloghi in legacy/.
export type CaseRole = 'stragiudiziale';

export type CaseStatus = 'bozza' | 'in_revisione' | 'definitivo' | 'archiviato';

// Event types
export type EventType =
  | 'visita'
  | 'esame'
  | 'diagnosi'
  | 'intervento'
  | 'terapia'
  | 'ricovero'
  | 'follow-up'
  | 'referto'
  | 'prescrizione'
  | 'consenso'
  | 'complicanza'
  | 'spesa_medica'
  | 'documento_amministrativo'
  | 'certificato'
  | 'altro';

export type DatePrecision = 'giorno' | 'mese' | 'anno' | 'sconosciuta';

export type SourceType =
  | 'cartella_clinica'
  | 'referto_controllo'
  | 'esame_strumentale'
  | 'esame_ematochimico'
  | 'altro';

// Anomaly types
export type AnomalyType =
  | 'ritardo_diagnostico'
  | 'gap_post_chirurgico'
  | 'gap_documentale'
  | 'complicanza_non_gestita'
  | 'consenso_non_documentato'
  | 'diagnosi_contraddittoria'
  | 'terapia_senza_followup'
  | 'valore_clinico_critico'
  | 'sequenza_temporale_violata';

export type AnomalySeverity = 'critica' | 'alta' | 'media' | 'bassa';

// Report types
export type ReportStatus = 'bozza' | 'in_revisione' | 'definitivo';

// Document processing
export type ProcessingStatus =
  | 'caricato'
  | 'in_coda'
  | 'ocr_in_corso'
  | 'estrazione_in_corso'
  | 'validazione_in_corso'
  | 'completato'
  | 'errore';

// Perizia metadata (formal court expert report data)
export interface PeriziaMetadata {
  // Patient data (optional — for formal perizia header. GDPR: never log these fields,
  // and use ONLY obviously-fictitious examples in comments/placeholders)
  patientFullName?: string;    // es. "Mario Esempi" (dato fittizio)
  patientDateOfBirth?: string; // es. "1980-01-01"
  patientAddress?: string;     // es. "via degli Esempi 1, 00000 Città"
  patientFiscalCode?: string;  // es. "XXXXXX00X00X000X" (formato 16 caratteri)
  patientPhone?: string;       // telefono paziente
  // Perito (carta intestata stragiudiziale — i nomi-campo ctu* sono storici)
  ctuName?: string;            // es. "Dott. Mario Esempi" (dato fittizio)
  ctuTitle?: string;           // "medico legale presso..." (qualifica nel conferimento)
  specialita?: string;         // specializzazioni per la carta intestata (una per riga / separate da ;)
  alboNumber?: string;         // n. iscrizione Albo per la carta intestata
  ctuEmail?: string;           // e-mail perito (carta intestata)
  ctuPec?: string;             // PEC perito (carta intestata)
  collaboratoreName?: string;  // ausiliario: es. "Dott.ssa Anna Esempi" (dato fittizio)
  collaboratoreTitle?: string; // ausiliario: "Specialista in Neurologia"
  parteRicorrente?: string;    // nome parte assistita
  parteResistente?: string;    // nome controparte (ASST, ospedale, assicurazione, etc.)
  dataIncarico?: string;       // data conferimento incarico
  dataOperazioni?: string;     // data visita/operazioni
  dataDeposito?: string;       // termine consegna elaborato
  // Data del sinistro/evento indice (feedback beta 2026-07-20): ancora i calcoli
  // medico-legali — gli eventi clinici ANTECEDENTI sono preesistenze e non
  // entrano nel periodo di malattia / ITT / scelta tabelle danno.
  dataSinistro?: string;       // data sinistro/evento indice (GG/MM/AAAA o ISO)
  speseMediche?: string;       // testo libero spese mediche
  esameObiettivo?: string;     // testo libero esame del paziente
  fondoSpese?: string;         // "Euro 1.800,00"
  // Anamnesi (perizie RC medico-legali — compilata dal perito, NON narrata dall'AI)
  ilFattoEStoriaClinica?: string;      // narrazione evento indice + iter clinico (testo del perito)
  anamnesiFamiliare?: string;          // anamnesi familiare
  anamnesiFisiologica?: string;        // anamnesi fisiologica (peso/altezza/BMI a parte)
  pesoKg?: number;                     // peso in kg (per BMI)
  altezzaCm?: number;                  // altezza in cm (per BMI)
  anamnesiPatologicaRemota?: string;   // patologie pregresse
  anamnesiPatologicaProssima?: string; // patologia attuale correlata all'evento
  anamnesiFarmacologica?: string;      // terapie/farmaci
  anamnesiLavorativa?: string;         // anamnesi lavorativa/occupazionale
  // Selettore sezioni report: id (canonici) delle sezioni OPZIONALI disattivate dal
  // perito. Assente/vuoto = tutte le sezioni. Le sezioni mandatory non sono mai escluse.
  excludedReportSections?: string[];
  // Ordine capitoli scelto dal perito (feedback beta 2026-07-20): id canonici in
  // sequenza. Assente/vuoto = ordine di catalogo. Intestazione ed epicrisi restano
  // comunque fisse agli estremi. Si applica alla prossima (ri)generazione.
  sectionOrder?: string[];
  // Modalità documentazione sanitaria (decisione medici 2026-06-12): default
  // 'selettiva' = narrativa clinica che VIRGOLETTA verbatim i passaggi
  // significativi (citazioni hard-verificate vs OCR) e parafrasa la routine;
  // 'integrale' = riproduzione verbatim completa (sentinella deterministica).
  docSanitariaMode?: 'selettiva' | 'integrale';
  // ── Tracking operativo retention (NON contenuto della perizia) ──
  // Scritti dal cron data-retention quando invia l'email di preavviso 30 giorni
  // prima dell'eliminazione automatica del caso archiviato (GDPR Art. 5(1)(e)).
  // Se il caso viene toccato/riaperto dopo il preavviso, il cron li azzera.
  retentionNoticeSentAt?: string;      // ISO timestamp invio preavviso
  retentionNoticeDeleteAfter?: string; // data eliminazione comunicata all'utente (ISO)
}

// API Response
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}
