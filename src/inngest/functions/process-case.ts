import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';

import { fetchCaseMetadata } from '../steps/fetch-metadata';
import { ocrSingleDocument } from '../steps/ocr-document';
import { chunkArray } from '@/lib/array-utils';
// Classification removed from pipeline — handled by Document Organizer (Pro) or user manual selection
import { planChunksSync, extractChunkBatch, markDocumentExtractionError, EXTRACTION_BATCH_SIZE } from '../steps/extract-events';
import type { ChunkJob } from '../steps/extract-events';
import { consolidateEventsStep } from '../steps/consolidate-events';
import { linkImagesToEventsStep, analyzeDiagnosticImagesStep } from '../steps/link-images';
import { detectAnomaliesStep, detectMissingDocumentsStep } from '../steps/detect-issues';
import { resolveAnomaliesStep } from '../steps/resolve-anomalies';
import {
  calculatePeriodsStep,
  buildSynthesisParams,
  planReportSections,
  generateSectionStep,
  assembleSectionsAndSaveReport,
} from '../steps/generate-report';
import type { GeneratedSection } from '@/services/synthesis/section-generation-types';
import { finalizeStep, sendNotificationStep } from '../steps/finalize';
import { MAP_REDUCE_THRESHOLD_DOCS, summarizeDocumentBatchByIds } from '@/services/synthesis/document-summarizer';
import type { DocumentSummary, DocumentRef } from '@/services/synthesis/document-summarizer';
import type { CostStep } from '@/services/cost-tracking/cost-calculator';
import { calculateTokenCost, buildPipelineSummary } from '@/services/cost-tracking/cost-calculator';
import { MISTRAL_MODELS } from '@/lib/mistral/client';

import type { OcrResult, ExtractionResult, CaseMetadata } from '../steps/types';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { PipelineMode } from '@/types/modules';

// ─── onFailure handler ──────────────────────────────────────────────

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

    // Extract error message for user display
    const errorObj = failureData.error as { message?: string; name?: string } | undefined;
    const errorMessage = errorObj?.message ?? 'Errore sconosciuto durante l\'elaborazione';

    // Save error in perizia_metadata.lastError so UI can show it
    const { data: caseRow } = await supabase
      .from('cases')
      .select('perizia_metadata')
      .eq('id', caseId)
      .single();
    const existingMetadata = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;

    await supabase
      .from('cases')
      .update({
        processing_stage: 'errore',
        perizia_metadata: { ...existingMetadata, lastError: errorMessage, lastErrorAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);
    logger.error('pipeline', `Pipeline failed permanently for case ${caseId}: ${errorMessage}`);
  } catch (err) {
    logger.error('pipeline', 'Failed to mark case as errore in onFailure handler', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ─── Unified Pipeline ───────────────────────────────────────────────
// Single function: OCR → Classification → waitForEvent → Extraction → Report
// Classification and anomaly review use waitForEvent gates.

export const processCase = inngest.createFunction(
  {
    id: 'process-case',
    retries: 3,
    concurrency: [
      { limit: 5, key: 'event.data.userId' },
    ],
    cancelOn: [
      { event: 'case/pipeline.cancelled', match: 'data.caseId' },
    ],
    onFailure: async ({ event }) => handlePipelineFailure(event),
  },
  { event: 'case/pipeline.start' },
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

    // ── Step 0: Mark as elaborazione ──────────────────────────────
    await step.run('mark-elaborazione', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      await supabase
        .from('cases')
        .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Marked case ${caseId} as elaborazione`);
    });

    // ── Step 1: Fetch case metadata ──────────────────────────────
    const caseData = await step.run('fetch-case-metadata', () => fetchCaseMetadata(caseId, userId));
    const { documents } = caseData;

    if (documents.length === 0) {
      throw new Error('No documents to process');
    }

    // ── Step 2: OCR all documents (parallel, fault-tolerant) ─────
    const ocrSettled = await Promise.allSettled(
      documents.map((doc) =>
        step.run(`ocr-doc-${doc.id}`, () => ocrSingleDocument(doc)),
      ),
    );
    for (const r of ocrSettled) {
      if (r.status === 'rejected') {
        logger.error('pipeline', `OCR step failed: ${r.reason instanceof Error ? r.reason.message : 'unknown'}`);
      }
    }
    const ocrResults: OcrResult[] = ocrSettled
      .filter((r): r is PromiseFulfilledResult<OcrResult | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((r): r is OcrResult => r !== null);

    if (ocrResults.length === 0) {
      throw new Error('All documents failed OCR processing');
    }

    // ── Step 3.0: Refresh document types from DB ──────────────────
    // Document types set by user during upload or by Document Organizer (Pro)
    // No automatic classification — user selects types manually or uses Document Organizer
    const refreshedTypes = await step.run('refresh-document-types', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      // Check if cancelled while waiting
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

      // Read updated document types
      const docIds = ocrResults.map((r) => r.documentId);
      const { data: docs } = await supabase
        .from('documents')
        .select('id, document_type')
        .in('id', docIds);

      const typeMap: Record<string, string> = {};
      for (const doc of docs ?? []) {
        typeMap[doc.id as string] = (doc.document_type ?? 'altro') as string;
      }
      return typeMap;
    });

    // Apply updated types to in-memory OCR results
    for (const ocr of ocrResults) {
      if (refreshedTypes[ocr.documentId]) {
        ocr.documentType = refreshedTypes[ocr.documentId];
      }
    }

    // Refresh metadata with updated case info
    const { metadata: updatedMetadata, pipelineMode } = await step.run('refresh-case-metadata', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const { data: caseRow } = await supabase
        .from('cases')
        .select('id, case_type, case_types, case_role, patient_initials, user_id, perizia_metadata, pipeline_mode')
        .eq('id', caseId)
        .single();
      if (!caseRow) throw new Error(`Case not found: ${caseId}`);

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
      return {
        metadata,
        pipelineMode: ((caseRow as Record<string, unknown>).pipeline_mode ?? 'full') as PipelineMode,
      };
    });

    // ── Step 3: Extract events (batched chunks, parallel) ────────
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
          caseType: updatedMetadata.caseType,
          caseTypes: updatedMetadata.caseTypes,
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
      logger.info('pipeline', `Marked ${docIds.length} docs as estrazione_in_corso, ${allChunkJobs.length} total chunks`);
    });

    const extractionBatches = chunkArray(allChunkJobs, EXTRACTION_BATCH_SIZE);
    const batchSettled = await Promise.allSettled(
      extractionBatches.map((batch, idx) =>
        step.run(`extract-batch-${idx}`, () => extractChunkBatch(batch)),
      ),
    );

    const docEventCounts: Record<string, number> = {};
    for (const result of batchSettled) {
      if (result.status === 'fulfilled') {
        for (const [docId, count] of Object.entries(result.value.perDoc)) {
          docEventCounts[docId] = (docEventCounts[docId] ?? 0) + count;
        }
      } else {
        logger.error('pipeline', `Extraction batch failed: ${result.reason instanceof Error ? result.reason.message : 'unknown'}`);
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
      const errorSettled = await Promise.allSettled(
        errorBatches.map((batch, idx) =>
          step.run(`mark-error-batch-${idx}`, async () => {
            for (const job of batch) {
              await markDocumentExtractionError(job.documentId, job.pageCount);
            }
          }),
        ),
      );
      for (const r of errorSettled) {
        if (r.status === 'rejected') {
          logger.warn('pipeline', `Failed to mark error documents: ${r.reason instanceof Error ? r.reason.message : 'unknown'}`);
        }
      }
    }

    // ── Step 4: Consolidate events ───────────────────────────────
    const consolidationResult = await step.run(
      'consolidate-events',
      () => consolidateEventsStep(caseId, extractionResults),
    );

    // ── Step 4.5: Link images to events ──────────────────────────
    await step.run('link-images-to-events', () => linkImagesToEventsStep(caseId));

    // ── Pipeline branching by module type ───────────────────────
    // extraction_only: stop here, finalize with just the timeline
    if (pipelineMode === 'extraction_only' || pipelineMode === 'expenses_only') {
      await step.run('finalize', () => finalizeStep({
        caseId,
        userId,
        extractionResults,
        consolidationResult,
        anomalies: [],
        missingDocs: [],
        synthesisResult: { reportVersion: 0, wordCount: 0 },
        synthesisWordCount: 0,
        pipelineCost: buildPipelineSummary([], ocrResults.reduce((sum, r) => sum + (r.ocrPages ?? r.pageCount), 0)),
      }));

      await step.run('send-notification', () => sendNotificationStep(caseId, userId));

      return {
        success: true,
        caseId,
        pipelineMode,
        documentsProcessed: extractionResults.length,
        newEventsInserted: consolidationResult.newEventsCount,
        totalEvents: consolidationResult.allEvents.length,
        anomaliesDetected: 0,
        missingDocuments: 0,
      };
    }

    // ── Full pipeline continues below ───────────────────────────

    // ── Steps 4.6 + 5 + 6 + 7a: Parallel analysis (fault-tolerant) ──
    const [imageSettled, anomalySettled, missingSettled, calcSettled] = await Promise.allSettled([
      step.run('analyze-diagnostic-images', () =>
        analyzeDiagnosticImagesStep(caseId, updatedMetadata.caseType),
      ),
      step.run('detect-anomalies', () =>
        detectAnomaliesStep(caseId, consolidationResult.allEvents, updatedMetadata.caseType, updatedMetadata.caseTypes),
      ),
      step.run('detect-missing-documents', () =>
        detectMissingDocumentsStep(caseId, consolidationResult.allEvents, updatedMetadata.caseType, updatedMetadata.caseTypes),
      ),
      step.run('calculate-periods', () =>
        calculatePeriodsStep(consolidationResult.allEvents, updatedMetadata.caseType),
      ),
    ]);

    const imageAnalysisResults = imageSettled.status === 'fulfilled' ? imageSettled.value : [];
    const rawAnomalies = anomalySettled.status === 'fulfilled' ? anomalySettled.value : [];
    const missingDocs = missingSettled.status === 'fulfilled' ? missingSettled.value : [];
    const calculations = calcSettled.status === 'fulfilled' ? calcSettled.value : [];

    if (imageSettled.status === 'rejected') logger.error('pipeline', `Image analysis failed: ${imageSettled.reason instanceof Error ? imageSettled.reason.message : 'unknown'}`);
    if (anomalySettled.status === 'rejected') logger.error('pipeline', `Anomaly detection failed: ${anomalySettled.reason instanceof Error ? anomalySettled.reason.message : 'unknown'}`);
    if (missingSettled.status === 'rejected') logger.error('pipeline', `Missing docs detection failed: ${missingSettled.reason instanceof Error ? missingSettled.reason.message : 'unknown'}`);
    if (calcSettled.status === 'rejected') logger.error('pipeline', `Period calculation failed: ${calcSettled.reason instanceof Error ? calcSettled.reason.message : 'unknown'}`);

    // ── Step 5.5: LLM Anomaly Resolution ─────────────────────────
    // Anomalies are resolved and saved to DB, but NO pause for user review.
    // The report generates immediately. User reviews anomalies after seeing the report.
    const anomalies = await step.run(
      'resolve-anomalies',
      () => resolveAnomaliesStep(caseId, rawAnomalies, consolidationResult.allEvents),
    );

    // ── Mark generating report ───────────────────────────────────
    await step.run('mark-generazione-report', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      await supabase
        .from('cases')
        .update({ processing_stage: 'generazione_report', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Case ${caseId} marked as generazione_report`);
    });

    // ── Map-reduce summarization for large cases ─────────────────
    // Each summarize-batch step fetches its own OCR text from DB,
    // so large text is never serialized as Inngest step output.
    let documentSummaries: DocumentSummary[] | undefined;
    if (ocrResults.length >= MAP_REDUCE_THRESHOLD_DOCS) {
      const docRefs: DocumentRef[] = ocrResults.map((r) => ({
        documentId: r.documentId,
        fileName: r.fileName,
        documentType: r.documentType,
      }));
      const SUMMARY_BATCH_SIZE = 5;
      const summaryBatches = chunkArray(docRefs, SUMMARY_BATCH_SIZE);
      const summarySettled = await Promise.allSettled(
        summaryBatches.map((batch, idx) =>
          step.run(`summarize-batch-${idx}`, () => summarizeDocumentBatchByIds(batch)),
        ),
      );
      documentSummaries = summarySettled
        .filter((r): r is PromiseFulfilledResult<DocumentSummary[]> => r.status === 'fulfilled')
        .flatMap((r) => r.value);
      for (const r of summarySettled) {
        if (r.status === 'rejected') {
          logger.error('pipeline', `Summary batch failed: ${r.reason instanceof Error ? r.reason.message : 'unknown'}`);
        }
      }
      logger.info('pipeline', `Map-reduce: ${documentSummaries.length} document summaries generated`);
    }

    // ── Build synthesis params ────────────────────────────────────
    const synthesisParams = buildSynthesisParams(
      updatedMetadata,
      consolidationResult.allEvents,
      anomalies,
      missingDocs,
      calculations,
      imageAnalysisResults,
      documentSummaries,
    );

    // ── Sectional report generation ───────────────────────────────
    // Generate report section by section, each in its own Inngest step.
    // Each step < 4 min, eliminating Vercel timeouts for large cases.

    // Gather actual document types from classified documents (not event sourceTypes)
    const classifiedDocTypes = [...new Set(ocrResults.map((r) => r.documentType))];

    const sectionPlan = await step.run('plan-report-sections', () =>
      planReportSections(updatedMetadata, consolidationResult.allEvents, classifiedDocTypes),
    );

    if (sectionPlan.length === 0) {
      throw new Error('Section plan resulted in zero sections — cannot generate empty report');
    }

    const accumulatedSections: GeneratedSection[] = [];
    for (const spec of sectionPlan) {
      const previousContext = accumulatedSections.map((s) => ({
        id: s.id,
        title: s.title,
        contextSummary: s.contextSummary,
      }));
      const section = await step.run(`gen-section-${spec.id}`, () =>
        generateSectionStep(caseId, spec, synthesisParams, previousContext),
      );
      accumulatedSections.push(section);
    }

    const synthesisResult = await step.run('assemble-and-save-report', () =>
      assembleSectionsAndSaveReport(caseId, accumulatedSections, synthesisParams),
    );

    const synthesisWordCount = synthesisResult.wordCount;

    // ── Build pipeline cost summary ──────────────────────────────
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

    // ── Finalize ─────────────────────────────────────────────────
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

    // ── Send notification ────────────────────────────────────────
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
