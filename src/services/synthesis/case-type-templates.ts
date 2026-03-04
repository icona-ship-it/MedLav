import type { CaseType } from '@/types';
import { getCaseTypeKnowledge, formatReportSectionsForPrompt, formatTimelinesForPrompt } from '@/lib/domain-knowledge';

/**
 * Build the case-type-specific report structure directive for LLM prompt injection.
 * Includes: specialized sections, standard timelines, synthesis guidance.
 */
export function buildCaseTypeDirective(caseType: CaseType): string {
  const knowledge = getCaseTypeKnowledge(caseType);
  const sectionsText = formatReportSectionsForPrompt(caseType);
  const timelinesText = formatTimelinesForPrompt(caseType);

  return `## STRUTTURA OBBLIGATORIA DEL REPORT

${sectionsText}

${timelinesText ? `\n${timelinesText}\n` : ''}
## GUIDA SPECIFICA PER QUESTO TIPO DI CASO

${knowledge.synthesisGuidance}

## PATTERN DI ANOMALIA COMUNI PER QUESTO TIPO DI CASO
Verifica la presenza di queste criticità frequenti:
${knowledge.commonAnomalyPatterns.map((p) => `- ${p}`).join('\n')}`;
}

/**
 * Get the list of section IDs expected for a case type (for validation).
 */
export function getExpectedSectionIds(caseType: CaseType): string[] {
  const knowledge = getCaseTypeKnowledge(caseType);
  return knowledge.reportSections.map((s) => s.id);
}

/**
 * Get section titles for a case type (for validation pattern matching).
 */
export function getExpectedSectionPatterns(caseType: CaseType): Array<{ name: string; pattern: RegExp }> {
  const knowledge = getCaseTypeKnowledge(caseType);

  return knowledge.reportSections.map((s) => {
    // Build a flexible regex from the section title
    const words = s.title
      .replace(/['']/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);

    const pattern = new RegExp(words.join('\\s+'), 'i');
    return { name: s.title, pattern };
  });
}
