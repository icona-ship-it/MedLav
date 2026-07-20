import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { fetchAllEventsForCase } from '../steps/consolidate-events';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import type { ReportGenerationMetadata } from '@/db/schema/reports';

/**
 * Rigenerazione di sezione ASINCRONA (2026-07-20, Fase 1 piano fix): la route
 * /api/processing/regenerate-section fa i check veloci (auth, blocked, versione,
 * crediti), imposta processing_stage='generazione_report' e spedisce qui.
 * Girare su Inngest dà: nessuna dipendenza da una HTTP request di minuti,
 * retry con lock per-caso, stesso pool Mistral della pipeline, rimborso
 * idempotente in onFailure. Più sezioni (pannello "scegli cosa rigenerare")
 * viaggiano in UN evento e vengono processate in fila: ognuna costruisce sulla
 * versione precedente, come faceva il loop sequenziale client-side.
 */

export interface SectionRegenTarget {
  sectionId: string;
  /** Titolo umano per la barra di progresso (fallback: sectionId). */
  title?: string;
  instruction?: string;
  elaborated?: boolean;
  selective?: boolean;
}

interface SectionRegenEventData {
  caseId: string;
  userId: string;
  /** Correlazione addebito↔consegna: le righe audit portano questo id. */
  batchId: string;
  sections: SectionRegenTarget[];
}

const COST_PER_SECTION = CREDIT_COSTS.rigenerazione_sezione;

async function restoreStageWithNote(caseId: string, note: string | null): Promise<void> {
  const supabase = createAdminClient();
  const { data: caseRow } = await supabase
    .from('cases').select('perizia_metadata').eq('id', caseId).single();
  const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
  const cleaned = Object.fromEntries(
    Object.entries(existingMeta).filter(([k]) => k !== 'generationProgress' && k !== 'lastRegenerateError'),
  );
  await supabase.from('cases').update({
    processing_stage: 'completato',
    perizia_metadata: note ? { ...cleaned, lastRegenerateError: note } : cleaned,
    updated_at: new Date().toISOString(),
  }).eq('id', caseId);
}

/**
 * Rimborso idempotente in onFailure: (addebitato − consegnato) sull'ULTIMA
 * consumption non ancora rimborsata. Le sezioni consegnate si contano dalle
 * righe audit col batchId dell'evento (append-only → sicuro sui retry).
 */
async function refundUndeliveredOnFailure(data: SectionRegenEventData, errMsg: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: consumptions } = await supabase
    .from('credit_transactions')
    .select('created_at')
    .eq('user_id', data.userId)
    .eq('entity_id', data.caseId)
    .eq('type', 'consumption')
    .eq('operation', 'rigenerazione_sezione')
    .order('created_at', { ascending: false })
    .limit(1);
  const lastConsumptionAt = consumptions?.[0]?.created_at as string | undefined;
  if (!lastConsumptionAt) return;

  const { data: refundsAfter } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('user_id', data.userId)
    .eq('entity_id', data.caseId)
    .eq('type', 'refund')
    .eq('operation', 'rigenerazione_sezione')
    .gte('created_at', lastConsumptionAt);
  if ((refundsAfter?.length ?? 0) > 0) return; // già gestito (retry di onFailure)

  const { data: deliveredRows } = await supabase
    .from('audit_log')
    .select('id')
    .eq('action', 'report.section_regenerated')
    .eq('entity_id', data.caseId)
    .eq('metadata->>batchId', data.batchId);
  const delivered = deliveredRows?.length ?? 0;
  const owed = (data.sections.length - delivered) * COST_PER_SECTION;
  if (owed <= 0) return;

  const { refundCredits } = await import('@/services/credits/credit-service');
  await refundCredits(data.userId, owed, 'rigenerazione_sezione', data.caseId, {
    reason: 'section_regen_failed',
    batchId: data.batchId,
    error: errMsg.slice(0, 200),
  });
  logger.info('regenerate-section', `Refunded ${owed} credits (${data.sections.length - delivered} sezioni non consegnate) for case ${data.caseId}`);
}

async function handleFailure(event: { data: unknown }): Promise<void> {
  try {
    const failureData = event.data as { event: { data: SectionRegenEventData }; error?: { message?: string } };
    const data = failureData.event.data;
    const errMsg = failureData.error?.message ?? 'Errore sconosciuto durante la rigenerazione della sezione';
    await restoreStageWithNote(
      data.caseId,
      'Rigenerazione della sezione non riuscita: il report precedente è invariato e i crediti non utilizzati sono stati rimborsati.',
    );
    logger.error('regenerate-section', `Section regeneration failed for case ${data.caseId}: ${errMsg} — report precedente preservato`);
    await refundUndeliveredOnFailure(data, errMsg);
  } catch (err) {
    logger.error('regenerate-section', `onFailure handler error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

export const regenerateSectionJob = inngest.createFunction(
  {
    id: 'regenerate-section',
    retries: 2,
    // Stesso pool globale Mistral della pipeline + lock per-caso (niente race
    // sulle versioni del report, niente doppio costo sui retry).
    concurrency: [
      { scope: 'account', key: '"mistral-pool"', limit: 12 },
      { limit: 1, key: 'event.data.caseId' },
    ],
    throttle: { limit: 8, period: '1m', burst: 4 },
    cancelOn: [{ event: 'case/pipeline.cancelled', match: 'data.caseId' }],
    onFailure: async ({ event }) => handleFailure(event),
  },
  { event: 'case/section.regenerate' },
  async ({ event, step }) => {
    const data = event.data as SectionRegenEventData;
    const { caseId, userId, batchId, sections } = data;

    const prep = await step.run('section-regen-prepare', async () => {
      const supabase = createAdminClient();
      const { data: caseRow, error } = await supabase
        .from('cases')
        .select('case_type, case_types, case_role, patient_initials, perizia_metadata, module_id, user_id')
        .eq('id', caseId)
        .single();
      if (error || !caseRow) throw new Error(`Case not found: ${caseId}`);
      if (caseRow.user_id !== userId) throw new Error('Unauthorized section regenerate');
      const rawCaseTypes = caseRow.case_types as string[] | null;
      return {
        caseType: caseRow.case_type as CaseType,
        caseTypes: (rawCaseTypes && rawCaseTypes.length > 0 ? rawCaseTypes : [caseRow.case_type]) as CaseType[],
        caseRole: caseRow.case_role as CaseRole,
        patientInitials: caseRow.patient_initials as string | null,
        periziaMetadata: (caseRow.perizia_metadata ?? undefined) as PeriziaMetadata | undefined,
        moduleId: (caseRow.module_id ?? undefined) as string | undefined,
      };
    });

    // P1 SCALA: eventi letti nel BODY (mai come step-output — su un macrodanno
    // supererebbero il tetto Inngest). Stesso pattern di regenerate-report.
    const events: ConsolidatedEvent[] = await fetchAllEventsForCase(caseId);
    if (events.length === 0) {
      throw new Error('Nessun evento disponibile per la rigenerazione della sezione');
    }
    const anomalies = detectAnomalies(events, {
      caseType: prep.caseType,
      caseTypes: prep.caseTypes.length > 1 ? prep.caseTypes : undefined,
    });
    const missingDocs = detectMissingDocuments({
      events,
      caseType: prep.caseType,
      caseTypes: prep.caseTypes.length > 1 ? prep.caseTypes : undefined,
    });
    const calculations = calculateMedicoLegalPeriods(
      events.map((e) => ({ event_date: e.eventDate, event_type: e.eventType, title: e.title, description: e.description })),
      undefined,
      prep.periziaMetadata?.dataSinistro,
    );

    const updateProgress = async (index: number, title: string) => {
      try {
        const supabase = createAdminClient();
        const { data: caseRow } = await supabase.from('cases').select('perizia_metadata').eq('id', caseId).single();
        const existingMeta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
        await supabase.from('cases').update({
          perizia_metadata: {
            ...existingMeta,
            generationProgress: { currentSection: index + 1, totalSections: sections.length, currentSectionTitle: title },
          },
          updated_at: new Date().toISOString(),
        }).eq('id', caseId);
      } catch (progressError) {
        logger.warn('regenerate-section', `Progress update failed (non-blocking): ${progressError instanceof Error ? progressError.message : 'unknown'}`);
      }
    };

    // Sequenziale: ogni sezione costruisce sulla versione appena salvata.
    const outcomes: Array<{ sectionId: string; outcome: 'regenerated' | 'unchanged'; version?: number }> = [];
    for (let i = 0; i < sections.length; i++) {
      const target = sections[i];
      const result = await step.run(`section-regen-${target.sectionId}`, async () => {
        await updateProgress(i, target.title ?? target.sectionId);
        const admin = createAdminClient();

        const { data: currentReport } = await admin
          .from('reports')
          .select('id, version, synthesis, generation_metadata')
          .eq('case_id', caseId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!currentReport?.synthesis) {
          throw new Error('Nessun report esistente per la rigenerazione della sezione');
        }
        const currentMetadata = (currentReport.generation_metadata ?? null) as ReportGenerationMetadata | null;

        // Fallback Pixtral SOLO per i report pre-fix (chiave imageAnalysis
        // ASSENTE) e solo per la doc-sanitaria in variante AI — parità con la
        // vecchia route sincrona.
        let imageAnalysis: ReportGenerationMetadata['imageAnalysis'] | undefined = currentMetadata?.imageAnalysis ?? undefined;
        const sectionUsesImages = target.sectionId === 'documentazione_sanitaria' && (target.elaborated || target.selective);
        const hasImageAnalysisKey = currentMetadata != null && 'imageAnalysis' in currentMetadata;
        if (!hasImageAnalysisKey && sectionUsesImages) {
          const { analyzeDiagnosticImagesStep } = await import('../steps/link-images');
          const { imageAnalysisForMetadata } = await import('../steps/generate-report');
          imageAnalysis = imageAnalysisForMetadata(await analyzeDiagnosticImagesStep(caseId, prep.caseType));
        }

        const { fetchDocumentsOcrContext } = await import('../steps/generate-report');
        const documentsOcrText = await fetchDocumentsOcrContext(caseId);

        const { regenerateSection } = await import('@/services/synthesis/section-regenerator');
        const updatedSynthesis = await regenerateSection({
          sectionId: target.sectionId,
          currentSynthesis: currentReport.synthesis as string,
          caseType: prep.caseType,
          caseTypes: prep.caseTypes.length > 1 ? prep.caseTypes : undefined,
          caseRole: prep.caseRole,
          events,
          anomalies,
          missingDocuments: missingDocs,
          calculations,
          userInstruction: target.instruction,
          periziaMetadata: prep.periziaMetadata,
          documentsOcrText,
          moduleId: prep.moduleId,
          patientInitials: prep.patientInitials,
          imageAnalysis,
          elaborated: target.elaborated,
          selective: target.selective,
        });

        // No-op (es. doc-sanitaria in variante AI rigenerata in modo generico):
        // nessuna nuova versione — il credito viene rimborsato in finalize.
        if (updatedSynthesis === (currentReport.synthesis as string)) {
          return { sectionId: target.sectionId, outcome: 'unchanged' as const };
        }

        const { persistRegeneratedSection } = await import('@/services/synthesis/section-regen-persist');
        const persisted = await persistRegeneratedSection({
          admin,
          caseId,
          userId,
          sectionId: target.sectionId,
          instruction: target.instruction,
          currentVersion: currentReport.version as number | null,
          currentMetadata,
          updatedSynthesis,
          imageAnalysis,
          auditExtra: { batchId, async: true },
        });
        return { sectionId: target.sectionId, outcome: 'regenerated' as const, version: persisted.version };
      });
      outcomes.push(result);
    }

    await step.run('section-regen-finalize', async () => {
      const unchanged = outcomes.filter((o) => o.outcome === 'unchanged');
      if (unchanged.length > 0) {
        const { refundCredits } = await import('@/services/credits/credit-service');
        await refundCredits(userId, unchanged.length * COST_PER_SECTION, 'rigenerazione_sezione', caseId, {
          reason: 'regeneration_noop',
          batchId,
        });
      }
      const note = unchanged.length === 0
        ? null
        : unchanged.length === sections.length
          ? 'Nessuna modifica applicata: la sezione era già aggiornata. Se è la documentazione sanitaria in variante AI, aprila e usa le opzioni "Variante AI" per rigenerarla. Nessun credito è stato addebitato.'
          : `${unchanged.length} ${unchanged.length === 1 ? 'sezione era già aggiornata' : 'sezioni erano già aggiornate'}: i relativi crediti sono stati rimborsati.`;
      await restoreStageWithNote(caseId, note);
    });

    return { caseId, batchId, outcomes };
  },
);
