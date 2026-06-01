// Case types
export type CaseType =
  | 'ortopedica'
  | 'oncologica'
  | 'ostetrica'
  | 'anestesiologica'
  | 'infezione_nosocomiale'
  | 'errore_diagnostico'
  | 'rc_auto'
  | 'previdenziale'
  | 'previdenziale_dlgs62'
  | 'previdenziale_inv_civile'
  | 'infortuni'
  | 'inail_malattia_prof'
  | 'inail_infortunio'
  | 'perizia_assicurativa'
  | 'analisi_spese_mediche'
  | 'opinione_prognostica'
  | 'generica';

export type CaseRole = 'ctu' | 'ctp' | 'stragiudiziale';

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
  // Patient data (optional — for formal perizia header. GDPR: never log these fields)
  patientFullName?: string;    // "Massarenti Daniela"
  patientDateOfBirth?: string; // "1945-02-02"
  patientAddress?: string;     // "Via Todeschini 37, 37126 Verona"
  patientFiscalCode?: string;  // "MSSDNL45B42A944J"
  patientPhone?: string;       // telefono paziente
  // Court/proceeding data
  tribunale?: string;          // "Tribunale Ordinario di Brescia"
  sezione?: string;            // "Sezione Centrale Civile"
  rgNumber?: string;           // "10965/2025"
  tipoProcedimento?: string;   // "Accertamento tecnico preventivo (ex art. 696 bis c.p.c.)"
  judgeName?: string;           // "Dott. Raffaele Del Porto"
  ctuName?: string;            // "Dott. Nicola Pigaiani"
  ctuTitle?: string;           // "Specialista in Medicina Legale"
  collaboratoreName?: string;  // "Dott. Franco Lavini"
  collaboratoreTitle?: string; // "Specialista in Ortopedia e Traumatologia"
  ctpRicorrente?: string;      // "Dott.ssa Sarah Nalin"
  ctpResistente?: string;      // "Dott. Lorenzo Micheli"
  parteRicorrente?: string;    // nome parte ricorrente
  parteResistente?: string;    // nome parte resistente (ASST, ospedale, etc.)
  dataIncarico?: string;       // data conferimento incarico
  dataOperazioni?: string;     // data inizio operazioni peritali
  dataDeposito?: string;       // termine deposito relazione
  quesiti?: string[];          // array di quesiti del giudice
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
