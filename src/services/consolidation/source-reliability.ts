/**
 * Source reliability hierarchy for medico-legal evaluation.
 * Higher score = more authoritative source.
 */

export const SOURCE_RELIABILITY_SCORES: Record<string, number> = {
  cartella_clinica: 100,
  esame_strumentale: 90,
  esame_ematochimico: 90,
  referto_controllo: 70,
  altro: 50,
};

export type ReliabilityLabel = 'alta' | 'media' | 'bassa';

/**
 * Get the reliability score for a source type.
 */
export function getSourceReliabilityScore(sourceType: string): number {
  return SOURCE_RELIABILITY_SCORES[sourceType] ?? SOURCE_RELIABILITY_SCORES.altro;
}

/**
 * Get a human-readable reliability label from a score.
 */
export function getReliabilityLabel(score: number): ReliabilityLabel {
  if (score >= 80) return 'alta';
  if (score >= 60) return 'media';
  return 'bassa';
}
