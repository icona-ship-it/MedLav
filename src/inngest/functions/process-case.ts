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
import { enrichWithFullEvidence } from '@/services/pubmed/evidence-enricher';
import type { PubMedSearchResult } from '@/services/pubmed/evidence-enricher';
import { analyzeExpenses } from '@/services/expenses/expense-analyzer';
import type { ExpenseAnalysisResult } from '@/services/expenses/expense-analyzer';
import { extractExpensesFromOcr } from '@/services/expenses/expense-extractor';
import type { ExpenseExtractionResult } from '@/services/expenses/expense-extractor';
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
      { limit: 50 },                              // global cap — protect Mistral rate limits
      { limit: 10, key: 'event.data.userId' },     // per-user fairness
    ],
    cancelOn: [
      { event: 'case/pipeline.cancelled', match: 'data.caseId' },
    ],
    onFailure: async ({ event }) => handlePipelineFailure(event),
  },
  { event: 'case/pipeline.start' },
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

    // ── Step 0+1: Init pipeline + fetch metadata (combined to reduce overhead) ──
    const caseData = await step.run('init-pipeline', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      await supabase
        .from('cases')
        .update({ processing_stage: 'elaborazione', updated_at: new Date().toISOString() })
        .eq('id', caseId);
      logger.info('pipeline', `Marked case ${caseId} as elaborazione`);
      return fetchCaseMetadata(caseId, userId);
    });
    const { documents } = caseData;

    if (documents.length === 0) {
      throw new Error('No documents to process');
    }

    // ── Step 2: OCR documents in batches (Mistral rate limits: ~2 req/sec on Production tier) ──
    // Each step.run is a separate serverless invocation — no cross-process rate limiting possible.
    // Configurable via env: OCR_PARALLEL_BATCH_SIZE (default 3). Check your tier at admin.mistral.ai/plateforme/limits
    const OCR_BATCH_SIZE = parseInt(process.env.OCR_PARALLEL_BATCH_SIZE ?? '3', 10);
    const ocrBatches = chunkArray(documents, OCR_BATCH_SIZE);
    const ocrSettled: PromiseSettledResult<OcrResult | null>[] = [];
    for (const batch of ocrBatches) {
      const batchResults = await Promise.allSettled(
        batch.map((doc) =>
          step.run(`ocr-doc-${doc.id}`, () => ocrSingleDocument(doc)),
        ),
      );
      for (const r of batchResults) {
        ocrSettled.push(r);
        if (r.status === 'rejected') {
          logger.error('pipeline', `OCR step failed: ${r.reason instanceof Error ? r.reason.message : 'unknown'}`);
        }
      }
    }
    const ocrResults: OcrResult[] = ocrSettled
      .filter((r): r is PromiseFulfilledResult<OcrResult | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((r): r is OcrResult => r !== null);

    if (ocrResults.length === 0) {
      throw new Error('All documents failed OCR processing');
    }

    // ── Step 3.0: Refresh types + metadata (combined to reduce step overhead) ──
    const { updatedMetadata, pipelineMode, refreshedTypes } = await step.run('refresh-metadata', async () => {
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

      // Refresh document types
      const docIds = ocrResults.map((r) => r.documentId);
      const { data: docs } = await supabase
        .from('documents')
        .select('id, document_type')
        .in('id', docIds);

      const typeMap: Record<string, string> = {};
      for (const doc of docs ?? []) {
        typeMap[doc.id as string] = (doc.document_type ?? 'altro') as string;
      }

      // Refresh case metadata
      const { data: caseRow } = await supabase
        .from('cases')
        .select('id, case_type, case_types, case_role, patient_initials, user_id, perizia_metadata, pipeline_mode, module_id')
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
        moduleId: (caseRow as Record<string, unknown>).module_id as string | undefined,
      };
      return {
        updatedMetadata: metadata,
        pipelineMode: ((caseRow as Record<string, unknown>).pipeline_mode ?? 'full') as PipelineMode,
        refreshedTypes: typeMap,
      };
    });

    // Apply updated types to in-memory OCR results
    for (const ocr of ocrResults) {
      if (refreshedTypes[ocr.documentId]) {
        ocr.documentType = refreshedTypes[ocr.documentId];
      }
    }

    // ── Pipeline branching: anonymize_only stops after OCR ───────
    if (pipelineMode === 'anonymize_only') {
      await step.run('finalize-anonymize', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();

        // Mark all documents as completed
        const docIds = ocrResults.map((r) => r.documentId);
        for (let i = 0; i < docIds.length; i += 500) {
          await supabase.from('documents').update({
            processing_status: 'completato',
            updated_at: new Date().toISOString(),
          }).in('id', docIds.slice(i, i + 500));
        }

        // Mark case as completed
        await supabase
          .from('cases')
          .update({ processing_stage: 'completato', updated_at: new Date().toISOString() })
          .eq('id', caseId);

        logger.info('pipeline', `Anonymize-only pipeline complete for case ${caseId}, ${docIds.length} docs OCR'd`);
      });

      return {
        success: true,
        caseId,
        pipelineMode,
        documentsProcessed: ocrResults.length,
        newEventsInserted: 0,
        totalEvents: 0,
        anomaliesDetected: 0,
        missingDocuments: 0,
      };
    }

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

    // Mark docs as extracting (inline, no separate step to reduce overhead)
    await step.run('start-extraction', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const docIds = ocrResults.map((r) => r.documentId);
      for (let i = 0; i < docIds.length; i += 500) {
        await supabase.from('documents').update({
          processing_status: 'estrazione_in_corso',
          updated_at: new Date().toISOString(),
        }).in('id', docIds.slice(i, i + 500));
      }
      logger.info('pipeline', `Starting extraction: ${docIds.length} docs, ${allChunkJobs.length} chunks`);
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
    // expenses_only: run expense analysis, save to metadata, then finalize
    if (pipelineMode === 'extraction_only' || pipelineMode === 'expenses_only') {
      // For expenses_only, run LLM expense extraction + algorithmic analysis
      let expenseResult: ExpenseAnalysisResult | undefined;
      let llmExpenseResult: ExpenseExtractionResult | undefined;
      if (pipelineMode === 'expenses_only') {
        // Step A: LLM extraction from OCR text of expense documents
        llmExpenseResult = await step.run('extract-expenses-llm', async () => {
          const { createAdminClient } = await import('@/lib/supabase/admin');
          const supabase = createAdminClient();

          // Fetch OCR text from all documents (expenses may be mixed with medical docs)
          const docIds = ocrResults.map((r) => r.documentId);
          const { data: pages } = await supabase
            .from('pages')
            .select('document_id, page_number, ocr_text')
            .in('document_id', docIds)
            .order('page_number', { ascending: true });

          if (!pages || pages.length === 0) {
            logger.warn('pipeline', 'No OCR pages found for expense extraction');
            return { items: [], totalAmount: null, currency: 'EUR' } as ExpenseExtractionResult;
          }

          const ocrText = pages.map((p) => (p.ocr_text as string) ?? '').join('\n\n---\n\n');

          // Try to find a diagnosis from extracted events for context
          const diagnosisEvents = consolidationResult.allEvents
            .filter((e) => e.eventType === 'diagnosi' && e.title)
            .map((e) => e.title);
          const finalDiagnosis = diagnosisEvents.length > 0 ? diagnosisEvents.join('; ') : undefined;

          return extractExpensesFromOcr(ocrText, finalDiagnosis);
        });

        // Step B: Algorithmic analysis on extracted events (backward compat)
        expenseResult = await step.run('analyze-expenses', () => {
          const eventsForAnalysis = consolidationResult.allEvents.map((e) => ({
            event_type: e.eventType,
            title: e.title,
            description: e.description,
            event_date: e.eventDate,
            facility: e.facility,
            source_type: e.sourceType,
          }));
          return analyzeExpenses(eventsForAnalysis);
        });

        // Save both results to perizia_metadata
        await step.run('save-expense-analysis', async () => {
          const { createAdminClient } = await import('@/lib/supabase/admin');
          const supabase = createAdminClient();

          const { data: caseRow } = await supabase
            .from('cases')
            .select('perizia_metadata')
            .eq('id', caseId)
            .single();

          const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
          await supabase
            .from('cases')
            .update({
              perizia_metadata: {
                ...existingMeta,
                expenseAnalysis: expenseResult,
                expenseExtraction: llmExpenseResult,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', caseId);

          const llmCount = llmExpenseResult?.items?.length ?? 0;
          const llmTotal = llmExpenseResult?.totalAmount;
          logger.info('pipeline', `Expense analysis saved for case ${caseId}: LLM extracted ${llmCount} items (€${llmTotal ?? 'N/A'}), algorithmic ${expenseResult?.totalItems ?? 0} items`);
        });
      }

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
        ...(expenseResult ? { expenseTotalItems: expenseResult.totalItems, expenseTotalAmount: expenseResult.totalAmount } : {}),
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

    // ── PubMed evidence search (optional, non-blocking) ────────────
    let pubmedResults: PubMedSearchResult[] = [];
    try {
      pubmedResults = await step.run('search-pubmed', () =>
        enrichWithFullEvidence(consolidationResult.allEvents, anomalies, updatedMetadata.caseType),
      );
    } catch {
      logger.warn('pipeline', `PubMed search failed (non-blocking) for case ${caseId}`);
    }

    // ── Mark generating report + save PubMed results ──────────────
    await step.run('mark-generazione-report', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      // Save PubMed results to perizia_metadata for UI display
      const { data: caseRow } = await supabase
        .from('cases')
        .select('perizia_metadata')
        .eq('id', caseId)
        .single();
      const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;

      await supabase
        .from('cases')
        .update({
          processing_stage: 'generazione_report',
          perizia_metadata: {
            ...existingMeta,
            ...(pubmedResults.length > 0 ? { pubmedReferences: pubmedResults } : {}),
          },
          updated_at: new Date().toISOString(),
        })
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
      pubmedResults,
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
    let sectionGenerationFailed = false;
    for (let i = 0; i < sectionPlan.length; i++) {
      const spec = sectionPlan[i];
      const previousContext = accumulatedSections.map((s) => ({
        id: s.id,
        title: s.title,
        contextSummary: s.contextSummary,
      }));
      try {
        const section = await step.run(`gen-section-${spec.id}`, async () => {
          // Update generation progress in DB so the UI can show section-by-section status
          const { createAdminClient } = await import('@/lib/supabase/admin');
          const supabase = createAdminClient();
          const { data: caseRow } = await supabase
            .from('cases')
            .select('perizia_metadata')
            .eq('id', caseId)
            .single();
          const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
          await supabase.from('cases').update({
            perizia_metadata: {
              ...existingMeta,
              generationProgress: {
                currentSection: i + 1,
                totalSections: sectionPlan.length,
                currentSectionTitle: spec.title,
              },
            },
            updated_at: new Date().toISOString(),
          }).eq('id', caseId);

          return generateSectionStep(caseId, spec, synthesisParams, previousContext);
        });
        accumulatedSections.push(section);
      } catch (sectionError) {
        // Save partial report with what we have so far, then re-throw
        logger.error('pipeline', `Section "${spec.id}" failed after retries, saving partial report (${accumulatedSections.length}/${sectionPlan.length} sections)`, {
          error: sectionError instanceof Error ? sectionError.message : 'unknown',
        });
        sectionGenerationFailed = true;
        break;
      }
    }

    // Save report (partial or complete)
    const synthesisResult = await step.run('assemble-and-save-report', () =>
      assembleSectionsAndSaveReport(caseId, accumulatedSections, synthesisParams),
    );

    // If a section failed, throw AFTER saving partial report so user has something
    if (sectionGenerationFailed) {
      throw new Error(
        `Report parziale salvato (${accumulatedSections.length}/${sectionPlan.length} sezioni). ` +
        `Una sezione ha fallito dopo i retry. Il report è disponibile ma incompleto.`
      );
    }

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
