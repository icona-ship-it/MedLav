import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';

import { fetchCaseMetadata } from '../steps/fetch-metadata';
import { ocrSingleDocument } from '../steps/ocr-document';
import { chunkArray } from '@/lib/array-utils';
import { classifyDocumentsStep, applyClassifications } from '../steps/classify-documents';
import { planChunksSync, extractChunkBatch, markDocumentExtractionError, EXTRACTION_BATCH_SIZE } from '../steps/extract-events';
import type { ChunkJob } from '../steps/extract-events';
import { consolidateEventsStep } from '../steps/consolidate-events';
import { linkImagesToEventsStep, analyzeDiagnosticImagesStep } from '../steps/link-images';
import { detectAnomaliesStep, detectMissingDocumentsStep } from '../steps/detect-issues';
import { resolveAnomaliesStep } from '../steps/resolve-anomalies';
import {
  calculatePeriodsStep,
  buildSynthesisParams,
  checkSynthesisSplit,
  generateAndSaveReport,
  generateChronologyPart,
  generateSummaryAndSaveReport,
  fetchDocumentsOcrContext,
} from '../steps/generate-report';
import { finalizeStep, sendNotificationStep } from '../steps/finalize';
import { MAP_REDUCE_THRESHOLD_DOCS, summarizeDocumentBatch } from '@/services/synthesis/document-summarizer';
import type { DocumentSummary } from '@/services/synthesis/document-summarizer';
import type { CostStep } from '@/services/cost-tracking/cost-calculator';
import { calculateTokenCost, buildPipelineSummary } from '@/services/cost-tracking/cost-calculator';
import { MISTRAL_MODELS } from '@/lib/mistral/client';

import type { OcrResult, ExtractionResult, CaseMetadata } from '../steps/types';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';

// ─── Shared onFailure handler ──────────────────────────────────────

async function handlePipelineFailure(event: { data: unknown }) {
  try {
    const failureData = event.data as { event: { data: { caseId: string } }; error: unknown };
    const { caseId } = failureData.event.data;
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: current, error: queryError } = await supabase
      .from('cases')
      .select('processing_stage')
      .eq('id', caseId)
      .single();
    if (queryError) {
      logger.error('pipeline', `onFailure: failed to read case ${caseId} stage`, { error: queryError.message });
    }
    const stage = (current?.processing_stage as string) ?? '';
    if (stage === 'idle' || stage === 'completato') {
      logger.info('pipeline', `Skipping errore for case ${caseId} (already ${stage})`);
      return;
    }

    await supabase
      .from('cases')
      .update({ processing_stage: 'errore', updated_at: new Date().toISOString() })
      .eq('id', caseId);
    logger.error('pipeline', `Pipeline failed permanently for case ${caseId}`);
  } catch (err) {
    logger.error('pipeline', 'Failed to mark case as errore in onFailure handler', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ─── PHASE 1: OCR + Classification ─────────────────────────────────
// Triggers on case/pipeline.phase1.
// Ends after classification — user reviews, then confirms to trigger phase 2.

export const processCasePhase1 = inngest.createFunction(
  {
    id: 'process-case-phase1',
    retries: 1,
    concurrency: [
      { limit: 25 },
      { limit: 2, key: 'event.data.userId' },
    ],
    cancelOn: [
      { event: 'case/pipeline.cancelled', match: 'data.caseId' },
    ],
    onFailure: async ({ event }) => handlePipelineFailure(event),
  },
  { event: 'case/pipeline.phase1' },
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

    // Step 0: Mark processing stage as 'elaborazione'
    await step.run('mark-elaborazione', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      await supabase
        .from('cases')
        .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Phase1: Marked case ${caseId} as elaborazione`);
    });

    // Step 1: Fetch case metadata and documents list
    const caseData = await step.run('fetch-case-metadata', () => fetchCaseMetadata(caseId, userId));
    const { documents } = caseData;

    if (documents.length === 0) {
      throw new Error('No documents to process');
    }

    // Step 2: OCR each document as an independent Inngest step (parallel)
    const ocrResults: OcrResult[] = (await Promise.all(
      documents.map((doc) =>
        step.run(`ocr-doc-${doc.id}`, () => ocrSingleDocument(doc)),
      ),
    )).filter((r): r is OcrResult => r !== null);

    if (ocrResults.length === 0) {
      throw new Error('All documents failed OCR processing');
    }

    // Step 2.5: Auto-classify documents
    const classifications = await step.run('classify-documents', () => classifyDocumentsStep(ocrResults));
    applyClassifications(ocrResults, classifications);

    // Step 2.6: Mark documents as ready for classification review
    await step.run('mark-classification-ready', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const docIds = ocrResults.map((r) => r.documentId);
      await supabase
        .from('documents')
        .update({
          processing_status: 'classificazione_completata',
          updated_at: new Date().toISOString(),
        })
        .in('id', docIds);
      logger.info('pipeline', `Phase1: Marked ${docIds.length} documents for classification review`);
    });

    // Step 2.6.5: Mark case as waiting for classification review
    await step.run('mark-revisione-classificazione', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      await supabase
        .from('cases')
        .update({ processing_stage: 'revisione_classificazione', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Phase1: Case ${caseId} ready for classification review — phase 1 complete`);
    });

    // Phase 1 ends here. User reviews classification in the UI.
    // When they confirm, the API sends 'case/pipeline.phase2' which triggers phase 2.
    return {
      success: true,
      caseId,
      phase: 1,
      documentsOcr: ocrResults.length,
    };
  },
);

// ─── PHASE 2: Extraction → Report ──────────────────────────────────
// Triggers on case/pipeline.phase2 (sent by confirm-classification API).
// Reads OCR results from DB, then does extraction, consolidation, synthesis.

export const processCasePhase2 = inngest.createFunction(
  {
    id: 'process-case-phase2',
    retries: 1,
    concurrency: [
      { limit: 25 },
      { limit: 2, key: 'event.data.userId' },
    ],
    cancelOn: [
      { event: 'case/pipeline.cancelled', match: 'data.caseId' },
    ],
    onFailure: async ({ event }) => handlePipelineFailure(event),
  },
  { event: 'case/pipeline.phase2' },
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

    // Step 0: Mark as elaborazione (resuming after classification review)
    await step.run('mark-elaborazione', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      // Check if user cancelled
      const { data: caseCheck } = await supabase
        .from('cases')
        .select('processing_stage')
        .eq('id', caseId)
        .single();

      if (caseCheck?.processing_stage === 'idle') {
        throw new Error('Case was cancelled by user');
      }

      await supabase
        .from('cases')
        .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Phase2: Resumed case ${caseId} after classification review`);
    });

    // Step 1: Re-fetch case metadata
    const caseData = await step.run('fetch-case-metadata', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      const { data: caseRow } = await supabase
        .from('cases')
        .select('id, case_type, case_types, case_role, patient_initials, user_id, perizia_metadata')
        .eq('id', caseId)
        .single();
      if (!caseRow) throw new Error(`Case not found: ${caseId}`);

      const { data: docs } = await supabase
        .from('documents')
        .select('id, file_name, document_type, page_count, processing_status')
        .eq('case_id', caseId)
        .in('processing_status', ['classificazione_completata', 'estrazione_in_corso', 'completato']);

      return { caseRow, docs: docs ?? [] };
    });

    const { caseRow, docs } = caseData;

    // Build metadata
    const rawCaseTypes = caseRow.case_types as string[] | null;
    const metadata: CaseMetadata = {
      caseId: caseRow.id as string,
      caseType: caseRow.case_type as CaseType,
      caseTypes: rawCaseTypes && rawCaseTypes.length > 0
        ? rawCaseTypes as CaseType[]
        : [caseRow.case_type as CaseType],
      caseRole: caseRow.case_role as CaseRole,
      patientInitials: caseRow.patient_initials as string | null,
      userId: caseRow.user_id as string,
      periziaMetadata: (caseRow.perizia_metadata ?? undefined) as PeriziaMetadata | undefined,
    };

    // Build OcrResults from DB (pages table has the text)
    const ocrResults: OcrResult[] = await step.run('rebuild-ocr-results', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      const results: OcrResult[] = [];
      for (const doc of docs) {
        const { data: pages } = await supabase
          .from('pages')
          .select('page_number, ocr_text, ocr_confidence')
          .eq('document_id', doc.id)
          .order('page_number', { ascending: true });

        const pageList = pages ?? [];
        const fullText = pageList.map((p) => p.ocr_text ?? '').join('\n');
        const avgConf = pageList.length > 0
          ? pageList.reduce((sum, p) => sum + (p.ocr_confidence ?? 0), 0) / pageList.length
          : 0;

        results.push({
          documentId: doc.id as string,
          fileName: doc.file_name as string,
          documentType: (doc.document_type ?? 'altro') as string,
          fullText,
          pageCount: (doc.page_count ?? pageList.length) as number,
          averageConfidence: avgConf,
          ocrPages: pageList.length,
        });
      }
      return results;
    });

    if (ocrResults.length === 0) {
      throw new Error('No documents with OCR results found');
    }

    // Step 3: Extract events per document (batched chunks)
    const allChunkJobs: ChunkJob[] = [];
    for (const ocrResult of ocrResults) {
      const chunkRanges = planChunksSync(ocrResult.pageCount);
      for (let i = 0; i < chunkRanges.length; i++) {
        allChunkJobs.push({
          caseId,
          ocrResult,
          range: chunkRanges[i],
          chunkIndex: i,
          totalChunks: chunkRanges.length,
          caseType: metadata.caseType,
          caseTypes: metadata.caseTypes,
        });
      }
    }

    await step.run('mark-extraction-start', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const docIds = ocrResults.map((r) => r.documentId);
      const BATCH_SIZE = 500;
      for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
        await supabase.from('documents').update({
          processing_status: 'estrazione_in_corso',
          updated_at: new Date().toISOString(),
        }).in('id', docIds.slice(i, i + BATCH_SIZE));
      }
      logger.info('pipeline', `Phase2: Marked ${docIds.length} docs as estrazione_in_corso, ${allChunkJobs.length} total chunks`);
    });

    const extractionBatches = chunkArray(allChunkJobs, EXTRACTION_BATCH_SIZE);
    const batchResults = await Promise.all(
      extractionBatches.map((batch, idx) =>
        step.run(`extract-batch-${idx}`, () => extractChunkBatch(batch)),
      ),
    );

    const docEventCounts: Record<string, number> = {};
    for (const result of batchResults) {
      for (const [docId, count] of Object.entries(result.perDoc)) {
        docEventCounts[docId] = (docEventCounts[docId] ?? 0) + count;
      }
    }

    const extractionResults: ExtractionResult[] = [];
    const markErrorJobs: Array<{ documentId: string; pageCount: number }> = [];
    for (const ocrResult of ocrResults) {
      const totalEvents = docEventCounts[ocrResult.documentId] ?? 0;
      if (totalEvents === 0) {
        markErrorJobs.push({ documentId: ocrResult.documentId, pageCount: ocrResult.pageCount });
      } else {
        extractionResults.push({ documentId: ocrResult.documentId });
      }
      logger.info('pipeline', ` Doc ${ocrResult.documentId}: ${totalEvents} total events`);
    }

    if (markErrorJobs.length > 0) {
      const errorBatches = chunkArray(markErrorJobs, 10);
      await Promise.all(
        errorBatches.map((batch, idx) =>
          step.run(`mark-error-batch-${idx}`, async () => {
            for (const job of batch) {
              await markDocumentExtractionError(job.documentId, job.pageCount);
            }
          }),
        ),
      );
    }

    // Step 4: Consolidate events
    const consolidationResult = await step.run(
      'consolidate-events',
      () => consolidateEventsStep(caseId, extractionResults),
    );

    // Step 4.5: Link images to events
    await step.run('link-images-to-events', () => linkImagesToEventsStep(caseId));

    // Steps 4.6 + 5 + 6 + 7a: Independent analysis steps in parallel
    const [imageAnalysisResults, rawAnomalies, missingDocs, calculations] = await Promise.all([
      step.run('analyze-diagnostic-images', () =>
        analyzeDiagnosticImagesStep(caseId, metadata.caseType),
      ),
      step.run('detect-anomalies', () =>
        detectAnomaliesStep(caseId, consolidationResult.allEvents, metadata.caseType, metadata.caseTypes),
      ),
      step.run('detect-missing-documents', () =>
        detectMissingDocumentsStep(caseId, consolidationResult.allEvents, metadata.caseType, metadata.caseTypes),
      ),
      step.run('calculate-periods', () =>
        calculatePeriodsStep(consolidationResult.allEvents, metadata.caseType),
      ),
    ]);

    // Step 5.5: LLM Anomaly Resolution
    let anomalies = await step.run(
      'resolve-anomalies',
      () => resolveAnomaliesStep(caseId, rawAnomalies, consolidationResult.allEvents),
    );

    // Step 7a.5: Anomaly review gate
    const hasIssues = anomalies.length > 0 || missingDocs.length > 0;
    if (hasIssues) {
      await step.run('mark-revisione-anomalie', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();
        await supabase
          .from('cases')
          .update({ processing_stage: 'revisione_anomalie', updated_at: new Date().toISOString() })
          .eq('id', caseId);
        logger.info('pipeline', `Phase2: Pausing for anomaly review (${anomalies.length} anomalies, ${missingDocs.length} missing docs)`);
      });

      const anomalyConfirmEvent = await step.waitForEvent(
        'wait-for-anomaly-review',
        {
          event: 'case/anomaly-review.confirmed',
          match: 'data.caseId',
          timeout: '7d',
        },
      );
      if (!anomalyConfirmEvent) {
        throw new Error('Anomaly review timed out after 7 days');
      }

      anomalies = await step.run('refresh-anomalies-after-review', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();
        const { data } = await supabase
          .from('anomalies')
          .select('*')
          .eq('case_id', caseId)
          .in('status', ['detected', 'llm_confirmed', 'user_confirmed']);
        return (data ?? []).map((row) => ({
          anomalyType: row.anomaly_type,
          severity: row.severity as 'critica' | 'alta' | 'media' | 'bassa',
          description: row.description as string,
          involvedEvents: row.involved_events ? JSON.parse(row.involved_events as string) as Array<{ eventId: string | null; orderNumber: number; date: string; title: string }> : [],
          suggestion: (row.suggestion as string) ?? '',
        }));
      });
    }

    // Mark case as generating report
    await step.run('mark-generazione-report', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      await supabase
        .from('cases')
        .update({ processing_stage: 'generazione_report', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Phase2: Case ${caseId} marked as generazione_report`);
    });

    // Map-reduce summarization for large cases
    let documentSummaries: DocumentSummary[] | undefined;
    if (ocrResults.length >= MAP_REDUCE_THRESHOLD_DOCS) {
      const summaryDocs = await step.run('fetch-ocr-for-summaries', () =>
        fetchDocumentsOcrContext(caseId),
      );
      const SUMMARY_BATCH_SIZE = 5;
      const summaryBatches = chunkArray(summaryDocs, SUMMARY_BATCH_SIZE);
      const summaryResults = await Promise.all(
        summaryBatches.map((batch, idx) =>
          step.run(`summarize-batch-${idx}`, () => summarizeDocumentBatch(batch)),
        ),
      );
      documentSummaries = summaryResults.flat();
      logger.info('pipeline', `Map-reduce: ${documentSummaries.length} document summaries generated`);
    }

    // Build synthesis params
    const synthesisParams = buildSynthesisParams(
      metadata,
      consolidationResult.allEvents,
      anomalies,
      missingDocs,
      calculations,
      imageAnalysisResults,
      documentSummaries,
    );

    const needsSplit = await step.run(
      'check-synthesis-split',
      () => checkSynthesisSplit(synthesisParams, consolidationResult.allEvents.length),
    );

    let synthesisResult: Awaited<ReturnType<typeof generateAndSaveReport>>;

    if (!needsSplit) {
      synthesisResult = await step.run(
        'generate-and-save-report',
        () => generateAndSaveReport(caseId, synthesisParams),
      );
    } else {
      const chronologyResult = await step.run(
        'generate-synthesis-chronology',
        () => generateChronologyPart(caseId, synthesisParams),
      );
      synthesisResult = await step.run(
        'generate-summary-and-save-report',
        () => generateSummaryAndSaveReport(caseId, synthesisParams, chronologyResult.chronology, chronologyResult.ocrTotalChars),
      );
      if (chronologyResult.usage && synthesisResult.usage) {
        synthesisResult = {
          ...synthesisResult,
          usage: {
            promptTokens: synthesisResult.usage.promptTokens + chronologyResult.usage.promptTokens,
            completionTokens: synthesisResult.usage.completionTokens + chronologyResult.usage.completionTokens,
            totalTokens: synthesisResult.usage.totalTokens + chronologyResult.usage.totalTokens,
          },
        };
      }
    }

    const synthesisWordCount = synthesisResult.wordCount;

    // Build pipeline cost summary
    const costSteps: CostStep[] = [];
    const totalOcrPages = ocrResults.reduce((sum, r) => sum + (r.ocrPages ?? r.pageCount), 0);

    if (synthesisResult.usage && synthesisResult.usage.totalTokens > 0) {
      costSteps.push({
        step: 'synthesis',
        model: MISTRAL_MODELS.MISTRAL_LARGE,
        promptTokens: synthesisResult.usage.promptTokens,
        completionTokens: synthesisResult.usage.completionTokens,
        costUSD: calculateTokenCost(MISTRAL_MODELS.MISTRAL_LARGE, synthesisResult.usage),
      });
    }

    for (const img of imageAnalysisResults) {
      if (img.usage && img.usage.totalTokens > 0) {
        costSteps.push({
          step: `image-analysis:p${img.pageNumber}`,
          model: MISTRAL_MODELS.PIXTRAL_LARGE,
          promptTokens: img.usage.promptTokens,
          completionTokens: img.usage.completionTokens,
          costUSD: calculateTokenCost(MISTRAL_MODELS.PIXTRAL_LARGE, img.usage),
        });
      }
    }

    const pipelineCost = buildPipelineSummary(costSteps, totalOcrPages);

    // Step 8: Finalize
    await step.run('finalize', () => finalizeStep({
      caseId,
      userId,
      extractionResults,
      consolidationResult,
      anomalies,
      missingDocs,
      synthesisResult,
      synthesisWordCount,
      pipelineCost,
    }));

    // Step 9: Send notification
    await step.run('send-notification', () => sendNotificationStep(caseId, userId));

    return {
      success: true,
      caseId,
      phase: 2,
      documentsProcessed: extractionResults.length,
      newEventsInserted: consolidationResult.newEventsCount,
      totalEvents: consolidationResult.allEvents.length,
      anomaliesDetected: anomalies.length,
      missingDocuments: missingDocs.length,
      reportVersion: synthesisResult.reportVersion,
      synthesisWordCount: synthesisResult.wordCount ?? synthesisWordCount,
    };
  },
);
