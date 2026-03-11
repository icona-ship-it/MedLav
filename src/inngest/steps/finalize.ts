import { createAdminClient } from '@/lib/supabase/admin';
import { sendReportReadyEmail } from '@/services/email/email-service';
import type { ExtractionResult, ConsolidationStepResult, SynthesisStepResult } from './types';
import type { DetectedAnomaly } from '@/services/validation/anomaly-detector';
import type { MissingDocument } from '@/services/validation/missing-doc-detector';
import { logger } from '@/lib/logger';

interface FinalizeParams {
  caseId: string;
  userId: string;
  extractionResults: ExtractionResult[];
  consolidationResult: ConsolidationStepResult;
  anomalies: DetectedAnomaly[];
  missingDocs: MissingDocument[];
  synthesisResult: SynthesisStepResult;
  synthesisWordCount: number;
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
  } = params;
  const supabase = createAdminClient();

  logger.info('pipeline', ` Step 8: Finalizing`);

  // Mark all processed documents as completed
  for (const docResult of extractionResults) {
    await supabase
      .from('documents')
      .update({
        processing_status: 'completato',
        updated_at: new Date().toISOString(),
      })
      .eq('id', docResult.documentId);
  }

  // Update case status
  await supabase
    .from('cases')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', caseId);

  // Audit log (no sensitive data)
  await supabase.from('audit_log').insert({
    user_id: userId,
    action: 'case.processing.completed',
    entity_type: 'case',
    entity_id: caseId,
    metadata: {
      documentsProcessed: extractionResults.length,
      newEventsInserted: consolidationResult.newEventsCount,
      totalEvents: consolidationResult.allEvents.length,
      anomaliesDetected: anomalies.length,
      missingDocuments: missingDocs.length,
      reportVersion: synthesisResult.reportVersion,
      synthesisWordCount: synthesisResult.wordCount ?? synthesisWordCount,
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
