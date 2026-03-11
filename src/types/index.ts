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
  | 'infortuni'
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
  tribunale?: string;          // "Tribunale Ordinario di Brescia"
  sezione?: string;            // "Sezione Centrale Civile"
  rgNumber?: string;           // "10965/2025"
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
