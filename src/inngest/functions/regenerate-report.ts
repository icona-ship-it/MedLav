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
 * — never 'errore'. The regenerate is free (no credit deduction), so no refund.
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
  } catch (err) {
    logger.error('regenerate-report', `onFailure handler error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
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
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

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
      // list for documentazione_sanitaria batching.
      const { data: docs } = await supabase
        .from('documents')
        .select('id, document_type')
        .eq('case_id', caseId);
      const docList = (docs ?? []).map((d) => ({ id: d.id as string, documentType: (d.document_type ?? 'altro') as string }));
      const documentTypes = [...new Set(docList.map((d) => d.documentType))];

      return { metadata, documentTypes, docIds: docList.map((d) => d.id) };
    });

    const allEvents: ConsolidatedEvent[] = await step.run('regen-fetch-events', () => fetchAllEventsForCase(caseId));
    if (allEvents.length === 0) {
      throw new Error('Nessun evento disponibile per la rigenerazione del report');
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
      // imageAnalysis/documentSummaries/pubmed: not re-run on regenerate (mirrors
      // the previous behaviour) — facts now come from deterministic sentinels.
      return buildSynthesisParams(prep.metadata, allEvents, anomalies, missingDocs, calculations, []);
    });

    const sectionPlan = await step.run('regen-plan-sections', () =>
      planReportSections(prep.metadata, allEvents, prep.documentTypes),
    );
    if (sectionPlan.length === 0) {
      throw new Error('Section plan vuoto — impossibile rigenerare un report vuoto');
    }

    // Progress writer (drives the existing UI progress bar).
    const updateProgress = async (i: number, title: string) => {
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
    };

    // Surface the REAL section count to the UI immediately (currentSection 0 / N)
    // so the progress bar doesn't show a fake 0/1 then jump when work begins.
    await step.run('regen-init-progress', () => updateProgress(-1, 'Inizializzazione…'));

    // ── Sectional generation (mirrors process-case: per-section step + doc-sanitaria batching) ──
    const accumulatedSections: GeneratedSection[] = [];
    let sectionGenerationFailed = false;
    for (let i = 0; i < sectionPlan.length; i++) {
      const spec = sectionPlan[i];
      const previousContext = accumulatedSections.map((s) => ({ id: s.id, title: s.title, contextSummary: s.contextSummary }));

      try {
        if (spec.id === 'documentazione_sanitaria' && spec.needsOcr && prep.docIds.length > DOC_BATCH_SIZE) {
          const batchContents: string[] = [];
          const totalBatches = Math.ceil(prep.docIds.length / DOC_BATCH_SIZE);
          let promptTokens = 0;
          let completionTokens = 0;

          for (let b = 0; b < totalBatches; b++) {
            const batchDocIds = prep.docIds.slice(b * DOC_BATCH_SIZE, (b + 1) * DOC_BATCH_SIZE);
            const batchResult = await step.run(`regen-section-documentazione_sanitaria-batch-${b}`, async () => {
              await updateProgress(i, `${spec.title} (${b + 1}/${totalBatches})`);
              const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
              const allOcr = await fetchDocumentsOcrContext(caseId);
              const batchOcr = allOcr.filter((d) => batchDocIds.includes(d.documentId));
              const { generateSingleSection } = await import('@/services/synthesis/section-generator');
              return generateSingleSection({ spec, synthesisParams, previousContext, documentsOcrText: batchOcr });
            });
            if (batchResult.content) batchContents.push(batchResult.content);
            else logger.warn('regenerate-report', `Batch ${b + 1}/${totalBatches} documentazione_sanitaria: contenuto vuoto`, { caseId });
            if (batchResult.usage) {
              promptTokens += batchResult.usage.promptTokens;
              completionTokens += batchResult.usage.completionTokens;
            }
          }

          const combinedContent = batchContents.join('\n\n');
          const { summarizeForContext } = await import('@/services/synthesis/section-generator');
          accumulatedSections.push({
            id: spec.id,
            title: spec.title,
            content: combinedContent,
            contextSummary: spec.contextMaxChars > 0 ? summarizeForContext(combinedContent, spec.contextMaxChars) : '',
            wordCount: combinedContent.split(/\s+/).filter((w) => w.length > 0).length,
            usage: promptTokens > 0 ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } : undefined,
          });
        } else {
          const section = await step.run(`regen-section-${spec.id}`, async () => {
            await updateProgress(i, spec.title);
            return generateSectionStep(caseId, spec, synthesisParams, previousContext);
          });
          accumulatedSections.push(section);
        }
      } catch (sectionError) {
        logger.error('regenerate-report', `Section "${spec.id}" failed after retries (${accumulatedSections.length}/${sectionPlan.length} done)`, {
          error: sectionError instanceof Error ? sectionError.message : 'unknown',
        });
        sectionGenerationFailed = true;
        break;
      }
    }

    // Save the report (partial or complete) — new version, deterministic facts.
    await step.run('regen-assemble-and-save', () =>
      assembleSectionsAndSaveReport(caseId, accumulatedSections, synthesisParams),
    );

    // If a section failed: partial report is saved, but throw so Inngest retries
    // the failed section. After retries are exhausted, onFailure restores
    // 'completato' (the previous/partial report stays valid — never 'errore').
    if (sectionGenerationFailed) {
      Sentry.captureMessage(`regenerate-report: partial (${accumulatedSections.length}/${sectionPlan.length}) for case ${caseId}`);
      throw new Error(`Rigenerazione parziale (${accumulatedSections.length}/${sectionPlan.length} sezioni).`);
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
