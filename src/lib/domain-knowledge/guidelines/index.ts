export type { GuidelineContent } from './types';

export { AIOM_ONCOLOGIA } from './aiom-oncologia';
export { SIOT_ORTOPEDIA } from './siot-ortopedia';
export { SIGO_OSTETRICIA } from './sigo-ostetricia';
export { SIAARTI_ANESTESIA } from './siaarti-anestesia';
export { SNLG_INFEZIONI } from './snlg-infezioni';
export { ERRORE_DIAGNOSTICO_GUIDELINES } from './errore-diagnostico';

import type { GuidelineContent } from './types';
import { AIOM_ONCOLOGIA } from './aiom-oncologia';
import { SIOT_ORTOPEDIA } from './siot-ortopedia';
import { SIGO_OSTETRICIA } from './sigo-ostetricia';
import { SIAARTI_ANESTESIA } from './siaarti-anestesia';
import { SNLG_INFEZIONI } from './snlg-infezioni';
import { ERRORE_DIAGNOSTICO_GUIDELINES } from './errore-diagnostico';

/**
 * All clinical guidelines for the MedLav RAG system.
 * These will be ingested via the API once pgvector is enabled on Supabase.
 */
export const CLINICAL_GUIDELINES: readonly GuidelineContent[] = [
  AIOM_ONCOLOGIA,
  SIOT_ORTOPEDIA,
  SIGO_OSTETRICIA,
  SIAARTI_ANESTESIA,
  SNLG_INFEZIONI,
  ERRORE_DIAGNOSTICO_GUIDELINES,
] as const;

/**
 * Get guidelines applicable to a specific case type.
 */
export function getGuidelinesForCaseType(caseType: string): readonly GuidelineContent[] {
  return CLINICAL_GUIDELINES.filter((g) => g.caseTypes.includes(caseType as GuidelineContent['caseTypes'][number]));
}

/**
 * Format guideline content for LLM prompt injection.
 */
export function formatGuidelinesForPrompt(caseType: string): string {
  const guidelines = getGuidelinesForCaseType(caseType);
  if (guidelines.length === 0) return '';

  return guidelines
    .map((g) => `## ${g.title} (${g.source}, ${g.year})\n\n${g.content}`)
    .join('\n\n---\n\n');
}
