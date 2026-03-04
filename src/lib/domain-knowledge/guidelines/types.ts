import type { CaseType } from '@/types';

export interface GuidelineContent {
  readonly title: string;
  readonly source: string;
  readonly year: number;
  readonly caseTypes: readonly CaseType[];
  readonly content: string;
}
