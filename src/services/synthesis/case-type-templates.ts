import type { CaseType } from '@/types';
import {
  getCaseTypeKnowledge,
  getCombinedCaseTypeKnowledge,
  formatReportSectionsForPrompt,
  formatTimelinesForPrompt,
  formatCombinedReportSectionsForPrompt,
  formatCombinedTimelinesForPrompt,
} from '@/lib/domain-knowledge';

/**
 * Build the case-type-specific report structure directive for LLM prompt injection.
 * Includes: specialized sections, standard timelines, synthesis guidance.
 * Supports single CaseType or an array of CaseType[] for multi-type cases.
 */
export function buildCaseTypeDirective(caseTypes: CaseType | CaseType[]): string {
  const types = Array.isArray(caseTypes) ? caseTypes : [caseTypes];

  if (types.length === 1) {
    const knowledge = getCaseTypeKnowledge(types[0]);
    const sectionsText = formatReportSectionsForPrompt(types[0]);
    const timelinesText = formatTimelinesForPrompt(types[0]);

    return `## STRUTTURA OBBLIGATORIA DEL REPORT

${sectionsText}

${timelinesText ? `\n${timelinesText}\n` : ''}
## GUIDA SPECIFICA PER QUESTO TIPO DI CASO

${knowledge.synthesisGuidance}

## PATTERN DI ANOMALIA COMUNI PER QUESTO TIPO DI CASO
Verifica la presenza di queste criticità frequenti:
${knowledge.commonAnomalyPatterns.map((p) => `- ${p}`).join('\n')}`;
  }

  // Multi-type: combine knowledge from all selected types
  const combined = getCombinedCaseTypeKnowledge(types);
  const sectionsText = formatCombinedReportSectionsForPrompt(types);
  const timelinesText = formatCombinedTimelinesForPrompt(types);

  return `## STRUTTURA OBBLIGATORIA DEL REPORT (CASO MULTI-TIPOLOGIA)

Questo caso combina le seguenti tipologie: ${types.join(', ')}.
Il report deve integrare le prospettive di tutte le tipologie selezionate.

${sectionsText}

${timelinesText ? `\n${timelinesText}\n` : ''}
## GUIDA SPECIFICA PER QUESTO TIPO DI CASO

${combined.synthesisGuidance}

## PATTERN DI ANOMALIA COMUNI PER QUESTO TIPO DI CASO
Verifica la presenza di queste criticità frequenti:
${combined.commonAnomalyPatterns.map((p) => `- ${p}`).join('\n')}`;
}

/**
 * Get the list of section IDs expected for a case type (for validation).
 * Supports single CaseType or CaseType[] for multi-type cases.
 */
export function getExpectedSectionIds(caseTypes: CaseType | CaseType[]): string[] {
  const types = Array.isArray(caseTypes) ? caseTypes : [caseTypes];
  if (types.length === 1) {
    const knowledge = getCaseTypeKnowledge(types[0]);
    return knowledge.reportSections.map((s) => s.id);
  }
  const combined = getCombinedCaseTypeKnowledge(types);
  return combined.reportSections.map((s) => s.id);
}

/**
 * Get section titles for a case type (for validation pattern matching).
 * Supports single CaseType or CaseType[] for multi-type cases.
 */
export function getExpectedSectionPatterns(caseTypes: CaseType | CaseType[]): Array<{ name: string; pattern: RegExp }> {
  const types = Array.isArray(caseTypes) ? caseTypes : [caseTypes];
  const knowledge = types.length === 1
    ? getCaseTypeKnowledge(types[0])
    : getCombinedCaseTypeKnowledge(types);

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
