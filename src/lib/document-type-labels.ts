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
