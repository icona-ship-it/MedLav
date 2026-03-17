import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';

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
  ocrPages?: number;
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
  usage?: TokenUsage;
}

export interface ClassificationStepResult {
  documentId: string;
  oldType: string;
  newType: string;
  confidence: number;
  reasoning: string;
}

/**
 * OCR context for a single document, used to pass original text
 * to synthesis for faithful transcription.
 */
export interface DocumentOcrContext {
  documentId: string;
  fileName: string;
  documentType: string;
  pages: Array<{ pageNumber: number; ocrText: string }>;
  totalChars: number;
}
