import type { CaseType, CaseRole } from '@/types';

export interface CausalNexusCriteria {
  readonly name: string;
  readonly description: string;
  readonly legalReferences: readonly string[];
  readonly whenToApply: string;
}

export interface StandardTimeline {
  readonly procedure: string;
  readonly expectedFollowUpDays: number;
  readonly expectedRecoveryDays: number;
  readonly criticalDelayThresholdDays: number;
  readonly source: string;
}

export interface EvaluationFramework {
  readonly name: string;
  readonly description: string;
  readonly applicableCaseTypes: readonly CaseType[];
  readonly criteria: readonly string[];
  readonly source: string;
}

export interface ReportSection {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requiredForRoles: readonly CaseRole[];
  readonly wordRange: { readonly min: number; readonly max: number };
}

export interface TermDefinition {
  readonly term: string;
  readonly definition: string;
}

export interface CaseTypeKnowledge {
  readonly caseType: CaseType;
  readonly reportSections: readonly ReportSection[];
  readonly standardTimelines: readonly StandardTimeline[];
  readonly commonAnomalyPatterns: readonly string[];
  readonly evaluationFrameworks: readonly string[];
  readonly keyTerminology: readonly TermDefinition[];
  readonly synthesisGuidance: string;
}
