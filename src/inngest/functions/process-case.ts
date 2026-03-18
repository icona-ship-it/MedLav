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

import type { OcrResult, ExtractionResult } from '../steps/types';

/**
 * Main Inngest function that orchestrates the document processing pipeline.
 * Each step is independently retryable.
 *
 * Pipeline: fetch metadata -> OCR docs -> extract events (dual-pass) -> validate ->
 *           consolidate -> link images -> detect anomalies -> detect missing docs ->
 *           generate synthesis -> finalize
 */
export const processCaseDocuments = inngest.createFunction(
  {
    id: 'process-case-documents',
    retries: 1,
    concurrency: [
      { limit: 25 },
      { limit: 2, key: 'event.data.userId' },
    ],
    cancelOn: [
      { event: 'case/process.cancelled', match: 'data.caseId' },
    ],
    onFailure: async ({ event }) => {
      try {
        const failureData = event.data as { event: { data: { caseId: string } }; error: unknown };
        const { caseId } = failureData.event.data;
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();

        // Guard: don't overwrite 'idle' (user cancelled) or 'completato'
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
    },
  },
  { event: 'case/process.requested' },
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
      logger.info('pipeline', `Step 0: Marked case ${caseId} as elaborazione [v2-single-ocr]`);
    });

    // Step 1: Fetch case metadata and documents list
    const caseData = await step.run('fetch-case-metadata', () => fetchCaseMetadata(caseId, userId));
    const { metadata, documents } = caseData;

    if (documents.length === 0) {
      throw new Error('No documents to process');
    }

    // Step 2: OCR each document as an independent Inngest step (parallel)
    // Each doc gets its own step = independent retry, timeout, and progress tracking.
    const ocrResults: OcrResult[] = (await Promise.all(
      documents.map((doc) =>
        step.run(`ocr-doc-${doc.id}`, () => ocrSingleDocument(doc)),
      ),
    )).filter((r): r is OcrResult => r !== null);

    if (ocrResults.length === 0) {
      throw new Error('All documents failed OCR processing');
    }

    // Step 2.5: Auto-classify documents with type 'altro'
    // Classifications are applied outside step.run() so they survive Inngest memoization on retries.
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
      logger.info('pipeline', `Step 2.6: Marked ${docIds.length} documents for classification review`);
    });

    // Step 2.6.5: Mark case as waiting for classification review
    await step.run('mark-revisione-classificazione', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      await supabase
        .from('cases')
        .update({ processing_stage: 'revisione_classificazione', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Step 2.6.5: Marked case ${caseId} as revisione_classificazione`);
    });

    // Step 2.7: Wait for user to review and confirm classification (up to 7 days)
    const confirmEvent = await step.waitForEvent(
      'wait-for-classification-review',
      {
        event: 'case/classification.confirmed',
        match: 'data.caseId',
        timeout: '7d',
      },
    );
    if (!confirmEvent) {
      throw new Error('Classification review timed out after 7 days');
    }

    // Resume active processing after classification review
    // Guard: check if user cancelled (stage would be 'idle'). If not cancelled, proceed.
    const wasCancelledPostClassification = await step.run('mark-elaborazione-post-classification', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      // Read current stage FIRST — SELECT is always reliable
      const { data: caseCheck } = await supabase
        .from('cases')
        .select('processing_stage')
        .eq('id', caseId)
        .single();

      const currentStage = caseCheck?.processing_stage as string | undefined;
      if (currentStage === 'idle') {
        logger.info('pipeline', `Case ${caseId} stage is 'idle' — user cancelled, stopping pipeline`);
        return true;
      }

      // Not cancelled — update stage unconditionally
      await supabase
        .from('cases')
        .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Case ${caseId} resumed after classification review (was '${currentStage}')`);
      return false;
    });

    if (wasCancelledPostClassification) {
      return { success: false, caseId, reason: 'cancelled_during_classification_review' };
    }

    // Step 2.8: Refresh document types from DB (user may have changed them)
    const updatedTypes = await step.run('refresh-doc-types', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const { data: docs } = await supabase
        .from('documents')
        .select('id, document_type')
        .in('id', ocrResults.map((r) => r.documentId));
      return docs ?? [];
    });
    for (const ocrResult of ocrResults) {
      const updated = updatedTypes.find((d) => d.id === ocrResult.documentId);
      if (updated) {
        ocrResult.documentType = updated.document_type as string;
      }
    }

    // Step 3: Extract events per document (batched chunks)
    // Plan all chunks synchronously (pure math, no DB call)
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

    // Mark all documents as estrazione_in_corso in a single step
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
      logger.info('pipeline', `Step 3: Marked ${docIds.length} docs as estrazione_in_corso, ${allChunkJobs.length} total chunks`);
    });

    // Batch chunk jobs and run in parallel Inngest steps
    const extractionBatches = chunkArray(allChunkJobs, EXTRACTION_BATCH_SIZE);
    const batchResults = await Promise.all(
      extractionBatches.map((batch, idx) =>
        step.run(`extract-batch-${idx}`, () => extractChunkBatch(batch)),
      ),
    );

    // Aggregate per-document event counts
    const docEventCounts: Record<string, number> = {};
    for (const result of batchResults) {
      for (const [docId, count] of Object.entries(result.perDoc)) {
        docEventCounts[docId] = (docEventCounts[docId] ?? 0) + count;
      }
    }

    // Mark errors for docs with 0 events, build extractionResults
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

    // Mark extraction errors in batched steps
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

    // Steps 4.6 + 5 + 6 + 7a: Run independent analysis steps in parallel
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

    // Step 5.5: LLM Anomaly Resolution — verify anomalies against source OCR pages
    // Must run after detect-anomalies completes (depends on rawAnomalies)
    let anomalies = await step.run(
      'resolve-anomalies',
      () => resolveAnomaliesStep(caseId, rawAnomalies, consolidationResult.allEvents),
    );

    // Step 7a.5: Anomaly review gate — pause if anomalies or missing docs exist
    const hasIssues = anomalies.length > 0 || missingDocs.length > 0;
    if (hasIssues) {
      // Mark case as waiting for anomaly review
      await step.run('mark-revisione-anomalie', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();
        await supabase
          .from('cases')
          .update({ processing_stage: 'revisione_anomalie', updated_at: new Date().toISOString() })
          .eq('id', caseId);
        logger.info('pipeline', `Step 7a.5: Pausing for anomaly review (${anomalies.length} anomalies, ${missingDocs.length} missing docs)`);
      });

      // Wait for user to confirm anomaly review (up to 7 days)
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

      // Refresh anomalies from DB (user may have archived some)
      anomalies = await step.run('refresh-anomalies-after-review', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();
        const { data } = await supabase
          .from('anomalies')
          .select('*')
          .eq('case_id', caseId)
          .in('status', ['detected', 'llm_confirmed', 'user_confirmed']);
        // Map to DetectedAnomaly shape
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
    // Guard: check if user cancelled (stage would be 'idle'). If not cancelled, proceed.
    const wasCancelledPreReport = await step.run('mark-generazione-report', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      const { data: caseCheck } = await supabase
        .from('cases')
        .select('processing_stage')
        .eq('id', caseId)
        .single();

      const currentStage = caseCheck?.processing_stage as string | undefined;
      if (currentStage === 'idle') {
        logger.info('pipeline', `Case ${caseId} stage is 'idle' — user cancelled, skipping report generation`);
        return true;
      }

      await supabase
        .from('cases')
        .update({ processing_stage: 'generazione_report', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Case ${caseId} marked as generazione_report (was '${currentStage}')`);
      return false;
    });

    if (wasCancelledPreReport) {
      return { success: false, caseId, reason: 'cancelled_before_report_generation' };
    }

    // Map-reduce summarization for large cases (>50 documents)
    // Generates per-document AI summaries so synthesis can see 100% of content
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

    // Build shared synthesis params
    const synthesisParams = buildSynthesisParams(
      metadata,
      consolidationResult.allEvents,
      anomalies,
      missingDocs,
      calculations,
      imageAnalysisResults,
      documentSummaries,
    );

    // Step 7b: Check if split mode is needed
    const needsSplit = await step.run(
      'check-synthesis-split',
      () => checkSynthesisSplit(synthesisParams, consolidationResult.allEvents.length),
    );

    // Step 7c/d/e/f: Generate synthesis AND save report in a single step.
    // The full synthesis text stays within the step — never serialized into
    // Inngest step output, avoiding data loss on large reports.
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
      // Merge chronology usage into synthesis result if both present
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

    // Build pipeline cost summary from available usage data
    const costSteps: CostStep[] = [];
    const totalOcrPages = ocrResults.reduce((sum, r) => sum + (r.ocrPages ?? r.pageCount), 0);

    // Add synthesis cost
    if (synthesisResult.usage && synthesisResult.usage.totalTokens > 0) {
      costSteps.push({
        step: 'synthesis',
        model: MISTRAL_MODELS.MISTRAL_LARGE,
        promptTokens: synthesisResult.usage.promptTokens,
        completionTokens: synthesisResult.usage.completionTokens,
        costUSD: calculateTokenCost(MISTRAL_MODELS.MISTRAL_LARGE, synthesisResult.usage),
      });
    }

    // Add image analysis costs
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
