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
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';
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
import { heartbeatCase } from '../steps/heartbeat';
import type { DocumentSummary, DocumentRef } from '@/services/synthesis/document-summarizer';
import { partitionSectionPlan, isDocSanitariaBatchPath, PARALLEL_SECTIONS_PER_WAVE } from '../steps/section-partition';
import { planDocSanitariaEventBatches, planRcDocSanitariaBatches, stripWindowArtifacts, filterImagesForBatch } from '../steps/doc-sanitaria-batch';
import { buildFailedSectionFallback } from '../steps/section-fallback';
import { abortIfStaleRun, isStaleRunAbort } from '../steps/stale-run-guard';
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
    // CAS sullo stage attivo (audit 2026-08-11, A-2): se il caso è stato annullato
    // (stage 'idle') o eliminato, NON lo si resuscita a 'completato' — la
    // condizione fallisce e la riga resta com'è. Solo un fallimento di una regen
    // ANCORA attiva ('generazione_report') torna al report precedente.
    await supabase
      .from('cases')
      .update({
        processing_stage: 'completato',
        perizia_metadata: { ...cleaned, lastRegenerateError: `Rigenerazione fallita: ${errMsg}. Il report precedente è invariato.` },
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .in('processing_stage', ['generazione_report']);
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
    // AFFIDABILITÀ SOTTO CARICO (2026-07-04): stesso POOL GLOBALE MISTRAL di
    // process-case (scope account, chiave statica condivisa) — pipeline e
    // rigenerazioni si contendono la STESSA capacità LLM in una coda FIFO
    // gestita, invece di sommarsi contro i rate limit del workspace. + LOCK
    // PER-CASO (no race sui report, no doppio costo, copre i retry).
    concurrency: [
      // Stesso pool di process-case, tarato sui limiti reali del workspace
      // (large-2512: 1M TPM, 1,25 RPS — console 2026-07-04).
      { scope: 'account', key: '"mistral-pool"', limit: 12 },
      { limit: 1, key: 'event.data.caseId' },
    ],
    // Throttle degli AVVII di rigenerazione (coda, non errori).
    throttle: { limit: 8, period: '1m', burst: 4 },
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

      // Reload the persisted diagnostic-image analyses from the latest report so
      // the regenerated sections re-embed the images. Pixtral is NOT re-run on
      // regenerate; without this the HARD FILTER strips every image marker as
      // hallucinated (its whitelist is built from imageAnalysis).
      const { data: lastReport } = await supabase
        .from('reports')
        .select('generation_metadata')
        .eq('case_id', caseId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastMeta = (lastReport?.generation_metadata ?? null) as { imageAnalysis?: ImageAnalysisResult[] } | null;
      // null = chiave imageAnalysis ASSENTE (report pre-fix) → fallback Pixtral a
      // valle; [] o [...] = chiave PRESENTE (report post-fix) → nessun fallback.
      const imageAnalysis: ImageAnalysisResult[] | null =
        lastMeta && 'imageAnalysis' in lastMeta && Array.isArray(lastMeta.imageAnalysis)
          ? lastMeta.imageAnalysis
          : null;

      return { metadata, documentTypes, docIds: docList.map((d) => d.id), docRefs, imageAnalysis };
    });

    // Fallback SOLO per i report pre-fix (chiave imageAnalysis ASSENTE → prep
    // null): ri-esegui l'analisi immagini così la rigenerazione re-incorpora le
    // immagini invece di strisciarle come allucinate. Pixtral costa ~€0.10 SOLO se
    // il caso ha immagini (analyzeDiagnosticImagesStep esce subito con [] altrimenti);
    // riusa eventi/OCR, NIENTE re-estrazione che altererebbe la cronologia. I report
    // post-fix portano già la chiave (anche []) → niente re-run successivi.
    const imageAnalysis: ImageAnalysisResult[] = prep.imageAnalysis !== null
      ? prep.imageAnalysis
      : await step.run('regen-analyze-images', async () => {
          const { analyzeDiagnosticImagesStep } = await import('../steps/link-images');
          return analyzeDiagnosticImagesStep(caseId, prep.metadata.caseType);
        });

    // P1 SCALA: l'array eventi cresce col caso (a ~3000+ eventi supera i 4MB di
    // un Inngest step-output → fallimento netto). Letto nel BODY (non come step),
    // ri-eseguito a ogni invocazione: e' solo una DB read, cheap, e identico a
    // come fa process-case.ts. Determinismo tra i replay: il lock per-caso
    // esclude ALTRI run; le edit UI degli eventi sono bloccate a pipeline in
    // corso dalla guardia su processing_stage in event-actions (2026-07-04) e
    // l'ordine dei pari è stabilizzato dal tiebreak .order('id').
    const allEvents: ConsolidatedEvent[] = await fetchAllEventsForCase(caseId);
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
            step.run(`regen-summarize-batch-${idx}`, async () => {
              const result = await summarizeDocumentBatchByIds(batch);
              await heartbeatCase(caseId); // caso enorme: >60min di riassunti senza scritture = auto-fail ingiusto
              return result;
            }),
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

    // P1 SCALA: synthesisParams CONTIENE l'array eventi → NON puo' essere uno
    // step-output (4MB). Mirror process-case.ts: le anomalie (output piccolo)
    // restano uno step memoizzato; missingDocs/calculations/synthesisParams sono
    // CPU calcolati nel BODY dagli allEvents gia' in memoria (ri-eseguiti a ogni
    // invocazione, cheap). Cosi' l'array eventi non viene mai serializzato da Inngest.
    const synthesisAnomalies = await step.run('regen-fetch-anomalies', async () => {
      const { fetchAnomaliesForSynthesis } = await import('@/services/validation/anomaly-fetcher');
      return fetchAnomaliesForSynthesis(createAdminClient(), caseId);
    });
    const missingDocs = detectMissingDocuments({
      events: allEvents,
      caseType: prep.metadata.caseType,
      caseTypes: prep.metadata.caseTypes.length > 1 ? prep.metadata.caseTypes : undefined,
    });
    const calculations = calculateMedicoLegalPeriods(
      allEvents.map((e) => ({ event_date: e.eventDate, event_type: e.eventType, title: e.title, description: e.description, date_precision: e.datePrecision, temporal_scope: e.temporalScope })),
      undefined,
      prep.metadata.periziaMetadata?.dataSinistro,
    );
    // imageAnalysis: ri-letto dal metadata dell'ultimo report (prep) cosi' le
    // immagini sopravvivono alla rigenerazione — NON ri-eseguito via Pixtral.
    // pubmed: non ri-eseguito. documentSummaries: ri-eseguiti (sopra) per parita' di contesto.
    const synthesisParams = buildSynthesisParams(prep.metadata, allEvents, synthesisAnomalies, missingDocs, calculations, imageAnalysis, documentSummaries);

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
      // RC — distillazione v2 (2026-07-04): filtro completo (lab + noise +
      // SelettivitàPolicy) PRIMA della pianificazione, poi packing PER-DOCUMENTO
      // con CAP sulle finestre (il per-documento senza cap rompeva la
      // finalizzazione sul macrodanno). Altri ruoli: per-evento come prima.
      let batches: ReturnType<typeof planDocSanitariaEventBatches>;
      if (spec.excludeLabTests) {
        const rcPlan = planRcDocSanitariaBatches(synthesisParams.events);
        batches = rcPlan.batches;
        logger.info('pipeline', `Doc-sanitaria RC distillata (regen): ${rcPlan.stats.omitted}/${rcPlan.stats.total} eventi omessi (${Object.entries(rcPlan.stats.byCategory).map(([k, v]) => `${k}:${v}`).join(', ') || 'nessuno'}), ${batches.length} finestre`);
      } else {
        batches = planDocSanitariaEventBatches(synthesisParams.events);
      }
      // AFFIDABILITÀ (2026-07-04): come in process-case — le finestre salvano il
      // testo su Storage e ritornano puntatore+meta; lo stato Inngest resta O(1)
      // rispetto alla dimensione del fascicolo (tetto body Vercel ~4,5MB).
      const batchMetas: Array<{ partPath: string | null; fallbackText?: string }> = [];
      let rollingContext = [...previousContext];
      let promptTokens = 0;
      let completionTokens = 0;
      let okBatches = 0;
      // Fedeltà citazioni: raccolte per finestra, risalgono sulla sezione combinata.
      const ungroundedQuotesAll: string[] = [];
      let quotesSnappedAll = 0;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const contextForBatch = rollingContext;
        try {
          const batchResult = await step.run(`regen-section-documentazione_sanitaria-batch-${b}`, async () => {
            await abortIfStaleRun(caseId, 'section'); // anti-zombie (A-2): un run annullato non macina finestre
            await updateProgress(planIndex, `${spec.title} (${b + 1}/${batches.length})`);
            const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
            // OCR scoped ai soli doc della finestra: evita di caricare l'OCR
            // dell'intero caso a ogni finestra (picco RAM → OOM su casi grandi).
            const batchOcr = await fetchDocumentsOcrContext(caseId, batch.docIds);
            const { generateSingleSection, buildDocSanitariaChunkSpec } = await import('@/services/synthesis/section-generator');
            // 2.4-A1: vary seed per Inngest retry so a blocked report isn't reproduced byte-identical.
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
            return {
              partPath,
              contextSummary: generated.contextSummary,
              usage: generated.usage,
              // Output piccolo e bounded (cap 12 citazioni ≤160 char per finestra).
              ungroundedQuotes: generated.ungroundedQuotes,
              quotesSnapped: generated.quotesSnapped,
            };
          });
          const legacyInline = (batchResult as { content?: string }).content?.trim() ?? '';
          if (batchResult.partPath) {
            batchMetas.push({ partPath: batchResult.partPath });
            rollingContext = [...rollingContext, { id: spec.id, title: spec.title, contextSummary: batchResult.contextSummary }];
            okBatches++;
          } else if (legacyInline.length > 0) {
            // BACK-COMPAT deploy: step memoizzati pre-refactor (content inline)
            // — il testo già generato non si scarta.
            batchMetas.push({ partPath: null, fallbackText: legacyInline });
            rollingContext = [...rollingContext, { id: spec.id, title: spec.title, contextSummary: batchResult.contextSummary }];
            okBatches++;
          } else {
            logger.warn('regenerate-report', `Doc-sanitaria finestra ${b + 1}/${batches.length}: contenuto vuoto`, { caseId });
          }
          if (batchResult.usage) {
            promptTokens += batchResult.usage.promptTokens;
            completionTokens += batchResult.usage.completionTokens;
          }
          const bq = (batchResult as { ungroundedQuotes?: string[] }).ungroundedQuotes;
          if (bq && bq.length > 0) ungroundedQuotesAll.push(...bq);
          const bs = (batchResult as { quotesSnapped?: number }).quotesSnapped;
          if (bs) quotesSnappedAll += bs;
        } catch (batchError) {
          if (isStaleRunAbort(batchError)) throw batchError; // il run zombie muore, non degrada
          logger.error('regenerate-report', `Doc-sanitaria finestra ${b + 1}/${batches.length} (${batch.dateRange}) fallita: ${batchError instanceof Error ? batchError.message : 'unknown'}`, { caseId });
          batchMetas.push({ partPath: null, fallbackText: `*[⚠ Blocco ${b + 1}/${batches.length} (${batch.dateRange}) non generato per un errore tecnico — usare "Rigenera sezione" per completarlo.]*` });
        }
      }

      if (okBatches === 0) {
        throw new Error(`Doc-sanitaria: tutte le ${batches.length} finestre cronologiche sono fallite`);
      }
      if (quotesSnappedAll > 0) {
        logger.info('regenerate-report', `Quote snapping: ${quotesSnappedAll} citazioni agganciate al testo esatto dei documenti`, { caseId });
      }

      // COMBINE dentro uno step (testo su Storage, coverage inclusa — il
      // contenuto non transita nello stato del run).
      const combineResult = await step.run('regen-section-documentazione_sanitaria-combine', async () => {
        const { loadSectionPart, saveSectionPart } = await import('../steps/section-part-store');
        const { buildAttiIndex, summarizeForContext } = await import('@/services/synthesis/section-generator');
        const texts: string[] = [];
        for (const meta of batchMetas) {
          if (meta.partPath) {
            try {
              texts.push(await loadSectionPart(meta.partPath));
            } catch (loadError) {
              logger.error('regenerate-report', `Doc-sanitaria: parte ${meta.partPath} non recuperata: ${loadError instanceof Error ? loadError.message : 'unknown'}`, { caseId });
              texts.push('*[⚠ Blocco non recuperato per un errore tecnico — usare "Rigenera sezione" per completarlo.]*');
            }
          } else if (meta.fallbackText) {
            texts.push(meta.fallbackText);
          }
        }
        // RC (perizia "semplice"): NIENTE elenco-inventario degli atti (il gold Lavini non
        // ce l'ha) — era l'"Elenco analitico degli atti (415...)" su Bigon. Altri ruoli invariato.
        const combinedContent = [
          ...(spec.excludeLabTests ? [] : [buildAttiIndex(synthesisParams.events)]),
          // Togli l'intestazione di sezione ri-emessa da ogni batch — `## Titolo` o `**Titolo**`
          // (su Bigon il grassetto ×9); la canonica è aggiunta una volta a valle.
          ...texts.map((p) => stripWindowArtifacts(p, spec.title)),
        ].join('\n\n');

        let finalContent = combinedContent;
        let coverageMissing = 0;
        let coverageT1 = 0;
        if (!combinedContent.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) {
          const coverage = checkSelectiveCoverage(combinedContent, allEvents);
          coverageMissing = coverage.missing.length;
          coverageT1 = coverage.t1Total;
          // RC (trascrizione depositabile): niente banner nel testo — segnale nel
          // pannello "Da controllare" via coverageMissing (regen-finalize).
          if (coverageMissing > 0 && !spec.excludeLabTests) {
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

      return {
        id: spec.id,
        title: spec.title,
        content: '',
        contentPath: combineResult.contentPath,
        contextSummary: combineResult.contextSummary,
        wordCount: combineResult.wordCount,
        usage: promptTokens > 0 ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } : undefined,
        // Fedeltà citazioni (audit 2026-08-11, J-1): le «...» senza riscontro
        // raccolte per finestra DEVONO risalire sulla sezione combinata, come in
        // process-case.ts. Senza, il warning "quote-verification" della
        // rigenerazione perdeva TUTTE le citazioni della doc-sanitaria batched (la
        // sezione più ricca di virgolettate) e il finalize, ricalcolandolo a vuoto,
        // CANCELLAVA anche il warning legittimo del primo run → pannello pulito su
        // un report che non lo è. Era il bug del RE-RUN di un caso voluminoso.
        ...(ungroundedQuotesAll.length > 0 ? { ungroundedQuotes: ungroundedQuotesAll.slice(0, 24) } : {}),
        ...(quotesSnappedAll > 0 ? { quotesSnapped: quotesSnappedAll } : {}),
        ...(combineResult.coverageMissing > 0 ? { coverageMissing: combineResult.coverageMissing, coverageT1: combineResult.coverageT1 } : {}),
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
          await abortIfStaleRun(caseId, 'section'); // anti-zombie (A-2)
          await updateProgress(planIndex, spec.title);
          return generateSectionStep(caseId, spec, synthesisParams, [], attempt);
        }).then(
          (section) => ({ spec, section, error: undefined as unknown }),
          (error: unknown) => {
            if (isStaleRunAbort(error)) throw error; // il run zombie muore, non degrada
            return { spec, section: undefined, error };
          },
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
            await abortIfStaleRun(caseId, 'section'); // anti-zombie (A-2)
            await updateProgress(planIndex, spec.title);
            return generateSectionStep(caseId, spec, synthesisParams, previousContext, attempt);
          });
          completedSections.set(spec.id, section);
        }
      } catch (sectionError) {
        if (isStaleRunAbort(sectionError)) throw sectionError; // il run zombie muore, non degrada
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

    // Copertura T1 della doc-sanitaria selettiva (mirrors process-case).
    // Path BATCHED: la coverage vive nello step '-combine' (contenuto su
    // Storage, contentPath) — qui si copre solo il path non-batched inline.
    const docSanSection = completedSections.get('documentazione_sanitaria');
    if (docSanSection && docSanSection.content.length > 0 && !docSanSection.contentPath
      && !docSanSection.content.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) {
      const coverage = checkSelectiveCoverage(docSanSection.content, allEvents);
      if (coverage.missing.length > 0) {
        const isRcTranscription = sectionPlan.some((s) => s.id === 'documentazione_sanitaria' && s.excludeLabTests);
        completedSections.set('documentazione_sanitaria', {
          ...docSanSection,
          // RC: il segnale va al pannello "Da controllare" (regen-finalize), non nel testo.
          content: isRcTranscription ? docSanSection.content : `${buildOmissionBanner(coverage.missing.length)}\n\n${docSanSection.content}`,
          coverageMissing: coverage.missing.length,
          coverageT1: coverage.t1Total,
        });
        logger.warn('regenerate-report', `Doc-sanitaria: ${coverage.missing.length}/${coverage.t1Total} eventi T1 non riscontrati${isRcTranscription ? '' : ' — banner inserito'}`);
      }
    }

    // Assemble in PLAN order regardless of completion order.
    const accumulatedSections: GeneratedSection[] = sectionPlan
      .filter((s) => completedSections.has(s.id))
      .map((s) => completedSections.get(s.id) as GeneratedSection);

    // Save the report (partial or complete) — new version, deterministic facts.
    // sectionPlan → real-prompt version hash (2.3); ignoreValidation → manual
    // unlock with audit trail (2.4-A2, GDPR leaks never overridable).
    const regenSynthesisResult = await step.run('regen-assemble-and-save', () =>
      assembleSectionsAndSaveReport(caseId, accumulatedSections, synthesisParams, sectionPlan, {
        ignoreValidation: ignoreValidation === true,
        userId,
      }),
    );

    // Verifica claim-level anti-misgrounded (come in process-case): judge
    // Medium ≠ generatore, mai bloccante.
    const firstVerify = await step.run('regen-claim-verify', async () => {
      const { runClaimVerification, toClaimEventDigest, toDocumentSummariesDigest, toOcrEvidenceDigest } = await import('../steps/claim-verify');
      // Evidenza del judge = ciò che il GENERATORE ha legittimamente visto:
      // riassunti map-reduce (casi grandi) o OCR grezzo cappato (casi piccoli).
      // Senza, fatti veri uscivano "non supportato" (audit 2026-07-16).
      let extraEvidence = toDocumentSummariesDigest(documentSummaries);
      if (!extraEvidence) {
        const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
        extraEvidence = toOcrEvidenceDigest(await fetchDocumentsOcrContext(caseId));
      }
      return runClaimVerification({
        caseId,
        reportId: regenSynthesisResult.reportId,
        events: toClaimEventDigest(synthesisParams.events),
        documentSummariesDigest: extraEvidence,
      });
    });

    // REVISIONE AUTOMATICA (founder 2026-07-17): l'ultimo passo non si limita a
    // segnalare — per ogni sezione con errori fattuali fa UNA rigenerazione
    // mirata con l'elenco esatto degli errori, poi il judge RIGIRA da capo: al
    // perito arriva solo ciò che sopravvive. Un solo giro, mai bloccante,
    // doc-sanitaria esclusa, log trasparente nei metadata.
    const { selectRepairableSections } = await import('../steps/auto-repair');
    const repairTargets = selectRepairableSections(firstVerify.findings);
    if (repairTargets.length > 0 && regenSynthesisResult.reportId) {
      for (const target of repairTargets) {
        await step.run(`auto-repair-${target.sectionId}`, async () => {
          try {
            const { buildRepairInstruction } = await import('../steps/auto-repair');
            const { regenerateSection } = await import('@/services/synthesis/section-regenerator');
            const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
            const supabase = createAdminClient();
            const { data: rep } = await supabase
              .from('reports').select('synthesis')
              .eq('id', regenSynthesisResult.reportId).single();
            if (!rep?.synthesis) return { skipped: 'report_not_found' };
            const updated = await regenerateSection({
              sectionId: target.sectionId,
              currentSynthesis: rep.synthesis as string,
              caseType: prep.metadata.caseType,
              caseTypes: prep.metadata.caseTypes.length > 1 ? prep.metadata.caseTypes : undefined,
              caseRole: prep.metadata.caseRole,
              events: synthesisParams.events,
              anomalies: synthesisParams.anomalies,
              missingDocuments: synthesisParams.missingDocuments,
              calculations: synthesisParams.calculations,
              userInstruction: buildRepairInstruction(target),
              periziaMetadata: prep.metadata.periziaMetadata,
              documentsOcrText: await fetchDocumentsOcrContext(caseId),
              moduleId: prep.metadata.moduleId,
              patientInitials: prep.metadata.patientInitials,
              imageAnalysis,
            });
            if (updated === rep.synthesis) return { unchanged: true };
            await supabase.from('reports')
              .update({ synthesis: updated, updated_at: new Date().toISOString() })
              .eq('id', regenSynthesisResult.reportId);
            return { repaired: target.findings.length };
          } catch (err) {
            // Mai bloccante: la sezione resta com'era e il finding resta visibile.
            logger.warn('regenerate-report', `Auto-repair ${target.sectionId} fallita: ${err instanceof Error ? err.message : 'unknown'}`);
            return { failed: true };
          }
        });
      }
      await step.run('regen-claim-verify-after-repair', async () => {
        const { runClaimVerification, toClaimEventDigest, toDocumentSummariesDigest, toOcrEvidenceDigest } = await import('../steps/claim-verify');
        const supabase = createAdminClient();
        // Log trasparente PRIMA della ri-verifica (che fa il merge fresh dei metadata).
        const { data: rep } = await supabase.from('reports').select('generation_metadata')
          .eq('id', regenSynthesisResult.reportId).single();
        const meta = (rep?.generation_metadata ?? {}) as Record<string, unknown>;
        await supabase.from('reports').update({
          generation_metadata: {
            ...meta,
            autoRepair: {
              attemptedAt: new Date().toISOString(),
              sections: repairTargets.map((t) => ({ sectionId: t.sectionId, findings: t.findings.length })),
              findingsBefore: firstVerify.unsupportedCount,
            },
          },
        }).eq('id', regenSynthesisResult.reportId);
        let extraEvidence = toDocumentSummariesDigest(documentSummaries);
        if (!extraEvidence) {
          const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
          extraEvidence = toOcrEvidenceDigest(await fetchDocumentsOcrContext(caseId));
        }
        return runClaimVerification({
          caseId,
          reportId: regenSynthesisResult.reportId,
          events: toClaimEventDigest(synthesisParams.events),
          documentSummariesDigest: extraEvidence,
        });
      });
    }

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
      // Fedeltà citazioni: il warning quote-verification riflette SEMPRE l'ultima
      // generazione — via le voci del report precedente, dentro quelle nuove.
      const freshQuotes = Array.from(completedSections.values()).flatMap((sec) => sec.ungroundedQuotes ?? []);
      const prevWarnings = Array.isArray(cleaned.pipelineWarnings)
        ? cleaned.pipelineWarnings as Array<Record<string, unknown>>
        : [];
      // Idem per la rete anti-omissione della doc-sanitaria: la voce riflette
      // SEMPRE l'ultima generazione (gate gold 2026-09-04: nella perizia RC il
      // banner non entra più nel testo, quindi il pannello è l'unico segnale).
      const isCoverageWarning = (w: Record<string, unknown>): boolean =>
        w?.step === 'synthesis' && typeof w?.message === 'string' && (w.message as string).startsWith('Documentazione sanitaria');
      const keptWarnings = prevWarnings.filter((w) => w?.step !== 'quote-verification' && !isCoverageWarning(w));
      const docSan = completedSections.get('documentazione_sanitaria');
      const isRcTranscription = sectionPlan.some((s) => s.id === 'documentazione_sanitaria' && s.excludeLabTests);
      const coverageWarning = docSan && (docSan.coverageMissing ?? 0) > 0
        ? [{
            step: 'synthesis',
            severity: 'warning',
            message: `Documentazione sanitaria: ${docSan.coverageMissing} ${docSan.coverageMissing === 1 ? 'evento clinicamente rilevante potrebbe non essere citato' : 'eventi clinicamente rilevanti potrebbero non essere citati'} nel testo (su ${docSan.coverageT1 ?? 0} verificati). ${isRcTranscription ? 'Confrontare la trascrizione con i documenti.' : 'Banner di verifica inserito nella sezione.'}`,
            failedCount: docSan.coverageMissing,
            totalCount: docSan.coverageT1 ?? 0,
          }]
        : [];
      const nextWarnings = [
        ...keptWarnings,
        ...coverageWarning,
        ...(freshQuotes.length > 0 ? [{
            step: 'quote-verification',
            severity: 'warning',
            message: `${freshQuotes.length} citazioni della documentazione sanitaria senza riscontro esatto nel testo dei documenti`,
            failedCount: freshQuotes.length,
            failedItems: freshQuotes.slice(0, 24),
          }] : []),
      ];
      const restMeta = Object.fromEntries(Object.entries(cleaned).filter(([k]) => k !== 'pipelineWarnings'));
      // CAS (A-2): scrive 'completato' solo se il run è ANCORA quello attivo. Se
      // il caso è stato annullato mentre il finalize era in volo, non lo resuscita.
      await supabase.from('cases').update({
        processing_stage: 'completato',
        perizia_metadata: nextWarnings.length > 0 ? { ...restMeta, pipelineWarnings: nextWarnings } : restMeta,
        updated_at: new Date().toISOString(),
      }).eq('id', caseId).in('processing_stage', ['generazione_report']);
      // Cleanup best-effort delle parti di sezione transitorie (il report è
      // già salvato in reports; residui comunque cancellati col caso).
      const { deleteCaseSectionParts } = await import('../steps/section-part-store');
      await deleteCaseSectionParts(caseId);
    });

    return { caseId, sections: accumulatedSections.length };
  },
);
