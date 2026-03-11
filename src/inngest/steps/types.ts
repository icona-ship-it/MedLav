import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';

export interface CaseMetadata {
  caseId: string;
  caseType: CaseType;
  caseTypes: CaseType[];
  caseRole: CaseRole;
  patientInitials: string | null;
  userId: string;
  periziaMetadata?: PeriziaMetadata;
}

export interface DocumentInfo {
  id: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  documentType: string;
}

export interface OcrResult {
  documentId: string;
  fileName: string;
  documentType: string;
  fullText: string;
  pageCount: number;
  averageConfidence: number;
}

export interface ExtractionResult {
  documentId: string;
}

export interface ConsolidationStepResult {
  allEvents: import('@/services/consolidation/event-consolidator').ConsolidatedEvent[];
  newEventsCount: number;
}

export interface SynthesisStepResult {
  reportId?: string;
  reportVersion: number;
  wordCount: number;
}
