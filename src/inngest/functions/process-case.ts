import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';

import { fetchCaseMetadata } from '../steps/fetch-metadata';
import { ocrSingleDocument } from '../steps/ocr-document';
import { classifyDocumentsStep } from '../steps/classify-documents';
import { planChunks, extractChunkEvents, markDocumentExtractionError } from '../steps/extract-events';
import { consolidateEventsStep } from '../steps/consolidate-events';
import { linkImagesToEventsStep, analyzeDiagnosticImagesStep } from '../steps/link-images';
import { detectAnomaliesStep, detectMissingDocumentsStep } from '../steps/detect-issues';
import {
  calculatePeriodsStep,
  buildSynthesisParams,
  checkSynthesisSplit,
  generateFullSynthesis,
  generateChronologyPart,
  generateSummaryPart,
  saveReportStep,
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
  },
  { event: 'case/process.requested' },
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

    // Step 1: Fetch case metadata and documents list
    const caseData = await step.run('fetch-case-metadata', () => fetchCaseMetadata(caseId, userId));
    const { metadata, documents } = caseData;

    if (documents.length === 0) {
      throw new Error('No documents to process');
    }

    // Step 2: OCR each document
    const ocrResults: OcrResult[] = [];
    for (const doc of documents) {
      const ocrResult = await step.run(`ocr-doc-${doc.id}`, () => ocrSingleDocument(doc));
      if (ocrResult) {
        ocrResults.push(ocrResult);
      }
    }

    if (ocrResults.length === 0) {
      throw new Error('All documents failed OCR processing');
    }

    // Step 2.5: Auto-classify documents with type 'altro'
    await step.run('classify-documents', () => classifyDocumentsStep(ocrResults));

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
    const anomalies = await step.run(
      'detect-anomalies',
      () => detectAnomaliesStep(caseId, consolidationResult.allEvents, metadata.caseType, metadata.caseTypes),
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

    // Step 7c/d/e: Generate synthesis
    let synthesisText: string;
    let synthesisWordCount: number;

    if (!needsSplit) {
      const result = await step.run('generate-synthesis', () => generateFullSynthesis(synthesisParams));
      synthesisText = result.synthesis;
      synthesisWordCount = result.wordCount;
    } else {
      const chronology = await step.run('generate-synthesis-chronology', () => generateChronologyPart(synthesisParams));
      const result = await step.run('generate-synthesis-summary', () => generateSummaryPart(synthesisParams, chronology));
      synthesisText = result.synthesis;
      synthesisWordCount = result.wordCount;
    }

    // Step 7f: Save report
    const synthesisResult = await step.run(
      'save-report',
      () => saveReportStep(caseId, synthesisText, synthesisWordCount),
    );

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
