import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import type { DetectedAnomaly } from '../validation/anomaly-detector';
import type { MissingDocument } from '../validation/missing-doc-detector';
import type { MedicoLegalCalculation } from '../calculations/medico-legal-calc';
import type { ImageAnalysisResult } from '../image-analysis/diagnostic-image-analyzer';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { DocumentSummary } from './document-summarizer';

/**
 * Parametri condivisi del path di generazione SEZIONALE del report
 * (section-catalog → section-generator, orchestrato da generate-report.ts).
 *
 * rc-mvp fase 6: il vecchio path monolitico (generateSynthesis,
 * generateSynthesisChronology, generateSynthesisSummary, shouldSplitSynthesis)
 * era codice non più invocato dalla pipeline ed è stato rimosso; la versione
 * completa vive su main e nel tag full-app-2026-07-02.
 */
export interface SynthesisParams {
  caseType: CaseType;
  caseTypes?: CaseType[];
  caseRole: CaseRole;
  patientInitials: string | null;
  events: ConsolidatedEvent[];
  anomalies: DetectedAnomaly[];
  missingDocuments: MissingDocument[];
  calculations?: MedicoLegalCalculation[];
  imageAnalysis?: ImageAnalysisResult[];
  caseTypeLabel?: string;
  expertRole?: string;
  periziaMetadata?: PeriziaMetadata;
  /** Original OCR text for faithful transcription in report */
  documentsOcrText?: DocumentOcrContext[];
  /** Per-document AI summaries for large cases (map-reduce mode) */
  documentSummaries?: DocumentSummary[];
}
