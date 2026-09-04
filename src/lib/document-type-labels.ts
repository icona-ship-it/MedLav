/**
 * Human-readable Italian labels for document types — single source of truth.
 * Used by the verbatim documentazione-sanitaria assembler (report-assembler +
 * the deterministic renderer) and anywhere a document type is shown to the perito.
 *
 * Keys must stay in sync with the classifier taxonomy (VALID_DOCUMENT_TYPES in
 * document-classifier.ts) and the `documents.document_type` enum.
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'Cartella Clinica',
  referto_specialistico: 'Referto Specialistico',
  esame_strumentale: 'Esame Strumentale',
  esame_laboratorio: 'Esame di Laboratorio',
  lettera_dimissione: 'Lettera di Dimissione',
  certificato: 'Certificato',
  perizia_precedente: 'Perizia Precedente',
  spese_mediche: 'Spese Mediche',
  memoria_difensiva: 'Memoria Difensiva',
  perizia_ctp: 'Consulenza Tecnica di Parte (CTP)',
  perizia_ctu: 'Consulenza Tecnica d\'Ufficio (CTU)',
  altro: 'Altro Documento',
};

/** Label for a document type, with a safe fallback to the raw type string. */
export function getDocumentTypeLabel(documentType: string): string {
  return DOCUMENT_TYPE_LABELS[documentType] ?? documentType;
}

/**
 * Document types that are reproduced ELSEWHERE in the report (atti / perizie /
 * spese) and therefore excluded from the clinical "documentazione sanitaria".
 * Mirrors EXCLUDED_FROM_MEDICAL in section-generator (the LLM path) — kept here as
 * a lightweight, client-safe constant for the deterministic verbatim renderer.
 */
export const EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA: ReadonlySet<string> = new Set([
  'memoria_difensiva',
  'documento_amministrativo',
  'certificato',
  'perizia_precedente',
  'perizia_ctp',
  'perizia_ctu',
  'spese_mediche',
]);

/** Motivo (per il medico) per cui un tipo escluso NON viene trascritto.
 * Stessa sorgente del Set: un test verifica che le chiavi coincidano. */
export const EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA_REASONS: Readonly<Record<string, string>> = {
  memoria_difensiva: 'atto giudiziario, non documentazione sanitaria',
  documento_amministrativo: 'documento amministrativo, non documentazione sanitaria',
  certificato: 'certificato: i suoi dati entrano nella cronologia degli eventi, il testo non è riprodotto',
  perizia_precedente: 'atto peritale, non documentazione sanitaria',
  perizia_ctp: 'atto peritale, non documentazione sanitaria',
  perizia_ctu: 'atto peritale, non documentazione sanitaria',
  spese_mediche: 'giustificativo di spesa, non documentazione sanitaria',
};
