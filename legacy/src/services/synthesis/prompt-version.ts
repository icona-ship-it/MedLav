import { createHash } from 'crypto';
import { buildSynthesisSystemPrompt } from './synthesis-prompts';
import type { CaseType, CaseRole } from '@/types';

/**
 * Compute a short hash of the synthesis prompt for versioning.
 * Changes when prompt text changes, enabling audit of which prompt generated which report.
 */
export function computePromptVersion(params: {
  caseType: CaseType;
  caseRole: CaseRole;
  caseTypes?: CaseType[];
}): string {
  const systemPrompt = buildSynthesisSystemPrompt({
    caseType: params.caseType,
    caseRole: params.caseRole,
    caseTypes: params.caseTypes,
  });
  const hash = createHash('sha256').update(systemPrompt).digest('hex');
  return hash.slice(0, 12);
}
