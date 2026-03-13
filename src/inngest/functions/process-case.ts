import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';

import { fetchCaseMetadata } from '../steps/fetch-metadata';
import { ocrSingleDocument } from '../steps/ocr-document';
import { classifyDocumentsStep, applyClassifications } from '../steps/classify-documents';
import { planChunks, extractChunkEvents, markDocumentExtractionError } from '../steps/extract-events';
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
} from '../steps/generate-report';
import { finalizeStep, sendNotificationStep } from '../steps/finalize';

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
    concurrency: [{ limit: 3 }],
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
      logger.info('pipeline', `Step 0: Marked case ${caseId} as elaborazione`);
    });

    // Step 1: Fetch case metadata and documents list
    const caseData = await step.run('fetch-case-metadata', () => fetchCaseMetadata(caseId, userId));
    const { metadata, documents } = caseData;

    if (documents.length === 0) {
      throw new Error('No documents to process');
    }

    // Step 2: OCR all documents in parallel
    const ocrSettled = await Promise.all(
      documents.map((doc) =>
        step.run(`ocr-doc-${doc.id}`, () => ocrSingleDocument(doc)),
      ),
    );
    const ocrResults: OcrResult[] = ocrSettled.filter(
      (r): r is OcrResult => r !== null,
    );

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
    // Guard: only update if still in revisione_classificazione (user may have cancelled)
    await step.run('mark-elaborazione-post-classification', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const { count } = await supabase
        .from('cases')
        .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
        .eq('id', caseId)
        .eq('processing_stage', 'revisione_classificazione');
      if (count === 0) {
        logger.info('pipeline', `Case ${caseId} no longer in revisione_classificazione, skipping`);
      }
    });

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

    // Step 3: Extract events per document (chunks in parallel)
    const extractionResults: ExtractionResult[] = [];

    for (const ocrResult of ocrResults) {
      // Step 3a: Calculate chunk ranges
      const chunkRanges = await step.run(
        `plan-chunks-${ocrResult.documentId}`,
        () => planChunks(ocrResult.documentId, ocrResult.pageCount),
      );

      // Step 3b: Extract each chunk IN PARALLEL
      const chunkPromises = chunkRanges.map((range, i) =>
        step.run(`extract-${ocrResult.documentId}-p${range.start}-${range.end}`, () =>
          extractChunkEvents({
            caseId,
            ocrResult,
            range,
            chunkIndex: i,
            totalChunks: chunkRanges.length,
            caseType: metadata.caseType,
            caseTypes: metadata.caseTypes,
          }),
        ),
      );

      const chunkResults = await Promise.all(chunkPromises);
      const totalEvents = chunkResults.reduce((sum, r) => sum + r.count, 0);

      if (totalEvents === 0) {
        await step.run(`mark-error-${ocrResult.documentId}`, () =>
          markDocumentExtractionError(ocrResult.documentId, ocrResult.pageCount),
        );
      } else {
        extractionResults.push({ documentId: ocrResult.documentId });
      }

      logger.info('pipeline', ` Doc ${ocrResult.documentId}: ${totalEvents} total events from ${chunkRanges.length} chunks`);
    }

    // Step 4: Consolidate events
    const consolidationResult = await step.run(
      'consolidate-events',
      () => consolidateEventsStep(caseId, extractionResults),
    );

    // Step 4.5: Link images to events
    await step.run('link-images-to-events', () => linkImagesToEventsStep(caseId));

    // Step 4.6: Analyze diagnostic images
    const imageAnalysisResults = await step.run(
      'analyze-diagnostic-images',
      () => analyzeDiagnosticImagesStep(caseId, metadata.caseType),
    );

    // Step 5: Detect anomalies
    const rawAnomalies = await step.run(
      'detect-anomalies',
      () => detectAnomaliesStep(caseId, consolidationResult.allEvents, metadata.caseType, metadata.caseTypes),
    );

    // Step 5.5: LLM Anomaly Resolution — verify anomalies against source OCR pages
    let anomalies = await step.run(
      'resolve-anomalies',
      () => resolveAnomaliesStep(caseId, rawAnomalies, consolidationResult.allEvents),
    );

    // Step 6: Detect missing documents
    const missingDocs = await step.run(
      'detect-missing-documents',
      () => detectMissingDocumentsStep(caseId, consolidationResult.allEvents, metadata.caseType, metadata.caseTypes),
    );

    // Step 7a: Calculate medico-legal periods
    const calculations = await step.run(
      'calculate-periods',
      () => calculatePeriodsStep(consolidationResult.allEvents, metadata.caseType),
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
    // Guard: only update if not cancelled (stage could be 'idle' if user cancelled)
    await step.run('mark-generazione-report', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const { count } = await supabase
        .from('cases')
        .update({ processing_stage: 'generazione_report', updated_at: new Date().toISOString() })
        .eq('id', caseId)
        .not('processing_stage', 'eq', 'idle');
      if (count === 0) {
        logger.info('pipeline', `Case ${caseId} was cancelled, skipping generazione_report`);
      }
    });

    // Build shared synthesis params
    const synthesisParams = buildSynthesisParams(
      metadata,
      consolidationResult.allEvents,
      anomalies,
      missingDocs,
      calculations,
      imageAnalysisResults,
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
      const chronology = await step.run(
        'generate-synthesis-chronology',
        () => generateChronologyPart(synthesisParams),
      );
      synthesisResult = await step.run(
        'generate-summary-and-save-report',
        () => generateSummaryAndSaveReport(caseId, synthesisParams, chronology),
      );
    }

    const synthesisWordCount = synthesisResult.wordCount;

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
