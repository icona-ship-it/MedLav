import * as Sentry from '@sentry/nextjs';
import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { CaseMetadata } from '../steps/types';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { fetchAllEventsForCase } from '../steps/consolidate-events';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import {
  buildSynthesisParams,
  planReportSections,
  generateSectionStep,
  assembleSectionsAndSaveReport,
} from '../steps/generate-report';
import type { GeneratedSection } from '@/services/synthesis/section-generation-types';
import { chunkArray } from '@/lib/array-utils';
import {
  MAP_REDUCE_THRESHOLD_DOCS,
  shouldUseMapReduce,
  summarizeDocumentBatchByIds,
} from '@/services/synthesis/document-summarizer';
import type { DocumentSummary, DocumentRef } from '@/services/synthesis/document-summarizer';
import { partitionSectionPlan, isDocSanitariaBatchPath, PARALLEL_SECTIONS_PER_WAVE } from '../steps/section-partition';
import { planDocSanitariaEventBatches } from '../steps/doc-sanitaria-batch';
import { buildFailedSectionFallback } from '../steps/section-fallback';
import { checkSelectiveCoverage, buildOmissionBanner } from '@/services/validation/selective-coverage';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';

/**
 * Full report regeneration via the SECTIONAL deterministic pipeline (same path
 * as the initial generation). Triggered by `/api/processing/regenerate` (which
 * does the fast prep — events + anomalies + missing-docs — then dispatches this
 * event). Running here (Inngest) gives per-section steps + doc-sanitaria
 * batching → no Vercel timeout/truncation, and the spese/ITT-ITP tables are the
 * DETERMINISTIC sentinels (not LLM prose). The previous monolithic path
 * (generateSynthesis) is no longer used by the regenerate button.
 *
 * onFailure restores the case to 'completato' (the PREVIOUS report stays valid)
 * — never 'errore'. The regenerate is CHARGED (rigenerazione_report) by the
 * /api/processing/regenerate route, so onFailure also refunds it (idempotently)
 * since the user did not receive a fresh full report.
 */

const DOC_BATCH_SIZE = 4;

async function restoreCompletatoOnFailure(event: { data: unknown }): Promise<void> {
  try {
    // Inngest's onFailure wraps the ORIGINAL triggering event under data.event,
    // and the failure cause under data.error — same shape used by process-case.ts.
    const failureData = event.data as { event: { data: { caseId: string } }; error?: { message?: string } };
    const caseId = failureData.event.data.caseId;
    const errMsg = failureData.error?.message ?? 'Errore sconosciuto durante la rigenerazione';
    const supabase = createAdminClient();
    const { data: caseRow } = await supabase
      .from('cases')
      .select('perizia_metadata')
      .eq('id', caseId)
      .single();
    const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
    const cleaned = Object.fromEntries(
      Object.entries(existingMeta).filter(([k]) => k !== 'generationProgress'),
    );
    // The old report is still in the DB and valid → go back to 'completato',
    // NOT 'errore'. Surface the actual failure cause as a soft note for the UI/toast.
    await supabase
      .from('cases')
      .update({
        processing_stage: 'completato',
        perizia_metadata: { ...cleaned, lastRegenerateError: `Rigenerazione fallita: ${errMsg}. Il report precedente è invariato.` },
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);
    logger.error('regenerate-report', `Regeneration failed for case ${caseId}: ${errMsg} — report precedente preservato`);

    // Refund the regeneration cost — the user paid for a full report and got none.
    // IDEMPOTENT (same pattern as process-case): only refund when there are fewer
    // refunds than consumptions for this case+operation, so an Inngest re-delivery
    // never double-refunds.
    await refundRegenerationIfOwed(supabase, caseId, errMsg);
  } catch (err) {
    logger.error('regenerate-report', `onFailure handler error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

/**
 * Idempotent refund of the `rigenerazione_report` charge for a failed regeneration.
 * Mirrors the consumption-vs-refund counting used by the main pipeline.
 */
async function refundRegenerationIfOwed(
  supabase: ReturnType<typeof createAdminClient>,
  caseId: string,
  errMsg: string,
): Promise<void> {
  const { data: caseForRefund } = await supabase
    .from('cases')
    .select('user_id')
    .eq('id', caseId)
    .single();
  if (!caseForRefund) return;
  const userId = caseForRefund.user_id as string;

  const { data: consumptions } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('entity_id', caseId)
    .eq('type', 'consumption')
    .eq('operation', 'rigenerazione_report')
    .order('created_at', { ascending: false });
  const { data: refunds } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('entity_id', caseId)
    .eq('type', 'refund')
    .eq('operation', 'rigenerazione_report');

  const consumptionCount = consumptions?.length ?? 0;
  const refundCount = refunds?.length ?? 0;
  if (consumptionCount === 0 || refundCount >= consumptionCount) return;

  const refundAmount = Math.abs(consumptions![0].amount as number);
  const { refundCredits } = await import('@/services/credits/credit-service');
  await refundCredits(userId, refundAmount, 'rigenerazione_report', caseId, {
    reason: 'regenerate_failed',
    error: errMsg.slice(0, 200),
  });
  logger.info('regenerate-report', `Refunded ${refundAmount} credits for failed regeneration of case ${caseId}`);
}

export const regenerateReport = inngest.createFunction(
  {
    id: 'regenerate-report',
    retries: 2,
    concurrency: [
      { limit: 50 },
      { limit: 5, key: 'event.data.userId' },
    ],
    cancelOn: [{ event: 'case/pipeline.cancelled', match: 'data.caseId' }],
    onFailure: async ({ event }) => restoreCompletatoOnFailure(event),
  },
  { event: 'case/report.regenerate' },
  async ({ event, step, attempt }) => {
    const { caseId, userId, ignoreValidation } = event.data as {
      caseId: string;
      userId: string;
      /** 2.4-A2 manual unlock: save even with QUALITY blocking findings
       * (GDPR/fabrication leaks stay blocking — see report-validator.ts). */
      ignoreValidation?: boolean;
    };

    // ── Gather inputs from DB (the route already wrote fresh anomalies/missing-docs) ──
    const prep = await step.run('regen-fetch-inputs', async () => {
      const supabase = createAdminClient();
      const { data: caseRow, error } = await supabase
        .from('cases')
        .select('case_type, case_types, case_role, patient_initials, perizia_metadata, module_id, user_id')
        .eq('id', caseId)
        .single();
      if (error || !caseRow) throw new Error(`Case not found: ${caseId}`);
      if (caseRow.user_id !== userId) throw new Error('Unauthorized regenerate');

      const rawCaseTypes = caseRow.case_types as string[] | null;
      const caseTypes: CaseType[] = rawCaseTypes && rawCaseTypes.length > 0
        ? (rawCaseTypes as CaseType[])
        : [caseRow.case_type as CaseType];

      const metadata: CaseMetadata = {
        caseId,
        caseType: caseRow.case_type as CaseType,
        caseTypes,
        caseRole: caseRow.case_role as CaseRole,
        patientInitials: caseRow.patient_initials as string | null,
        userId,
        periziaMetadata: (caseRow.perizia_metadata ?? undefined) as PeriziaMetadata | undefined,
        moduleId: (caseRow.module_id ?? undefined) as string | undefined,
      };

      // Document types (all docs, any status) for section planning + the doc
      // list for documentazione_sanitaria batching and map-reduce summaries.
      const { data: docs } = await supabase
        .from('documents')
        .select('id, document_type, file_name')
        .eq('case_id', caseId);
      const docList = (docs ?? []).map((d) => ({
        id: d.id as string,
        documentType: (d.document_type ?? 'altro') as string,
        fileName: (d.file_name ?? '') as string,
      }));
      const documentTypes = [...new Set(docList.map((d) => d.documentType))];
      const docRefs: DocumentRef[] = docList.map((d) => ({
        documentId: d.id,
        fileName: d.fileName,
        documentType: d.documentType,
      }));

      return { metadata, documentTypes, docIds: docList.map((d) => d.id), docRefs };
    });

    const allEvents: ConsolidatedEvent[] = await step.run('regen-fetch-events', () => fetchAllEventsForCase(caseId));
    if (allEvents.length === 0) {
      throw new Error('Nessun evento disponibile per la rigenerazione del report');
    }

    const sectionPlan = await step.run('regen-plan-sections', () =>
      planReportSections(prep.metadata, allEvents, prep.documentTypes),
    );
    if (sectionPlan.length === 0) {
      throw new Error('Section plan vuoto — impossibile rigenerare un report vuoto');
    }
    const planConsumesDocContext = sectionPlan.some((s) => !s.isPlaceholder && s.needsOcr);

    // ── Map-reduce summaries: REGENERATED with the same gate as the first run.
    // They were previously skipped here ("not re-run on regenerate"), so on
    // ≥10-doc cases a regenerated report silently had LESS context than the
    // original — needsOcr sections saw NO document content at all (summaries
    // replace raw OCR in those prompts, and the regenerate path passes none).
    let documentSummaries: DocumentSummary[] | undefined;
    if (planConsumesDocContext && prep.docRefs.length >= MAP_REDUCE_THRESHOLD_DOCS) {
      // Volume gate parity with process-case: chars counted inside a step so
      // the (potentially large) OCR text is never an Inngest step output.
      const totalOcrChars = await step.run('regen-check-ocr-volume', async () => {
        const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
        const allOcr = await fetchDocumentsOcrContext(caseId);
        return allOcr.reduce((sum, d) => sum + d.totalChars, 0);
      });
      if (shouldUseMapReduce(prep.docRefs.length, totalOcrChars)) {
        const SUMMARY_BATCH_SIZE = 5;
        const summaryBatches = chunkArray(prep.docRefs, SUMMARY_BATCH_SIZE);
        const summarySettled = await Promise.allSettled(
          summaryBatches.map((batch, idx) =>
            step.run(`regen-summarize-batch-${idx}`, () => summarizeDocumentBatchByIds(batch)),
          ),
        );
        documentSummaries = summarySettled
          .filter((r): r is PromiseFulfilledResult<DocumentSummary[]> => r.status === 'fulfilled')
          .flatMap((r) => r.value);
        const failedSummaryCount = summarySettled.filter((r) => r.status === 'rejected').length;
        if (failedSummaryCount > 0) {
          logger.error('regenerate-report', `${failedSummaryCount}/${summaryBatches.length} summary batches failed — regenerated report may have less context`);
        }
      }
    }

    const synthesisParams = await step.run('regen-build-params', async () => {
      const supabase = createAdminClient();
      const { fetchAnomaliesForSynthesis } = await import('@/services/validation/anomaly-fetcher');
      const anomalies = await fetchAnomaliesForSynthesis(supabase, caseId);
      const missingDocs = detectMissingDocuments({
        events: allEvents,
        caseType: prep.metadata.caseType,
        caseTypes: prep.metadata.caseTypes.length > 1 ? prep.metadata.caseTypes : undefined,
      });
      const calculations = calculateMedicoLegalPeriods(
        allEvents.map((e) => ({ event_date: e.eventDate, event_type: e.eventType, title: e.title, description: e.description })),
      );
      // imageAnalysis/pubmed: not re-run on regenerate (mirrors the previous
      // behaviour) — facts come from deterministic sentinels. documentSummaries
      // ARE re-run (above) for context parity with the first generation.
      return buildSynthesisParams(prep.metadata, allEvents, anomalies, missingDocs, calculations, [], documentSummaries);
    });

    // Progress writer (drives the existing UI progress bar).
    const updateProgress = async (i: number, title: string) => {
      // Best-effort UI cosmetics: a Supabase hiccup must never fail a section step.
      try {
        const supabase = createAdminClient();
        const { data: caseRow } = await supabase.from('cases').select('perizia_metadata').eq('id', caseId).single();
        const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
        await supabase.from('cases').update({
          perizia_metadata: {
            ...existingMeta,
            generationProgress: { currentSection: i + 1, totalSections: sectionPlan.length, currentSectionTitle: title },
          },
          updated_at: new Date().toISOString(),
        }).eq('id', caseId);
      } catch (progressError) {
        logger.warn('regenerate-report', `Progress update failed (non-blocking): ${progressError instanceof Error ? progressError.message : 'unknown'}`);
      }
    };

    // Surface the REAL section count to the UI immediately (currentSection 0 / N)
    // so the progress bar doesn't show a fake 0/1 then jump when work begins.
    await step.run('regen-init-progress', () => updateProgress(-1, 'Inizializzazione…'));

    // ── Sectional generation (mirrors process-case: context-independent
    // sections run concurrently in bounded waves; rolling-context consumers +
    // doc-sanitaria AI batches run after, in plan order) ──
    // documentazione_sanitaria (AI variant): batched per FINESTRE CRONOLOGICHE DI
    // EVENTI (mirror di process-case). Ogni finestra = uno step Inngest separato:
    // ogni evento narrato una sola volta, in ordine cronologico, indice analitico
    // unico, niente chunking annidato/duplicazione/timeout su casi voluminosi.
    const runDocSanitariaBatched = async (
      spec: (typeof sectionPlan)[number],
      planIndex: number,
      previousContext: Array<{ id: string; title: string; contextSummary: string }>,
    ): Promise<GeneratedSection> => {
      const batches = planDocSanitariaEventBatches(synthesisParams.events);
      const parts: string[] = [];
      let rollingContext = [...previousContext];
      let promptTokens = 0;
      let completionTokens = 0;
      let okBatches = 0;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const contextForBatch = rollingContext;
        try {
          const batchResult = await step.run(`regen-section-documentazione_sanitaria-batch-${b}`, async () => {
            await updateProgress(planIndex, `${spec.title} (${b + 1}/${batches.length})`);
            const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
            const allOcr = await fetchDocumentsOcrContext(caseId);
            const batchOcr = allOcr.filter((d) => batch.docIds.includes(d.documentId));
            const { generateSingleSection, buildDocSanitariaChunkSpec } = await import('@/services/synthesis/section-generator');
            // 2.4-A1: vary seed per Inngest retry so a blocked report isn't reproduced byte-identical.
            return generateSingleSection({
              spec: buildDocSanitariaChunkSpec(spec, b, batches.length),
              synthesisParams: { ...synthesisParams, events: batch.events },
              previousContext: contextForBatch,
              documentsOcrText: batchOcr,
              attempt,
              disableChunking: true,
            });
          });
          const body = batchResult.content?.trim() ?? '';
          if (body.length > 0) {
            parts.push(body);
            rollingContext = [...rollingContext, { id: spec.id, title: spec.title, contextSummary: batchResult.contextSummary }];
            okBatches++;
          } else {
            logger.warn('regenerate-report', `Doc-sanitaria finestra ${b + 1}/${batches.length}: contenuto vuoto`, { caseId });
          }
          if (batchResult.usage) {
            promptTokens += batchResult.usage.promptTokens;
            completionTokens += batchResult.usage.completionTokens;
          }
        } catch (batchError) {
          logger.error('regenerate-report', `Doc-sanitaria finestra ${b + 1}/${batches.length} (${batch.dateRange}) fallita: ${batchError instanceof Error ? batchError.message : 'unknown'}`, { caseId });
          parts.push(`*[⚠ Blocco ${b + 1}/${batches.length} (${batch.dateRange}) non generato per un errore tecnico — usare "Rigenera sezione" per completarlo.]*`);
        }
      }

      if (okBatches === 0) {
        throw new Error(`Doc-sanitaria: tutte le ${batches.length} finestre cronologiche sono fallite`);
      }

      const { buildAttiIndex, summarizeForContext } = await import('@/services/synthesis/section-generator');
      const combinedContent = [buildAttiIndex(synthesisParams.events), ...parts].join('\n\n');
      return {
        id: spec.id,
        title: spec.title,
        content: combinedContent,
        contextSummary: spec.contextMaxChars > 0 ? summarizeForContext(combinedContent, spec.contextMaxChars) : '',
        wordCount: combinedContent.split(/\s+/).filter((w) => w.length > 0).length,
        usage: promptTokens > 0 ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } : undefined,
      };
    };

    const completedSections = new Map<string, GeneratedSection>();
    // Graceful degradation (mirrors process-case): one failed section never
    // aborts the rest — it degrades to an explicit technical marker.
    const failedSections = new Map<string, { id: string; title: string }>();

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
      partitionSectionPlan(sectionPlan, prep.docIds.length, DOC_BATCH_SIZE, synthesisParams.events.length);

    for (const wave of chunkArray(parallelSections, PARALLEL_SECTIONS_PER_WAVE)) {
      const waveResults = await Promise.all(wave.map(({ spec, planIndex }) =>
        step.run(`regen-section-${spec.id}`, async () => {
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
          logger.error('regenerate-report', `Section "${result.spec.id}" failed after retries — continuing with the remaining sections`, {
            error: result.error instanceof Error ? result.error.message : 'unknown',
          });
        }
      }
    }

    for (const { spec, planIndex } of sequentialSections) {
      const previousContext = buildPreviousContext(planIndex);
      try {
        if (isDocSanitariaBatchPath(spec, prep.docIds.length, DOC_BATCH_SIZE, synthesisParams.events.length)) {
          completedSections.set(spec.id, await runDocSanitariaBatched(spec, planIndex, previousContext));
        } else {
          const section = await step.run(`regen-section-${spec.id}`, async () => {
            await updateProgress(planIndex, spec.title);
            return generateSectionStep(caseId, spec, synthesisParams, previousContext, attempt);
          });
          completedSections.set(spec.id, section);
        }
      } catch (sectionError) {
        failedSections.set(spec.id, { id: spec.id, title: spec.title });
        logger.error('regenerate-report', `Section "${spec.id}" failed after retries — continuing with the remaining sections`, {
          error: sectionError instanceof Error ? sectionError.message : 'unknown',
        });
      }
    }

    // Stand-ins for failed sections (explicit technical marker, regenerable
    // one-by-one from the editor) — the report stays structurally complete.
    for (const failed of failedSections.values()) {
      if (!completedSections.has(failed.id)) {
        completedSections.set(failed.id, buildFailedSectionFallback(failed));
      }
    }

    // Copertura T1 della doc-sanitaria selettiva (mirrors process-case):
    // ogni evento clinicamente rilevante deve comparire nel testo combinato.
    const docSanSection = completedSections.get('documentazione_sanitaria');
    if (docSanSection && !docSanSection.content.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) {
      const coverage = checkSelectiveCoverage(docSanSection.content, allEvents);
      if (coverage.missing.length > 0) {
        completedSections.set('documentazione_sanitaria', {
          ...docSanSection,
          content: `${buildOmissionBanner(coverage.missing.length)}\n\n${docSanSection.content}`,
        });
        logger.warn('regenerate-report', `Doc-sanitaria selettiva: ${coverage.missing.length}/${coverage.t1Total} eventi T1 non riscontrati — banner inserito`);
      }
    }

    // Assemble in PLAN order regardless of completion order.
    const accumulatedSections: GeneratedSection[] = sectionPlan
      .filter((s) => completedSections.has(s.id))
      .map((s) => completedSections.get(s.id) as GeneratedSection);

    // Save the report (partial or complete) — new version, deterministic facts.
    // sectionPlan → real-prompt version hash (2.3); ignoreValidation → manual
    // unlock with audit trail (2.4-A2, GDPR leaks never overridable).
    await step.run('regen-assemble-and-save', () =>
      assembleSectionsAndSaveReport(caseId, accumulatedSections, synthesisParams, sectionPlan, {
        ignoreValidation: ignoreValidation === true,
        userId,
      }),
    );

    // Sections that failed degrade to explicit markers (regenerable one-by-one)
    // — the run completes normally so the user gets the report; Sentry tracks
    // the degradation for follow-up.
    if (failedSections.size > 0) {
      Sentry.captureMessage(
        `regenerate-report: ${failedSections.size}/${sectionPlan.length} sections degraded to fallback for case ${caseId}`,
      );
    }

    // Success: back to 'completato' + clear progress (no email/doc-completion — this is a regenerate).
    await step.run('regen-finalize', async () => {
      const supabase = createAdminClient();
      const { data: caseRow } = await supabase.from('cases').select('perizia_metadata').eq('id', caseId).single();
      const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
      const cleaned = Object.fromEntries(
        Object.entries(existingMeta).filter(([k]) => k !== 'generationProgress' && k !== 'lastRegenerateError'),
      );
      await supabase.from('cases').update({
        processing_stage: 'completato',
        perizia_metadata: cleaned,
        updated_at: new Date().toISOString(),
      }).eq('id', caseId);
    });

    return { caseId, sections: accumulatedSections.length };
  },
);
