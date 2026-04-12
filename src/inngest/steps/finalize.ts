import { createAdminClient } from '@/lib/supabase/admin';
import { sendReportReadyEmail } from '@/services/email/email-service';
import type { ExtractionResult, ConsolidationStepResult, SynthesisStepResult } from './types';
import type { DetectedAnomaly } from '@/services/validation/anomaly-detector';
import type { MissingDocument } from '@/services/validation/missing-doc-detector';
import type { PipelineCostSummary } from '@/services/cost-tracking/cost-calculator';
import { logger } from '@/lib/logger';

export interface PipelineWarning {
  step: string;
  severity: 'warning' | 'critical';
  message: string;
  failedCount?: number;
  totalCount?: number;
  failedItems?: string[];
}

interface FinalizeParams {
  caseId: string;
  userId: string;
  extractionResults: ExtractionResult[];
  consolidationResult: ConsolidationStepResult;
  anomalies: DetectedAnomaly[];
  missingDocs: MissingDocument[];
  synthesisResult: SynthesisStepResult;
  synthesisWordCount: number;
  pipelineCost?: PipelineCostSummary;
  pipelineWarnings?: PipelineWarning[];
}

/**
 * Step 8: Finalize — mark everything as completed, update case, write audit log.
 */
export async function finalizeStep(params: FinalizeParams): Promise<void> {
  const {
    caseId,
    userId,
    extractionResults,
    consolidationResult,
    anomalies,
    missingDocs,
    synthesisResult,
    synthesisWordCount,
    pipelineCost,
    pipelineWarnings = [],
  } = params;
  const supabase = createAdminClient();

  logger.info('pipeline', ` Step 8: Finalizing`);

  // Mark all processed documents as completed (batched for scalability)
  const docIds = extractionResults.map((r) => r.documentId);
  const BATCH_SIZE = 500;
  for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
    await supabase
      .from('documents')
      .update({
        processing_status: 'completato',
        updated_at: new Date().toISOString(),
      })
      .in('id', docIds.slice(i, i + BATCH_SIZE));
  }

  // Update case status and processing stage, clear generation progress, save pipeline warnings
  const { data: caseRow } = await supabase
    .from('cases')
    .select('perizia_metadata')
    .eq('id', caseId)
    .single();
  const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
  const cleanedMeta = Object.fromEntries(
    Object.entries(existingMeta).filter(([key]) => key !== 'generationProgress' && key !== 'processingProgress'),
  );
  const { error: caseUpdateError } = await supabase
    .from('cases')
    .update({
      processing_stage: 'completato',
      perizia_metadata: {
        ...cleanedMeta,
        ...(pipelineWarnings.length > 0 ? { pipelineWarnings } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);
  if (caseUpdateError) {
    throw new Error(`Failed to mark case ${caseId} as completato: ${caseUpdateError.message}`);
  }

  if (pipelineWarnings.length > 0) {
    logger.warn('pipeline', `Case ${caseId} completed with ${pipelineWarnings.length} warning(s): ${pipelineWarnings.map((w) => w.message).join('; ')}`);
  }

  // Audit log (no sensitive data)
  await supabase.from('audit_log').insert({
    user_id: userId,
    action: 'case.processing.completed',
    entity_type: 'case',
    entity_id: caseId,
    metadata: {
      documentsProcessed: extractionResults.length,
      newEventsInserted: consolidationResult.newEventsCount,
      totalEvents: consolidationResult.totalEventsCount ?? consolidationResult.allEvents?.length ?? 0,
      anomaliesDetected: anomalies.length,
      missingDocuments: missingDocs.length,
      reportVersion: synthesisResult.reportVersion,
      synthesisWordCount: synthesisResult.wordCount ?? synthesisWordCount,
      ...(pipelineCost ? {
        apiUsage: {
          totalCostUSD: pipelineCost.totalCostUSD,
          totalTokens: pipelineCost.totalPromptTokens + pipelineCost.totalCompletionTokens,
          totalOcrPages: pipelineCost.totalOcrPages,
          steps: pipelineCost.steps,
        },
      } : {}),
    },
  });
}

/**
 * Step 9: Send email notification (non-blocking).
 */
export async function sendNotificationStep(
  caseId: string,
  userId: string,
): Promise<void> {
  const supabase = createAdminClient();

  // Fetch case code for the email
  const { data: caseRow } = await supabase
    .from('cases')
    .select('code')
    .eq('id', caseId)
    .single();

  const caseCode = (caseRow?.code as string) ?? caseId;

  await sendReportReadyEmail(userId, caseCode, caseId);
}
