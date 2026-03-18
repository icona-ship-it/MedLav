import { createHash } from 'crypto';
import { buildSectionSystemPrompt } from '@/services/synthesis/section-generator';
import type { CaseType, CaseRole } from '@/types';

/**
 * Compute a prompt version hash for sectional generation mode.
 * Concatenates all section system prompts and hashes the result.
 * This enables tracking which prompt combination generated a report.
 */
export function computeSectionalPromptVersion(params: {
  caseType: CaseType;
  caseRole: CaseRole;
  caseTypes?: CaseType[];
  sectionIds: string[];
}): string {
  const { caseType, caseRole, caseTypes, sectionIds } = params;

  // Build a representative system prompt for hashing
  // Use a minimal spec for each section to capture the prompt template
  const promptParts = sectionIds.map((id) =>
    buildSectionSystemPrompt({
      spec: {
        id,
        title: id,
        maxTokens: 0,
        dataSources: [],
        contextMaxChars: 0,
        needsOcr: false,
        promptDirective: '',
      },
      caseRole,
      caseType,
      caseTypes,
      hasOcrText: false,
    }),
  );

  const combined = promptParts.join('\n---\n');
  const hash = createHash('sha256').update(combined).digest('hex');
  return hash.slice(0, 12);
}
