import type { CaseType } from '@/types';
import type { CaseTypeKnowledge, ReportSection, TermDefinition } from './types';

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

/**
 * Combine domain knowledge from multiple case types.
 * Uses primary type's structure, merges sections/timelines/anomalies from secondaries.
 * Deduplicates sections by id (primary wins).
 */
export function getCombinedCaseTypeKnowledge(caseTypes: CaseType[]): CaseTypeKnowledge {
  if (caseTypes.length === 0) return getCaseTypeKnowledge('generica');
  if (caseTypes.length === 1) return getCaseTypeKnowledge(caseTypes[0]);

  const knowledges = caseTypes.map(getCaseTypeKnowledge);
  const primary = knowledges[0];

  // Combine: use primary's structure, merge in sections from secondaries
  // Deduplicate sections by id (primary wins)
  const allSections: ReportSection[] = [...primary.reportSections];
  for (const k of knowledges.slice(1)) {
    for (const section of k.reportSections) {
      if (!allSections.some(s => s.id === section.id)) {
        // Insert specialty sections before 'elementi_rilievo' (last analytical section)
        const elementiIdx = allSections.findIndex(s => s.id === 'elementi_rilievo');
        if (elementiIdx >= 0) {
          allSections.splice(elementiIdx, 0, section);
        } else {
          allSections.push(section);
        }
      }
    }
  }

  return {
    caseType: primary.caseType,
    reportSections: allSections,
    standardTimelines: knowledges.flatMap(k => [...k.standardTimelines]),
    commonAnomalyPatterns: [...new Set(knowledges.flatMap(k => [...k.commonAnomalyPatterns]))],
    evaluationFrameworks: [...new Set(knowledges.flatMap(k => [...k.evaluationFrameworks]))],
    keyTerminology: deduplicateByTerm(knowledges.flatMap(k => [...k.keyTerminology])),
    synthesisGuidance: knowledges.map(k => k.synthesisGuidance).join('\n\n'),
  };
}

/**
 * Format report sections for combined multi-type knowledge.
 */
export function formatCombinedReportSectionsForPrompt(caseTypes: CaseType[]): string {
  const knowledge = getCombinedCaseTypeKnowledge(caseTypes);
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
 * Format standard timelines for combined multi-type knowledge.
 */
export function formatCombinedTimelinesForPrompt(caseTypes: CaseType[]): string {
  const knowledge = getCombinedCaseTypeKnowledge(caseTypes);
  if (knowledge.standardTimelines.length === 0) return '';

  const lines = knowledge.standardTimelines.map((t) =>
    `- ${t.procedure}: follow-up atteso entro ${t.expectedFollowUpDays}gg, ` +
    `recupero atteso ${t.expectedRecoveryDays}gg, ` +
    `ritardo critico oltre ${t.criticalDelayThresholdDays}gg (${t.source})`,
  );
  return `## TEMPISTICHE DI RIFERIMENTO\n${lines.join('\n')}`;
}

function deduplicateByTerm(terms: TermDefinition[]): TermDefinition[] {
  const seen = new Set<string>();
  return terms.filter(t => {
    if (seen.has(t.term)) return false;
    seen.add(t.term);
    return true;
  });
}
