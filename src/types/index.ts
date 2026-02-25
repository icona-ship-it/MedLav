// Case types
export type CaseType =
  | 'ortopedica'
  | 'oncologica'
  | 'ostetrica'
  | 'anestesiologica'
  | 'infezione_nosocomiale'
  | 'errore_diagnostico'
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
  | 'terapia_senza_followup';

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
