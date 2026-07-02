import type { CaseType } from '@/types';
import type { CaseTypeKnowledge } from './types';
import { logger } from '@/lib/logger';

export type { CaseTypeKnowledge, ReportSection, StandardTimeline, CausalNexusCriteria, TermDefinition } from './types';
export { CAUSAL_NEXUS_CRITERIA, formatCausalNexusForPrompt } from './causal-nexus';

import { RC_AUTO_KNOWLEDGE } from './case-type/rc-auto';
import { GENERICA_KNOWLEDGE } from './case-type/generica';

// rc-mvp fase 4: registry ridotto ai soli tipi raggiungibili dal modulo RC
// stragiudiziale. Gli altri 15 case-type + guidelines + golden-perizie +
// evaluation-frameworks sono parcheggiati in legacy/src/lib/domain-knowledge/.
// NB (decisione D3, port-list): oggi questa knowledge NON arriva ai prompt
// sezionali — il ricablaggio nel catalogo RC dichiarativo va fatto in fase 7
// e MISURATO sull'harness gold (pnpm gate:rc) prima di tenerlo.
const CASE_TYPE_KNOWLEDGE: Partial<Record<CaseType, CaseTypeKnowledge>> = {
  rc_auto: RC_AUTO_KNOWLEDGE,
  generica: GENERICA_KNOWLEDGE,
};

/**
 * Get domain knowledge for a specific case type (fallback: generica).
 * Il fallback è loggato: quando la knowledge verrà ricablata nei prompt (D3),
 * un degrado silenzioso a generica per una specialità clinica selezionabile
 * sarebbe invisibile e falserebbe il confronto col gate gold.
 */
export function getCaseTypeKnowledge(caseType: CaseType): CaseTypeKnowledge {
  const knowledge = CASE_TYPE_KNOWLEDGE[caseType];
  if (!knowledge) {
    logger.warn('domain-knowledge', `Nessuna knowledge per caseType "${caseType}" — fallback a generica`);
    return GENERICA_KNOWLEDGE;
  }
  return knowledge;
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
