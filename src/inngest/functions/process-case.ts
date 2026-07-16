import * as Sentry from '@sentry/nextjs';
import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';

import { fetchCaseMetadata } from '../steps/fetch-metadata';
import { dedupCaseDocuments } from '../steps/dedup-documents';
import { ocrSingleDocument } from '../steps/ocr-document';
import { chunkArray } from '@/lib/array-utils';
// Classification removed from pipeline — handled by Document Organizer (Pro) or user manual selection
import { planChunksSync, extractChunkBatch, markDocumentExtractionError, EXTRACTION_BATCH_SIZE } from '../steps/extract-events';
import type { ChunkJob, ExtractionLanguageWarning } from '../steps/extract-events';
import { consolidateEventsStep, fetchAllEventsForCase } from '../steps/consolidate-events';
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
import type { PipelineWarning } from '../steps/finalize';
import { analyzeExpenses } from '@/services/expenses/expense-analyzer';
import type { ExpenseAnalysisResult } from '@/services/expenses/expense-analyzer';
import { extractExpensesFromOcr } from '@/services/expenses/expense-extractor';
import type { ExpenseExtractionResult } from '@/services/expenses/expense-extractor';
import { shouldUseMapReduce, summarizeDocumentBatchByIds } from '@/services/synthesis/document-summarizer';
import type { DocumentSummary, DocumentRef } from '@/services/synthesis/document-summarizer';
import type { CostStep } from '@/services/cost-tracking/cost-calculator';
import { calculateTokenCost, buildPipelineSummary, mergeUsage, createEmptyUsage } from '@/services/cost-tracking/cost-calculator';
import { partitionSectionPlan, isDocSanitariaBatchPath, PARALLEL_SECTIONS_PER_WAVE } from '../steps/section-partition';
import { planDocSanitariaEventBatches, planRcDocSanitariaBatches, stripWindowArtifacts, filterImagesForBatch } from '../steps/doc-sanitaria-batch';
import { buildFailedSectionFallback } from '../steps/section-fallback';
import { checkSelectiveCoverage, buildOmissionBanner } from '@/services/validation/selective-coverage';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import { MISTRAL_MODELS } from '@/lib/mistral/client';
import { PIPELINE_LIMITS } from '@/lib/pipeline-limits';

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

    // Mark case as 'errore' — retry once if DB write fails (prevents stuck 'elaborazione' state)
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error: updateError } = await supabase
        .from('cases')
        .update({
          processing_stage: 'errore',
          perizia_metadata: { ...existingMetadata, lastError: errorMessage, lastErrorAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId);
      if (!updateError) break;
      if (attempt === 0) {
        logger.warn('pipeline', `onFailure: first attempt to mark case ${caseId} as errore failed: ${updateError.message}, retrying...`);
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        logger.error('pipeline', `onFailure: CRITICAL — failed to mark case ${caseId} as errore after 2 attempts: ${updateError.message}`);
      }
    }

    // Reset stuck documents to 'errore' so they don't stay in intermediate states
    await supabase
      .from('documents')
      .update({ processing_status: 'errore', processing_error: 'Pipeline fallita', updated_at: new Date().toISOString() })
      .eq('case_id', caseId)
      .in('processing_status', ['ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso', 'in_coda']);

    logger.error('pipeline', `Pipeline failed permanently for case ${caseId}: ${errorMessage}`);

    // Refund credits for failed pipeline
    try {
      const { data: caseForRefund } = await supabase
        .from('cases')
        .select('user_id')
        .eq('id', caseId)
        .single();
      if (caseForRefund) {
        // Find the consumption transactions for this case (newest first → amount).
        const { data: transactions } = await supabase
          .from('credit_transactions')
          .select('amount')
          .eq('user_id', caseForRefund.user_id)
          .eq('entity_id', caseId)
          .eq('type', 'consumption')
          .eq('operation', 'elaborazione')
          .order('created_at', { ascending: false });

        // IDEMPOTENCY: refundCredits is NOT idempotent (it just adds credits). If
        // onFailure is delivered twice for the same case (Inngest re-delivery /
        // manual replay) the user would be refunded twice. Only refund when there
        // are FEWER refunds than consumptions for this case+operation, so each
        // consumption is refunded at most once (a legitimate re-run adds a new
        // consumption and is therefore still refundable).
        const { data: existingRefunds } = await supabase
          .from('credit_transactions')
          .select('id')
          .eq('user_id', caseForRefund.user_id)
          .eq('entity_id', caseId)
          .eq('type', 'refund')
          .eq('operation', 'elaborazione');

        const consumptionCount = transactions?.length ?? 0;
        const refundCount = existingRefunds?.length ?? 0;

        // Oversized-input failures are NOT refundable: the OCR cost was really
        // incurred and refunding would let an attacker trip the page cap on a
        // loop (deduct → fail → refund) to get free OCR. The user keeps the
        // charge for the work performed; rate limiting bounds repetition.
        const isInputTooLarge = errorMessage.includes('[INPUT_TOO_LARGE]');

        if (isInputTooLarge) {
          logger.warn('pipeline', `Not refunding case ${caseId} — oversized input (OCR cost already incurred)`);
        } else if (consumptionCount > 0 && refundCount >= consumptionCount) {
          logger.info('pipeline', `Skipping refund for case ${caseId} — already refunded (${refundCount} refunds >= ${consumptionCount} consumptions)`);
        } else if (consumptionCount > 0) {
          const refundAmount = Math.abs(transactions![0].amount as number);
          const { refundCredits } = await import('@/services/credits/credit-service');
          await refundCredits(
            caseForRefund.user_id as string,
            refundAmount,
            'elaborazione',
            caseId,
            { reason: 'pipeline_failed', error: errorMessage.slice(0, 200) },
          );
          logger.info('pipeline', `Refunded ${refundAmount} credits for failed case ${caseId}`);
        }
      }
    } catch (refundErr) {
      logger.error('pipeline', 'Failed to refund credits after pipeline failure', {
        caseId,
        error: refundErr instanceof Error ? refundErr.message : 'unknown',
      });
    }

    // Report to Sentry with safe context (no patient data)
    Sentry.captureException(
      errorObj instanceof Error ? errorObj : new Error(errorMessage),
      {
        tags: { component: 'pipeline', stage: stage || 'unknown' },
        extra: { caseId },
      },
    );
    await Sentry.flush(2000);

    // Send failure email notification to the user
    try {
      const { data: caseForNotif } = await supabase
        .from('cases')
        .select('code, user_id')
        .eq('id', caseId)
        .single();
      if (caseForNotif) {
        const { sendPipelineFailureEmail } = await import('@/services/email/email-service');
        await sendPipelineFailureEmail(
          caseForNotif.user_id as string,
          (caseForNotif.code as string) ?? caseId,
          caseId,
          stage,
        );
      }
    } catch (notifErr) {
      logger.warn('pipeline', 'Failed to send failure email notification', {
        error: notifErr instanceof Error ? notifErr.message : 'unknown',
      });
    }
  } catch (err) {
    logger.error('pipeline', 'Failed to mark case as errore in onFailure handler', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ─── Unified Pipeline ───────────────────────────────────────────────
// Single function: OCR → Extraction → Consolidation → Report
// Classification is handled on-demand in the UI (Step 1) before pipeline start.

export const processCase = inngest.createFunction(
  {
    id: 'process-case',
    retries: 3,
    // AFFIDABILITÀ SOTTO CARICO (2026-07-04) — Inngest accetta max 2 entry:
    // 1) POOL GLOBALE MISTRAL (scope account, chiave statica condivisa con
    //    regenerate-report): max N STEP in esecuzione simultanea tra tutte le
    //    pipeline = semaforo distribuito gestito sulle chiamate LLM. Gli step
    //    eccedenti restano IN CODA FIFO (non falliscono, non consumano compute).
    //    Tarato sui limiti REALI del workspace (admin console, 2026-07-04):
    //    mistral-large-2512 = 1M token/min e 1,25 req/sec. 12 step in volo con
    //    chiamate lunghe (30-60s) ≈ 15-25 chiamate/min ≈ 500-800K TPM: dentro
    //    con margine per CoVe/header. Il vincolo stretto è l'RPS sulle chiamate
    //    BREVI (classify, cap dedicato più sotto nel suo job).
    // 2) LOCK PER-CASO: mai due pipeline sullo stesso caso (race/audit).
    concurrency: [
      { scope: 'account', key: '"mistral-pool"', limit: 12 },
      { limit: 1, key: 'event.data.caseId' },
    ],
    // Coda ordinata degli AVVII: 100 utenti che lanciano insieme = 100 run
    // accodati a 10/min (burst 5), non 100 pipeline che si contendono l'API.
    // L'attesa avviene nella coda Inngest, non in una lambda Vercel.
    throttle: { limit: 10, period: '1m', burst: 5 },
    cancelOn: [
      { event: 'case/pipeline.cancelled', match: 'data.caseId' },
    ],
    onFailure: async ({ event }) => handlePipelineFailure(event),
  },
  { event: 'case/pipeline.start' },
  async ({ event, step, attempt }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

    // Pipeline health tracking — accumulated across all steps, saved to perizia_metadata at finalize
    const pipelineWarnings: PipelineWarning[] = [];

    // ── Step 0+1: Init pipeline + fetch metadata (combined to reduce overhead) ──
    const caseData = await step.run('init-pipeline', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      // Fetch case to preserve existing perizia_metadata
      const { data: caseRow } = await supabase
        .from('cases')
        .select('perizia_metadata')
        .eq('id', caseId)
        .single();
      const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
      // Clear stale warnings/progress from previous runs, set processing progress
      const { pipelineWarnings: _pw, processingProgress: _pp, classificationProgress: _cp, ...cleanMeta } = existingMeta;
      void _pw; void _pp; void _cp; // destructured to exclude from cleanMeta
      await supabase
        .from('cases')
        .update({
          processing_stage: 'elaborazione',
          perizia_metadata: {
            ...cleanMeta,
            processingProgress: { phase: 'ocr' },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId);
      logger.info('pipeline', `Marked case ${caseId} as elaborazione`);
      return fetchCaseMetadata(caseId, userId);
    });
    const { documents: allDocuments } = caseData;

    if (allDocuments.length === 0) {
      throw new Error('No documents to process');
    }

    // ── Step 1.5: dedup documenti identici (QA 2026-06-11) ───────
    // Un PDF caricato due volte duplicava eventi/spese/verbatim a valle
    // (ITT assurdi, totali gonfiati). Si processa UNA copia per contenuto.
    const dedup = await step.run('dedup-documents', () => dedupCaseDocuments(caseId, allDocuments));
    const duplicateIds = new Set(dedup.duplicates.map((d) => d.documentId));
    const documents = allDocuments.filter((d) => !duplicateIds.has(d.id));
    if (dedup.duplicates.length > 0) {
      pipelineWarnings.push({
        step: 'dedup',
        severity: 'warning',
        message: `${dedup.duplicates.length} ${dedup.duplicates.length === 1 ? 'documento identico a un altro è stato escluso' : 'documenti identici ad altri sono stati esclusi'} dall'analisi (contenuto contato una volta sola): ${dedup.duplicates.map((d) => d.fileName).join(', ')}`,
        failedCount: dedup.duplicates.length,
        totalCount: allDocuments.length,
      });
    }
    if (documents.length === 0) {
      throw new Error('No documents to process after dedup');
    }

    // ── Step 2: OCR all documents (parallel, fault-tolerant) ──
    // Mistral allows 24 req/sec — full parallelism is safe.
    // Each step.run is a separate Inngest step (serverless invocation).
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
      throw new Error('Tutti i documenti hanno fallito l\'OCR. Verifica che i file siano leggibili.');
    }

    // OCR guard rail: if > 50% docs fail, likely a systemic issue
    const ocrFailedCount = documents.length - ocrResults.length;
    if (ocrFailedCount > 0) {
      const failedDocNames = documents
        .filter((d) => !ocrResults.some((r) => r.documentId === d.id))
        .map((d) => d.fileName)
        .slice(0, 20);

      if (ocrFailedCount > documents.length / 2) {
        throw new Error(
          `OCR fallito su ${ocrFailedCount}/${documents.length} documenti (>50%). ` +
          `Documenti falliti: ${failedDocNames.join(', ')}. Possibile errore sistemico.`,
        );
      }

      pipelineWarnings.push({
        step: 'ocr',
        severity: 'warning',
        message: `${ocrFailedCount} di ${documents.length} documenti hanno fallito l'OCR`,
        failedCount: ocrFailedCount,
        totalCount: documents.length,
        failedItems: failedDocNames,
      });
      logger.warn('pipeline', `OCR partial failure: ${ocrFailedCount}/${documents.length} docs failed`);
    }

    // ── Page cap (denial-of-wallet guard) ──
    // Sum the real OCR page count and hard-stop BEFORE the expensive extraction +
    // synthesis stages if the case is absurdly large. OCR cost is already bounded
    // upstream (per-file size cap + doc count cap); this gate bounds the much
    // larger downstream LLM cost. Fail loud → onFailure refunds the elaboration.
    const totalOcrPagesForCap = ocrResults.reduce((sum, r) => sum + (r.pageCount ?? 0), 0);
    if (totalOcrPagesForCap > PIPELINE_LIMITS.MAX_PAGES_PER_RUN) {
      // INPUT_TOO_LARGE marker: this failure is the USER's oversized input, and the
      // OCR cost was already incurred. onFailure must NOT refund it (otherwise an
      // attacker could trip the cap repeatedly to get free OCR via the refund).
      throw new Error(
        `[INPUT_TOO_LARGE] Caso troppo grande: ${totalOcrPagesForCap} pagine totali ` +
        `(limite ${PIPELINE_LIMITS.MAX_PAGES_PER_RUN}). Suddividi la documentazione in più casi e riprova.`,
      );
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
        pipelineMode: (
          (caseRow as Record<string, unknown>).pipeline_mode
          ?? (caseRow.case_type === 'analisi_spese_mediche' ? 'expenses_only' : 'full')
        ) as PipelineMode,
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

    // Mark docs as extracting + update processing progress
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
      // Update processing progress for UI
      const { data: caseRow } = await supabase
        .from('cases')
        .select('perizia_metadata')
        .eq('id', caseId)
        .single();
      const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
      await supabase.from('cases').update({
        perizia_metadata: {
          ...existingMeta,
          processingProgress: {
            phase: 'extraction',
            ocrCompleted: ocrResults.length,
            totalDocs: documents.length,
            totalChunks: allChunkJobs.length,
          },
        },
        updated_at: new Date().toISOString(),
      }).eq('id', caseId);
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
        // Wave A.6: surface chunk-text truncation as a pipeline warning so the
        // perito sees explicitly that some OCR content was dropped during
        // extraction. Otherwise the silent truncation can hide missing events.
        if (result.value.truncationWarnings && result.value.truncationWarnings.length > 0) {
          for (const w of result.value.truncationWarnings) {
            pipelineWarnings.push({
              step: 'extraction',
              severity: 'warning',
              message: `Testo OCR troncato in estrazione: documento "${w.fileName}" pp ${w.pageRange} (${w.originalChars} → ${w.truncatedChars} caratteri). Possibile perdita di eventi clinici in queste pagine.`,
              failedItems: [w.fileName],
            });
          }
        }
        // "Mai perdere un fatto": JSON LLM riparato/recuperato (non parse pulito) →
        // la coda può mancare. Aggregato per file (no spam per-chunk). Gli eventi
        // recuperati sono già flaggati requires_verification a monte.
        if (result.value.recoveryWarnings && result.value.recoveryWarnings.length > 0) {
          const byFile = new Map<string, { pageRanges: string[]; recoveredCount: number }>();
          for (const rw of result.value.recoveryWarnings) {
            const entry = byFile.get(rw.fileName) ?? { pageRanges: [], recoveredCount: 0 };
            entry.pageRanges.push(rw.pageRange);
            entry.recoveredCount += rw.recoveredCount;
            byFile.set(rw.fileName, entry);
          }
          for (const [fileName, agg] of byFile.entries()) {
            // Wording distinto: con 0 eventi recuperati NON dire "recuperati" (fuorviante).
            const message = agg.recoveredCount > 0
              ? `Estrazione JSON parziale: documento "${fileName}" pp ${agg.pageRanges.join(', ')} — ${agg.recoveredCount} eventi recuperati da output LLM malformato; eventi successivi in questi segmenti potrebbero mancare. Verificare la completezza nel documento originale.`
              : `Estrazione JSON malformato: documento "${fileName}" pp ${agg.pageRanges.join(', ')} — output LLM non interamente analizzabile, nessun evento estratto da questi segmenti. Verificare manualmente le pagine indicate nel documento originale.`;
            pipelineWarnings.push({
              step: 'extraction',
              severity: 'warning',
              message,
              failedItems: [fileName],
            });
          }
        }
        // Wave C.4: surface language detection so the perito knows the
        // pipeline saw German/English content. Aggregated per file so we
        // don't spam one warning per chunk.
        if (result.value.languageWarnings && result.value.languageWarnings.length > 0) {
          const byFile = new Map<string, ExtractionLanguageWarning>();
          for (const lw of result.value.languageWarnings) {
            if (!byFile.has(lw.fileName)) byFile.set(lw.fileName, lw);
          }
          const langLabels: Record<'de' | 'en' | 'mixed', string> = {
            de: 'tedesco',
            en: 'inglese',
            mixed: 'misto (italiano + altra lingua)',
          };
          for (const lw of byFile.values()) {
            pipelineWarnings.push({
              step: 'extraction',
              severity: 'warning',
              message: `Documento "${lw.fileName}" rilevato in ${langLabels[lw.language]}. I concetti medici sono stati tradotti in italiano nei titoli; le citazioni testuali (sourceText) restano in lingua originale.`,
              failedItems: [lw.fileName],
            });
          }
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

    // Guard rails: detect extraction failures
    const failedBatchCount = batchSettled.filter((r) => r.status === 'rejected').length;
    const totalBatches = batchSettled.length;
    const failedDocCount = markErrorJobs.length;

    // Total failure: 0 events from any document
    if (extractionResults.length === 0) {
      throw new Error(
        `Estrazione fallita: 0 eventi da ${ocrResults.length} documenti (${failedBatchCount}/${totalBatches} batch falliti). ` +
        'Errore sistematico nell\'estrazione.',
      );
    }

    // Partial failure: track in pipeline warnings
    if (failedDocCount > 0) {
      const failedDocNames = markErrorJobs.map((j) => {
        const ocr = ocrResults.find((r) => r.documentId === j.documentId);
        return ocr?.fileName ?? j.documentId;
      });
      pipelineWarnings.push({
        step: 'extraction',
        severity: failedDocCount > ocrResults.length / 2 ? 'critical' : 'warning',
        message: `${failedDocCount} di ${ocrResults.length} documenti non hanno prodotto eventi`,
        failedCount: failedDocCount,
        totalCount: ocrResults.length,
        failedItems: failedDocNames.slice(0, 20),
      });
      logger.warn('pipeline', `Extraction partial failure: ${failedDocCount}/${ocrResults.length} docs produced 0 events (${failedBatchCount}/${totalBatches} batches failed)`);
    }

    // "Mai perdere un fatto": un batch (chunk) che ha esaurito i retry significa
    // che parte di un documento NON è stata estratta — anche quando il doc ha eventi
    // da ALTRI chunk e quindi non rientra in failedDocCount (0 eventi). Senza questo
    // warning la perdita parziale resterebbe silenziosa su doc multi-chunk.
    if (failedBatchCount > 0) {
      pipelineWarnings.push({
        step: 'extraction',
        severity: failedBatchCount > totalBatches / 2 ? 'critical' : 'warning',
        message: `${failedBatchCount} di ${totalBatches} blocchi di estrazione non completati (testo troppo denso / output troncato): alcuni eventi potrebbero non essere stati estratti. Verificare i documenti interessati.`,
        failedCount: failedBatchCount,
        totalCount: totalBatches,
      });
    }

    // ── Step 4: Consolidate events ───────────────────────────────
    const consolidationResult = await step.run(
      'consolidate-events',
      () => consolidateEventsStep(caseId, extractionResults),
    );

    // Re-read all events from DB for downstream steps.
    // NOT inside step.run — avoids serializing full array through Inngest step output (4MB limit).
    // Non-step code re-executes on each Inngest re-invocation; it's just a DB read — cheap and safe.
    const allEvents = await fetchAllEventsForCase(caseId);
    if (allEvents.length === 0 && consolidationResult.totalEventsCount > 0) {
      throw new Error(`CRITICAL: consolidation reported ${consolidationResult.totalEventsCount} events but fetchAllEventsForCase returned 0 — DB read may have failed`);
    }

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

          // Fetch OCR text from all documents + their file names so the LLM
          // can attribute each expense to its source document.
          // Lavini bug 2026-05-11: pagine cross-doc mescolate causavano
          // troncatura a 150K chars con perdita silente di documenti interi
          // (es. avviso pagopa in pagina 3 di "ritiro cartella clinica.pdf").
          const docIds = ocrResults.map((r) => r.documentId);
          const pages: Array<Record<string, unknown>> = [];
          for (let bi = 0; bi < docIds.length; bi += 200) {
            const { data } = await supabase
              .from('pages')
              .select('document_id, page_number, ocr_text')
              .in('document_id', docIds.slice(bi, bi + 200))
              // Order by (document_id, page_number) so each document's pages
              // stay contiguous. Prevents the truncation cap from cutting a
              // document mid-way and losing the parts that follow.
              .order('document_id', { ascending: true })
              .order('page_number', { ascending: true });
            if (data) pages.push(...data);
          }

          if (pages.length === 0) {
            logger.warn('pipeline', 'No OCR pages found for expense extraction');
            return { items: [], totalAmount: null, currency: 'EUR' } as ExpenseExtractionResult;
          }

          // Fetch file names for separators so the LLM knows which document
          // each chunk of OCR belongs to (helps avoid merging distinct expenses
          // from different documents).
          const docNames = new Map<string, string>();
          for (let bi = 0; bi < docIds.length; bi += 200) {
            const { data } = await supabase
              .from('documents')
              .select('id, file_name')
              .in('id', docIds.slice(bi, bi + 200));
            if (data) {
              for (const d of data) docNames.set(d.id as string, (d.file_name as string) ?? 'documento');
            }
          }

          // Group pages by document, emit explicit document boundaries so the
          // LLM treats each PDF as a distinct unit of expenses.
          const byDoc = new Map<string, Array<{ pageNumber: number; ocrText: string }>>();
          for (const p of pages) {
            const docId = p.document_id as string;
            if (!byDoc.has(docId)) byDoc.set(docId, []);
            byDoc.get(docId)!.push({
              pageNumber: p.page_number as number,
              ocrText: (p.ocr_text as string) ?? '',
            });
          }

          const ocrText = Array.from(byDoc.entries())
            .map(([docId, pgs]) => {
              const name = docNames.get(docId) ?? 'documento';
              const body = pgs.map((pg) => pg.ocrText).join('\n');
              return `### DOCUMENTO: ${name} ###\n${body}\n### FINE DOCUMENTO ###`;
            })
            .join('\n\n');

          // Try to find a diagnosis from extracted events for context
          const diagnosisEvents = allEvents
            .filter((e) => e.eventType === 'diagnosi' && e.title)
            .map((e) => e.title);
          const finalDiagnosis = diagnosisEvents.length > 0 ? diagnosisEvents.join('; ') : undefined;

          return extractExpensesFromOcr(ocrText, finalDiagnosis);
        });

        // Step B: Algorithmic analysis on extracted events (backward compat)
        expenseResult = await step.run('analyze-expenses', () => {
          const eventsForAnalysis = allEvents.map((e) => ({
            event_type: e.eventType,
            title: e.title,
            description: e.description,
            event_date: e.eventDate,
            facility: e.facility,
            source_type: e.sourceType,
            source_text: e.sourceText ?? null,
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

      // Expense extraction LLM usage (expenses_only path, previously untracked)
      const expenseCostSteps: CostStep[] = [];
      if (llmExpenseResult?.usage && llmExpenseResult.usage.totalTokens > 0) {
        expenseCostSteps.push({
          step: 'expense-extraction',
          model: MISTRAL_MODELS.MISTRAL_LARGE,
          promptTokens: llmExpenseResult.usage.promptTokens,
          completionTokens: llmExpenseResult.usage.completionTokens,
          costUSD: calculateTokenCost(MISTRAL_MODELS.MISTRAL_LARGE, llmExpenseResult.usage),
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
        pipelineCost: buildPipelineSummary(expenseCostSteps, ocrResults.reduce((sum, r) => sum + (r.ocrPages ?? r.pageCount), 0)),
        pipelineWarnings,
      }));

      await step.run('send-notification', () => sendNotificationStep(caseId, userId));

      return {
        success: true,
        caseId,
        pipelineMode,
        documentsProcessed: extractionResults.length,
        newEventsInserted: consolidationResult.newEventsCount,
        totalEvents: allEvents.length,
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
        detectAnomaliesStep(caseId, allEvents, updatedMetadata.caseType, updatedMetadata.caseTypes),
      ),
      step.run('detect-missing-documents', () =>
        detectMissingDocumentsStep(caseId, allEvents, updatedMetadata.caseType, updatedMetadata.caseTypes),
      ),
      step.run('calculate-periods', () =>
        calculatePeriodsStep(allEvents, updatedMetadata.caseType),
      ),
    ]);

    const imageAnalysisResults = imageSettled.status === 'fulfilled' ? imageSettled.value : [];
    const rawAnomalies = anomalySettled.status === 'fulfilled' ? anomalySettled.value : [];
    const missingDocs = missingSettled.status === 'fulfilled' ? missingSettled.value : [];
    const calculations = calcSettled.status === 'fulfilled' ? calcSettled.value : [];

    // Track analysis failures as pipeline warnings
    const analysisSteps: Array<{ name: string; label: string; settled: PromiseSettledResult<unknown> }> = [
      { name: 'image-analysis', label: 'Analisi immagini diagnostiche', settled: imageSettled },
      { name: 'anomaly-detection', label: 'Rilevamento anomalie', settled: anomalySettled },
      { name: 'missing-docs', label: 'Rilevamento documenti mancanti', settled: missingSettled },
      { name: 'calculations', label: 'Calcoli medico-legali (ITT/ITP)', settled: calcSettled },
    ];
    for (const { name, label, settled } of analysisSteps) {
      if (settled.status === 'rejected') {
        const reason = settled.reason instanceof Error ? settled.reason.message : 'unknown';
        logger.error('pipeline', `${label} failed: ${reason}`);
        pipelineWarnings.push({
          step: name,
          severity: name === 'calculations' ? 'critical' : 'warning',
          message: `${label} fallito: ${reason}`,
        });
      }
    }

    // ── Step 5.5: LLM Anomaly Resolution ─────────────────────────
    // Anomalies are resolved and saved to DB, but NO pause for user review.
    // The report generates immediately. User reviews anomalies after seeing the report.
    const anomalyResolutionRaw = await step.run(
      'resolve-anomalies',
      () => resolveAnomaliesStep(caseId, rawAnomalies, allEvents),
    );
    // Back-compat guard: runs in flight across the deploy have this step
    // memoized with the old bare-array output.
    const anomalyResolution = Array.isArray(anomalyResolutionRaw)
      ? { anomalies: anomalyResolutionRaw, usage: createEmptyUsage() }
      : anomalyResolutionRaw;
    const anomalies = anomalyResolution.anomalies;

    // ── Mark generating report ─────────────────────────────────────
    // rc-mvp: ricerca PubMed parcheggiata in legacy/ (fuori scope RC stragiudiziale).
    await step.run('mark-generazione-report', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      await supabase
        .from('cases')
        .update({
          processing_stage: 'generazione_report',
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId);
      logger.info('pipeline', `Case ${caseId} marked as generazione_report`);
    });

    // ── Section plan (resolved BEFORE summarization, so map-reduce can be
    // skipped entirely when no LLM section will consume document context —
    // e.g. deterministic doc-sanitaria + only placeholder/event sections) ──
    const classifiedDocTypes = [...new Set(ocrResults.map((r) => r.documentType))];
    const sectionPlan = await step.run('plan-report-sections', () =>
      planReportSections(updatedMetadata, allEvents, classifiedDocTypes),
    );
    if (sectionPlan.length === 0) {
      throw new Error('Section plan resulted in zero sections — cannot generate empty report');
    }
    const planConsumesDocContext = sectionPlan.some((s) => !s.isPlaceholder && s.needsOcr);

    // ── Map-reduce summarization for large cases ─────────────────
    // Each summarize-batch step fetches its own OCR text from DB,
    // so large text is never serialized as Inngest step output.
    // Volume gate: doc count alone over-triggers on many-tiny-docs cases —
    // total chars must also justify replacing raw OCR with summaries.
    // totalChars fallback (~1.8K chars/page) covers step outputs memoized
    // before the field existed (mid-deploy runs only).
    const totalOcrChars = ocrResults.reduce(
      (sum, r) => sum + (r.totalChars ?? r.pageCount * 1800), 0,
    );
    let documentSummaries: DocumentSummary[] | undefined;
    if (planConsumesDocContext && shouldUseMapReduce(ocrResults.length, totalOcrChars)) {
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
      const failedSummaryCount = summarySettled.filter((r) => r.status === 'rejected').length;
      if (failedSummaryCount > 0) {
        for (const r of summarySettled) {
          if (r.status === 'rejected') {
            logger.error('pipeline', `Summary batch failed: ${r.reason instanceof Error ? r.reason.message : 'unknown'}`);
          }
        }
        pipelineWarnings.push({
          step: 'summarization',
          severity: failedSummaryCount > summaryBatches.length / 2 ? 'critical' : 'warning',
          message: `${failedSummaryCount} di ${summaryBatches.length} batch di riassunti falliti — il report potrebbe avere meno contesto`,
          failedCount: failedSummaryCount,
          totalCount: summaryBatches.length,
        });
      }
      logger.info('pipeline', `Map-reduce: ${documentSummaries.length} document summaries generated (${failedSummaryCount} batches failed)`);
    }

    // ── Build synthesis params ────────────────────────────────────
    // Re-fetch anomalies from DB right before synthesis so we get the canonical
    // status filter (excludes llm_resolved, user_dismissed) and the perito's
    // resolution_note when present. On first run this is just the llm_confirmed
    // set with empty notes; on regenerate it picks up perito reviews.
    const synthesisAnomalies = await step.run('fetch-anomalies-for-synthesis', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { fetchAnomaliesForSynthesis } = await import('@/services/validation/anomaly-fetcher');
      return fetchAnomaliesForSynthesis(createAdminClient(), caseId);
    });

    const synthesisParams = buildSynthesisParams(
      updatedMetadata,
      allEvents,
      synthesisAnomalies,
      missingDocs,
      calculations,
      imageAnalysisResults,
      documentSummaries,
    );

    // ── Sectional report generation ───────────────────────────────
    // Generate report section by section, each in its own Inngest step.
    // Each step < 4 min, eliminating Vercel timeouts for large cases.
    // Context-independent sections (zero CTU/CTP sections consume rolling
    // context — see section-partition.ts) run CONCURRENTLY in bounded waves;
    // rolling-context consumers + doc-sanitaria AI batches run after, in
    // plan order, with the context of completed earlier-in-plan sections.
    const DOC_BATCH_SIZE = 4;

    // Helper to update generation progress in DB (planIndex is stable but
    // waves complete out of order — the title is what the user reads).
    const updateProgress = async (planIndex: number, title: string) => {
      // Best-effort UI cosmetics: a Supabase hiccup here must NEVER fail a
      // section step (it would degrade even infallible placeholder sections).
      try {
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
            currentSection: planIndex + 1,
            totalSections: sectionPlan.length,
            currentSectionTitle: title,
          },
        },
        updated_at: new Date().toISOString(),
      }).eq('id', caseId);
      } catch (progressError) {
        logger.warn('pipeline', `Progress update failed (non-blocking): ${progressError instanceof Error ? progressError.message : 'unknown'}`);
      }
    };

    // documentazione_sanitaria (AI variant): batched per CHRONOLOGICAL EVENT
    // WINDOWS (not per document). Each window is its own Inngest step → separate
    // invocation → no per-step timeout. Every event is narrated exactly once, in
    // chronological order; one analytical index for the whole section. Fixes the
    // doc-batch × event-chunk interaction that, on voluminous cases (caso-195,
    // 47 doc / 1477 eventi), made each doc-batch re-chunk ALL events →
    // duplicazione + esplosione di chiamate LLM + cronologia scombinata.
    const runDocSanitariaBatched = async (
      spec: (typeof sectionPlan)[number],
      planIndex: number,
      previousContext: Array<{ id: string; title: string; contextSummary: string }>,
    ): Promise<GeneratedSection> => {
      // RC (excludeLabTests) — distillazione v2 (2026-07-04): filtro completo
      // (lab + noise + SelettivitàPolicy) PRIMA della pianificazione, poi packing
      // PER-DOCUMENTO (mai spezzare un documento = niente ri-narrazione) con CAP
      // sul numero di finestre — il per-documento senza cap produceva troppi
      // batch sul macrodanno → reset alla finalizzazione (motivo del revert
      // 2026-06-29). Altri ruoli: per-evento come prima.
      let batches: ReturnType<typeof planDocSanitariaEventBatches>;
      if (spec.excludeLabTests) {
        const rcPlan = planRcDocSanitariaBatches(synthesisParams.events);
        batches = rcPlan.batches;
        logger.info('pipeline', `Doc-sanitaria RC distillata: ${rcPlan.stats.omitted}/${rcPlan.stats.total} eventi omessi (${Object.entries(rcPlan.stats.byCategory).map(([k, v]) => `${k}:${v}`).join(', ') || 'nessuno'}), ${batches.length} finestre`);
      } else {
        batches = planDocSanitariaEventBatches(synthesisParams.events);
      }
      // AFFIDABILITÀ (2026-07-04): ogni finestra salva il TESTO su Supabase
      // Storage e ritorna solo puntatore+meta. Lo stato memoizzato Inngest
      // viaggia nel body HTTP a ogni step (tetto Vercel ~4,5MB → 413): coi
      // testi inline lo stato cresceva col fascicolo ed era la causa del reset
      // in finalizzazione sul macrodanno. Ora è O(1): la pipeline arriva in
      // fondo a prescindere dalla dimensione del caso.
      const batchMetas: Array<{ partPath: string | null; fallbackText?: string }> = [];
      let rollingContext = [...previousContext];
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let okBatches = 0;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const contextForBatch = rollingContext;
        try {
          const batchResult = await step.run(`gen-section-documentazione_sanitaria-batch-${b}`, async () => {
            await updateProgress(planIndex, `${spec.title} (${b + 1}/${batches.length})`);

            // Fetch OCR INSIDE each batch step to avoid Inngest 4MB payload limit.
            // Each step is a separate invocation — data stays local, never serialized.
            const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
            // OCR scoped ai soli doc della finestra: evita di caricare l'OCR
            // dell'intero caso a ogni finestra (picco RAM → OOM su casi grandi).
            const batchOcr = await fetchDocumentsOcrContext(caseId, batch.docIds);

            const { generateSingleSection, buildDocSanitariaChunkSpec } = await import('@/services/synthesis/section-generator');
            // 2.4-A1: `attempt` (Inngest retry counter) varies the seed so a
            // retry after a validator block produces a real variant.
            // disableChunking: la finestra è già ≤ un blocco cronologico → niente
            // auto-split annidato.
            const generated = await generateSingleSection({
              spec: buildDocSanitariaChunkSpec(spec, b, batches.length),
              synthesisParams: {
                ...synthesisParams,
                events: batch.events,
                // Solo le immagini dei documenti di QUESTA finestra → niente
                // duplicati/misplacement tra finestre.
                imageAnalysis: filterImagesForBatch(synthesisParams.imageAnalysis, batch.docIds),
              },
              previousContext: contextForBatch,
              documentsOcrText: batchOcr,
              attempt,
              disableChunking: true,
            });
            const body = generated.content?.trim() ?? '';
            if (body.length === 0) {
              return { partPath: null as string | null, contextSummary: '', usage: generated.usage };
            }
            const { saveSectionPart } = await import('../steps/section-part-store');
            const partPath = await saveSectionPart(caseId, spec.id, `batch-${b}`, body);
            return { partPath, contextSummary: generated.contextSummary, usage: generated.usage };
          });

          const legacyInline = (batchResult as { content?: string }).content?.trim() ?? '';
          if (batchResult.partPath) {
            batchMetas.push({ partPath: batchResult.partPath });
            rollingContext = [...rollingContext, { id: spec.id, title: spec.title, contextSummary: batchResult.contextSummary }];
            okBatches++;
          } else if (legacyInline.length > 0) {
            // BACK-COMPAT deploy: run in flight con step memoizzati nel VECCHIO
            // formato (content inline, senza partPath) — il testo già generato
            // (e pagato) NON si scarta: entra nel combine come inline.
            batchMetas.push({ partPath: null, fallbackText: legacyInline });
            rollingContext = [...rollingContext, { id: spec.id, title: spec.title, contextSummary: batchResult.contextSummary }];
            okBatches++;
          } else {
            logger.warn('pipeline', `Doc-sanitaria finestra ${b + 1}/${batches.length} contenuto vuoto`, { caseId });
          }
          if (batchResult.usage) {
            totalPromptTokens += batchResult.usage.promptTokens;
            totalCompletionTokens += batchResult.usage.completionTokens;
          }
        } catch (batchError) {
          // Resilienza (mirror di generateDocSanitariaChunked): una finestra
          // fallita lascia un marker localizzato e si prosegue; si rilancia solo
          // se TUTTE falliscono (→ fallback esterno di sezione).
          logger.error('pipeline', `Doc-sanitaria finestra ${b + 1}/${batches.length} (${batch.dateRange}) fallita: ${batchError instanceof Error ? batchError.message : 'unknown'}`, { caseId });
          batchMetas.push({ partPath: null, fallbackText: `*[⚠ Blocco ${b + 1}/${batches.length} (${batch.dateRange}) non generato per un errore tecnico — usare "Rigenera sezione" per completarlo.]*` });
        }
      }

      if (okBatches === 0) {
        throw new Error(`Doc-sanitaria: tutte le ${batches.length} finestre cronologiche sono fallite`);
      }

      // COMBINE dentro uno step: legge le parti da Storage, unisce, applica il
      // check di copertura (che prima viveva nell'orchestratore: ora il testo
      // combinato non transita più nello stato del run) e salva il combinato.
      const combineResult = await step.run('gen-section-documentazione_sanitaria-combine', async () => {
        const { loadSectionPart, saveSectionPart } = await import('../steps/section-part-store');
        const { buildAttiIndex, summarizeForContext } = await import('@/services/synthesis/section-generator');
        const texts: string[] = [];
        for (const meta of batchMetas) {
          if (meta.partPath) {
            try {
              texts.push(await loadSectionPart(meta.partPath));
            } catch (loadError) {
              logger.error('pipeline', `Doc-sanitaria: parte ${meta.partPath} non recuperata: ${loadError instanceof Error ? loadError.message : 'unknown'}`, { caseId });
              texts.push('*[⚠ Blocco non recuperato per un errore tecnico — usare "Rigenera sezione" per completarlo.]*');
            }
          } else if (meta.fallbackText) {
            texts.push(meta.fallbackText);
          }
        }
        // Indice analitico COMPLETO unico in testa + le narrazioni delle finestre.
        // RC (perizia "semplice"): NIENTE inventario degli atti (il gold Lavini non ce l'ha).
        const combinedContent = [
          ...(spec.excludeLabTests ? [] : [buildAttiIndex(synthesisParams.events)]),
          // Ogni batch a volte ri-emette l'intestazione di sezione (## Titolo o **Titolo**)
          // nonostante la direttiva → toglila da ogni blocco; quella canonica è aggiunta una
          // volta a valle (assembleSectionBlock). Su Bigon il grassetto compariva 9×.
          ...texts.map((p) => stripWindowArtifacts(p, spec.title)),
        ].join('\n\n');

        // Garanzia di completezza della doc-sanitaria SELETTIVA (decisione medici
        // 2026-06-12): ogni evento T1 deve comparire; se manca, banner + warning.
        let finalContent = combinedContent;
        let coverageMissing = 0;
        let coverageT1 = 0;
        if (!combinedContent.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) {
          const coverage = checkSelectiveCoverage(combinedContent, synthesisParams.events);
          coverageMissing = coverage.missing.length;
          coverageT1 = coverage.t1Total;
          if (coverageMissing > 0) {
            finalContent = `${buildOmissionBanner(coverageMissing)}\n\n${combinedContent}`;
          }
        }

        const contentPath = await saveSectionPart(caseId, spec.id, 'combined', finalContent);
        return {
          contentPath,
          contextSummary: spec.contextMaxChars > 0 ? summarizeForContext(finalContent, spec.contextMaxChars) : '',
          wordCount: finalContent.split(/\s+/).filter((w) => w.length > 0).length,
          coverageMissing,
          coverageT1,
        };
      });

      if (combineResult.coverageMissing > 0) {
        pipelineWarnings.push({
          step: 'synthesis',
          severity: 'warning',
          message: `Documentazione sanitaria selettiva: ${combineResult.coverageMissing} ${combineResult.coverageMissing === 1 ? 'evento clinicamente rilevante potrebbe non essere citato' : 'eventi clinicamente rilevanti potrebbero non essere citati'} nel testo (su ${combineResult.coverageT1} verificati). Banner di verifica inserito nella sezione.`,
          failedCount: combineResult.coverageMissing,
          totalCount: combineResult.coverageT1,
        });
      }

      return {
        id: spec.id,
        title: spec.title,
        content: '',
        contentPath: combineResult.contentPath,
        contextSummary: combineResult.contextSummary,
        wordCount: combineResult.wordCount,
        usage: totalPromptTokens > 0 ? {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        } : undefined,
      };
    };

    const completedSections = new Map<string, GeneratedSection>();

    // Same semantics as the old sequential loop: a section sees the context
    // of completed sections that come BEFORE it in plan order.
    const buildPreviousContext = (beforePlanIndex: number) =>
      sectionPlan.slice(0, beforePlanIndex)
        .filter((s) => completedSections.has(s.id))
        .map((s) => {
          const done = completedSections.get(s.id) as GeneratedSection;
          return { id: done.id, title: done.title, contextSummary: done.contextSummary };
        });

    const { parallel: parallelSections, sequential: sequentialSections } =
      partitionSectionPlan(sectionPlan, ocrResults.length, DOC_BATCH_SIZE, synthesisParams.events.length);

    // Parallel waves. previousContext = [] is byte-identical for these specs:
    // the generator injects rolling context ONLY for 'context-summaries'
    // consumers, which are all in the sequential tail. Per-promise catch keeps
    // partial success: a failed section never loses its wave-mates.
    //
    // GRACEFUL DEGRADATION (Tedesco live test 2026-06-11): one failed section
    // must NOT abort the rest — before this, a single burst section killed all
    // remaining waves + the tail, the validator (correctly) refused the
    // near-empty report, and a 30-minute run produced NOTHING. Now every other
    // section completes, the failed one gets an explicit technical marker, and
    // the perito regenerates just that section from the editor.
    const failedSections = new Map<string, { id: string; title: string }>();
    for (const wave of chunkArray(parallelSections, PARALLEL_SECTIONS_PER_WAVE)) {
      const waveResults = await Promise.all(wave.map(({ spec, planIndex }) =>
        step.run(`gen-section-${spec.id}`, async () => {
          await updateProgress(planIndex, spec.title);
          return generateSectionStep(caseId, spec, synthesisParams, [], attempt);
        }).then(
          (section) => ({ spec, section, error: undefined as unknown }),
          (error: unknown) => ({ spec, section: undefined, error }),
        ),
      ));
      for (const result of waveResults) {
        if (result.section) {
          completedSections.set(result.spec.id, result.section);
        } else {
          failedSections.set(result.spec.id, { id: result.spec.id, title: result.spec.title });
          logger.error('pipeline', `Section "${result.spec.id}" failed after retries — continuing with the remaining sections`, {
            error: result.error instanceof Error ? result.error.message : 'unknown',
          });
        }
      }
    }

    // Sequential tail: rolling-context consumers + doc-sanitaria AI batches.
    // A failure here also degrades to the fallback — never aborts the rest.
    for (const { spec, planIndex } of sequentialSections) {
      const previousContext = buildPreviousContext(planIndex);
      try {
        if (isDocSanitariaBatchPath(spec, ocrResults.length, DOC_BATCH_SIZE, synthesisParams.events.length)) {
          completedSections.set(spec.id, await runDocSanitariaBatched(spec, planIndex, previousContext));
        } else {
          const section = await step.run(`gen-section-${spec.id}`, async () => {
            await updateProgress(planIndex, spec.title);
            return generateSectionStep(caseId, spec, synthesisParams, previousContext, attempt);
          });
          completedSections.set(spec.id, section);
        }
      } catch (sectionError) {
        failedSections.set(spec.id, { id: spec.id, title: spec.title });
        logger.error('pipeline', `Section "${spec.id}" failed after retries — continuing with the remaining sections`, {
          error: sectionError instanceof Error ? sectionError.message : 'unknown',
        });
      }
    }

    // ULTIMA CHANCE prima del fallback (CASO-2026-219, 2026-07-14: Anamnesi+Fatto
    // fallite dopo i retry in-step): un tentativo FINALE per ogni sezione fallita,
    // a pipeline scarica (niente contesa col resto delle sezioni) e con seed
    // diverso (attempt+1). Col budget-eventi narrativo il prompt è anche molto più
    // piccolo del tentativo originale. Solo se fallisce anche questo → fallback.
    for (const failed of Array.from(failedSections.values())) {
      const spec = sectionPlan.find((s) => s.id === failed.id);
      if (!spec || completedSections.has(failed.id)) continue;
      try {
        const retried = await step.run(`gen-section-final-retry-${failed.id}`, async () => {
          await updateProgress(sectionPlan.indexOf(spec), `${spec.title} (nuovo tentativo)`);
          return generateSectionStep(caseId, spec, synthesisParams, buildPreviousContext(sectionPlan.indexOf(spec)), attempt + 1);
        });
        completedSections.set(failed.id, retried);
        failedSections.delete(failed.id);
        logger.info('pipeline', `Sezione "${failed.id}" recuperata al tentativo finale`, { caseId });
      } catch (retryError) {
        logger.error('pipeline', `Sezione "${failed.id}" fallita anche al tentativo finale`, {
          error: retryError instanceof Error ? retryError.message : 'unknown',
        });
      }
    }

    // Stand-ins for failed sections: the report stays structurally complete
    // (titles present for the validator) with an explicit technical marker.
    for (const failed of failedSections.values()) {
      if (!completedSections.has(failed.id)) {
        completedSections.set(failed.id, buildFailedSectionFallback(failed));
      }
    }
    if (failedSections.size > 0) {
      pipelineWarnings.push({
        step: 'synthesis',
        severity: 'critical',
        message: `${failedSections.size === 1 ? 'Una sezione non è stata generata' : `${failedSections.size} sezioni non sono state generate`} per un errore tecnico (${Array.from(failedSections.values()).map((f) => f.title).join(', ')}). Il resto del report è completo: rigenera solo le sezioni mancanti dall'editor con "Rigenera sezione".`,
        failedCount: failedSections.size,
        totalCount: sectionPlan.length,
      });
      // Osservabilità: sezioni fallite = degrado silenzioso (il caso "completa"
      // ma con fallback). Segnala a Sentry con soli ID sezione/caso (nessun
      // contenuto clinico) così l'admin lo vede senza aprire il caso.
      Sentry.captureMessage(
        `Report case ${caseId}: ${failedSections.size}/${sectionPlan.length} sezioni fallite (${Array.from(failedSections.values()).map((f) => f.id).join(', ')})`,
        'warning',
      );
    }

    // NB: il check di copertura della doc-sanitaria selettiva (banner T1) vive
    // ORA dentro lo step 'gen-section-documentazione_sanitaria-combine' — il
    // contenuto combinato sta su Storage e non transita più nello stato del run.
    // Sezioni non-batched (casi piccoli): coprono via generateSingleSection.
    const docSanSection = completedSections.get('documentazione_sanitaria');
    if (docSanSection && docSanSection.content.length > 0 && !docSanSection.contentPath
      && !docSanSection.content.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) {
      // Path NON-batched (sezione generata in un solo step, contenuto inline):
      // stesso check di completezza di prima.
      const coverage = checkSelectiveCoverage(docSanSection.content, synthesisParams.events);
      if (coverage.missing.length > 0) {
        completedSections.set('documentazione_sanitaria', {
          ...docSanSection,
          content: `${buildOmissionBanner(coverage.missing.length)}\n\n${docSanSection.content}`,
        });
        pipelineWarnings.push({
          step: 'synthesis',
          severity: 'warning',
          message: `Documentazione sanitaria selettiva: ${coverage.missing.length} ${coverage.missing.length === 1 ? 'evento clinicamente rilevante potrebbe non essere citato' : 'eventi clinicamente rilevanti potrebbero non essere citati'} nel testo (su ${coverage.t1Total} verificati). Banner di verifica inserito nella sezione.`,
          failedCount: coverage.missing.length,
          totalCount: coverage.t1Total,
        });
      }
    }

    // Assemble in PLAN order regardless of completion order.
    const accumulatedSections: GeneratedSection[] = sectionPlan
      .filter((s) => completedSections.has(s.id))
      .map((s) => completedSections.get(s.id) as GeneratedSection);

    // Save report (partial or complete). sectionPlan feeds the real-prompt
    // version hash (2.3); no ignoreValidation on the automatic pipeline.
    const synthesisResult = await step.run('assemble-and-save-report', () =>
      assembleSectionsAndSaveReport(caseId, accumulatedSections, synthesisParams, sectionPlan),
    );

    const synthesisWordCount = synthesisResult.wordCount;

    // Verifica claim-level anti-misgrounded (judge Medium ≠ generatore Large):
    // scrive la lista "da verificare" nei metadata del report. MAI bloccante
    // (runClaimVerification ingoia ogni errore) — ritorna solo conteggi (O(1)).
    const claimVerify = await step.run('claim-verify-report', async () => {
      const { runClaimVerification, toClaimEventDigest } = await import('@/inngest/steps/claim-verify');
      return runClaimVerification({
        caseId,
        reportId: synthesisResult.reportId,
        events: toClaimEventDigest(synthesisParams.events),
      });
    });

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

    if (claimVerify.usage && claimVerify.usage.totalTokens > 0) {
      costSteps.push({
        step: 'claim-verify',
        model: MISTRAL_MODELS.MISTRAL_MEDIUM,
        promptTokens: claimVerify.usage.promptTokens,
        completionTokens: claimVerify.usage.completionTokens,
        costUSD: calculateTokenCost(MISTRAL_MODELS.MISTRAL_MEDIUM, claimVerify.usage),
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

    // Extraction LLM usage (was silently untracked — the single biggest gap:
    // admin cost view captured only ~35% of the real pipeline spend).
    // `usage` guard covers step outputs memoized before the field existed.
    const extractionUsage = batchSettled.reduce(
      (acc, r) => (r.status === 'fulfilled' && r.value.usage ? mergeUsage(acc, r.value.usage) : acc),
      createEmptyUsage(),
    );
    if (extractionUsage.totalTokens > 0) {
      costSteps.push({
        step: 'extraction',
        model: MISTRAL_MODELS.MISTRAL_LARGE,
        promptTokens: extractionUsage.promptTokens,
        completionTokens: extractionUsage.completionTokens,
        costUSD: calculateTokenCost(MISTRAL_MODELS.MISTRAL_LARGE, extractionUsage),
      });
    }

    // Anomaly-resolution LLM usage (up to 25 calls per run, previously untracked)
    if (anomalyResolution.usage.totalTokens > 0) {
      costSteps.push({
        step: 'anomaly-resolution',
        model: MISTRAL_MODELS.MISTRAL_LARGE,
        promptTokens: anomalyResolution.usage.promptTokens,
        completionTokens: anomalyResolution.usage.completionTokens,
        costUSD: calculateTokenCost(MISTRAL_MODELS.MISTRAL_LARGE, anomalyResolution.usage),
      });
    }

    // Map-reduce summaries usage (one LLM call per document on large cases)
    if (documentSummaries && documentSummaries.length > 0) {
      const summariesUsage = documentSummaries.reduce(
        (acc, s) => (s.usage ? mergeUsage(acc, s.usage) : acc),
        createEmptyUsage(),
      );
      if (summariesUsage.totalTokens > 0) {
        costSteps.push({
          step: 'map-reduce-summaries',
          model: MISTRAL_MODELS.MISTRAL_LARGE,
          promptTokens: summariesUsage.promptTokens,
          completionTokens: summariesUsage.completionTokens,
          costUSD: calculateTokenCost(MISTRAL_MODELS.MISTRAL_LARGE, summariesUsage),
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
      pipelineWarnings,
    }));

    // ── Send notification ────────────────────────────────────────
    await step.run('send-notification', () => sendNotificationStep(caseId, userId));

    return {
      success: true,
      caseId,
      documentsProcessed: extractionResults.length,
      newEventsInserted: consolidationResult.newEventsCount,
      totalEvents: allEvents.length,
      anomaliesDetected: anomalies.length,
      missingDocuments: missingDocs.length,
      reportVersion: synthesisResult.reportVersion,
      synthesisWordCount: synthesisResult.wordCount ?? synthesisWordCount,
    };
  },
);
