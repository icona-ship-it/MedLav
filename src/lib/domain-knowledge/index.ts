import type { CaseType } from '@/types';
import type { CaseTypeKnowledge } from './types';

export type { CaseTypeKnowledge, ReportSection, StandardTimeline, CausalNexusCriteria, EvaluationFramework, TermDefinition } from './types';
export { CAUSAL_NEXUS_CRITERIA, formatCausalNexusForPrompt } from './causal-nexus';
export { EVALUATION_FRAMEWORKS, formatEvaluationFrameworksForPrompt } from './evaluation-frameworks';
export { GOLDEN_PERIZIE, getGoldenPerizia } from './golden-perizie';

import { ORTOPEDICA_KNOWLEDGE } from './case-type/ortopedica';
import { ONCOLOGICA_KNOWLEDGE } from './case-type/oncologica';
import { OSTETRICA_KNOWLEDGE } from './case-type/ostetrica';
import { ANESTESIOLOGICA_KNOWLEDGE } from './case-type/anestesiologica';
import { INFEZIONE_NOSOCOMIALE_KNOWLEDGE } from './case-type/infezione-nosocomiale';
import { ERRORE_DIAGNOSTICO_KNOWLEDGE } from './case-type/errore-diagnostico';
import { RC_AUTO_KNOWLEDGE } from './case-type/rc-auto';
import { PREVIDENZIALE_KNOWLEDGE } from './case-type/previdenziale';
import { INFORTUNI_KNOWLEDGE } from './case-type/infortuni';
import { GENERICA_KNOWLEDGE } from './case-type/generica';

const CASE_TYPE_KNOWLEDGE: Record<CaseType, CaseTypeKnowledge> = {
  ortopedica: ORTOPEDICA_KNOWLEDGE,
  oncologica: ONCOLOGICA_KNOWLEDGE,
  ostetrica: OSTETRICA_KNOWLEDGE,
  anestesiologica: ANESTESIOLOGICA_KNOWLEDGE,
  infezione_nosocomiale: INFEZIONE_NOSOCOMIALE_KNOWLEDGE,
  errore_diagnostico: ERRORE_DIAGNOSTICO_KNOWLEDGE,
  rc_auto: RC_AUTO_KNOWLEDGE,
  previdenziale: PREVIDENZIALE_KNOWLEDGE,
  infortuni: INFORTUNI_KNOWLEDGE,
  generica: GENERICA_KNOWLEDGE,
};

/**
 * Get domain knowledge for a specific case type.
 */
export function getCaseTypeKnowledge(caseType: CaseType): CaseTypeKnowledge {
  return CASE_TYPE_KNOWLEDGE[caseType];
}

/**
 * Format report section titles as a structured template for LLM prompt injection.
 */
export function formatReportSectionsForPrompt(caseType: CaseType): string {
  const knowledge = getCaseTypeKnowledge(caseType);
  return knowledge.reportSections
    .map((s, i) => {
      const wordInfo = s.wordRange.max > 0
        ? ` (${s.wordRange.min}-${s.wordRange.max} parole)`
        : ' (senza limiti di parole)';
      return `### PARTE ${i + 1} — ${s.title.toUpperCase()}${wordInfo}\n${s.description}`;
    })
    .join('\n\n');
}

/**
 * Format standard timelines for a case type as prompt text.
 */
export function formatTimelinesForPrompt(caseType: CaseType): string {
  const knowledge = getCaseTypeKnowledge(caseType);
  if (knowledge.standardTimelines.length === 0) return '';

  const lines = knowledge.standardTimelines.map((t) =>
    `- ${t.procedure}: follow-up atteso entro ${t.expectedFollowUpDays}gg, ` +
    `recupero atteso ${t.expectedRecoveryDays}gg, ` +
    `ritardo critico oltre ${t.criticalDelayThresholdDays}gg (${t.source})`,
  );
  return `## TEMPISTICHE DI RIFERIMENTO\n${lines.join('\n')}`;
}

/**
 * Format key terminology for a case type as prompt text.
 */
export function formatTerminologyForPrompt(caseType: CaseType): string {
  const knowledge = getCaseTypeKnowledge(caseType);
  if (knowledge.keyTerminology.length === 0) return '';

  const lines = knowledge.keyTerminology.map((t) => `- **${t.term}**: ${t.definition}`);
  return `## TERMINOLOGIA CHIAVE\n${lines.join('\n')}`;
}
