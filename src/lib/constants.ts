/**
 * Shared constants and label mappings used across the application.
 * Single source of truth — import from here, never duplicate.
 */

// --- Case Types ---

export const CASE_TYPES = [
  { value: 'ortopedica', label: 'Malasanità Ortopedica' },
  { value: 'oncologica', label: 'Ritardo Diagnostico Oncologico' },
  { value: 'ostetrica', label: 'Errore Ostetrico' },
  { value: 'anestesiologica', label: 'Errore Anestesiologico' },
  { value: 'infezione_nosocomiale', label: 'Infezione Nosocomiale' },
  { value: 'errore_diagnostico', label: 'Errore Diagnostico' },
  { value: 'generica', label: 'Responsabilità Professionale Generica' },
] as const;

export const caseTypeLabels: Record<string, string> = Object.fromEntries(
  CASE_TYPES.map((t) => [t.value, t.label]),
);

// --- Case Roles ---

export const CASE_ROLES = [
  { value: 'ctu', label: 'CTU - Consulente Tecnico d\'Ufficio' },
  { value: 'ctp', label: 'CTP - Consulente Tecnico di Parte' },
  { value: 'stragiudiziale', label: 'Perito Stragiudiziale' },
] as const;

// --- Case Status ---

export const statusConfig: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' | 'outline' }> = {
  bozza: { label: 'Bozza', variant: 'secondary' },
  in_revisione: { label: 'In Revisione', variant: 'warning' },
  definitivo: { label: 'Definitivo', variant: 'success' },
  archiviato: { label: 'Archiviato', variant: 'outline' },
};

// --- Event Types ---

export const EVENT_TYPES = [
  { value: 'visita', label: 'Visita' },
  { value: 'esame', label: 'Esame' },
  { value: 'diagnosi', label: 'Diagnosi' },
  { value: 'intervento', label: 'Intervento' },
  { value: 'terapia', label: 'Terapia' },
  { value: 'ricovero', label: 'Ricovero' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'referto', label: 'Referto' },
  { value: 'prescrizione', label: 'Prescrizione' },
  { value: 'consenso', label: 'Consenso' },
  { value: 'complicanza', label: 'Complicanza' },
  { value: 'altro', label: 'Altro' },
] as const;

// --- Source Types ---

export const SOURCE_TYPES = [
  { value: 'cartella_clinica', label: 'Cartella Clinica' },
  { value: 'referto_controllo', label: 'Referto Controllo' },
  { value: 'esame_strumentale', label: 'Esame Strumentale' },
  { value: 'esame_ematochimico', label: 'Esami Ematochimici' },
  { value: 'altro', label: 'Altro' },
] as const;

export const sourceLabels: Record<string, string> = Object.fromEntries(
  SOURCE_TYPES.map((t) => [t.value, t.label]),
);

/**
 * Source labels for export documents (DOCX/HTML) with prefix notation.
 */
export const sourceLabelsExport: Record<string, string> = {
  cartella_clinica: 'FONTE A - Cartella Clinica',
  referto_controllo: 'FONTE B - Referto Controllo',
  esame_strumentale: 'FONTE C - Esame Strumentale',
  esame_ematochimico: 'FONTE D - Esami Ematochimici',
  altro: 'Altro',
};

// --- Anomaly Types ---

export const anomalyTypeLabels: Record<string, string> = {
  ritardo_diagnostico: 'Ritardo Diagnostico',
  gap_post_chirurgico: 'Gap Post-Chirurgico',
  gap_documentale: 'Gap Documentale',
  complicanza_non_gestita: 'Complicanza Non Gestita',
  consenso_non_documentato: 'Consenso Non Documentato',
  diagnosi_contraddittoria: 'Diagnosi Contraddittoria',
  terapia_senza_followup: 'Terapia Senza Follow-up',
};

// --- Processing Status ---

export const processingLabels: Record<string, string> = {
  caricato: 'Caricato',
  in_coda: 'In attesa',
  ocr_in_corso: 'Lettura documenti',
  estrazione_in_corso: 'Analisi contenuto',
  validazione_in_corso: 'Controllo qualità',
  completato: 'Completato',
  errore: 'Errore',
};
