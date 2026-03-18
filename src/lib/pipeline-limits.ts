/**
 * Pipeline limits and input validation for document processing.
 * Prevents processing overload with too many documents.
 */

export const PIPELINE_LIMITS = {
  /** Hard limit — reject processing above this */
  MAX_DOCUMENTS: 500,
  /** Soft limit — warn user but allow processing */
  WARN_DOCUMENTS: 100,
  /** Max single file size in MB */
  MAX_FILE_SIZE_MB: 100,
} as const;

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
}

/**
 * Validate case parameters before starting the processing pipeline.
 * Returns validation result with optional error (hard block) and warnings (soft).
 */
export function validateCaseForProcessing(params: {
  documentCount: number;
}): ValidationResult {
  const { documentCount } = params;
  const warnings: string[] = [];

  if (documentCount > PIPELINE_LIMITS.MAX_DOCUMENTS) {
    return {
      valid: false,
      error: `Troppi documenti (${documentCount}). Il limite massimo è ${PIPELINE_LIMITS.MAX_DOCUMENTS} documenti per caso. Rimuovi alcuni documenti e riprova.`,
      warnings: [],
    };
  }

  if (documentCount > PIPELINE_LIMITS.WARN_DOCUMENTS) {
    warnings.push(
      `Caso con ${documentCount} documenti — l'elaborazione potrebbe richiedere più tempo del solito.`,
    );
  }

  return { valid: true, warnings };
}
