import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { parseSynthesisSections } from '@/services/synthesis/section-parser';
import { validateCsrfToken } from '@/lib/csrf';
import { processingPausedResponse } from '@/lib/processing-guard';
import { deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { getSectionStatus } from '@/lib/section-state';
import type { ReportGenerationMetadata } from '@/db/schema/reports';
import type { SectionRegenTarget } from '@/inngest/functions/regenerate-section';
import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';

const requestSchema = z.object({
  caseId: z.string().uuid(),
  /** Singola sezione (bottone, "Correggi con AI"). */
  sectionId: z.string().min(1).max(50).optional(),
  /** Più sezioni in un colpo (pannello "scegli cosa rigenerare"). */
  sectionIds: z.array(z.string().min(1).max(50)).min(1).max(12).optional(),
  instruction: z.string().max(500).optional(),
  /** Overwrite an edited/locked section after explicit user confirmation. */
  force: z.boolean().optional(),
  /** documentazione_sanitaria: variante AI "integrale" on demand. */
  elaborated: z.boolean().optional(),
  /** documentazione_sanitaria: variante AI "selettiva" (citazioni verificate). */
  selective: z.boolean().optional(),
  /** Optimistic concurrency: the report version the client is acting on. */
  expectedVersion: z.number().int().optional(),
}).refine((v) => Boolean(v.sectionId) !== Boolean(v.sectionIds), {
  message: 'Indicare sectionId oppure sectionIds',
});

const ALLOWED_STAGES = ['idle', 'completato', 'errore'];

/**
 * POST /api/processing/regenerate-section
 * Check veloci (auth, sezione protetta, versione, crediti) → dispatch del job
 * Inngest `regenerate-section` → 202-style { success, async: true }.
 * La UI vede processing_stage='generazione_report' + generationProgress e usa
 * la stessa barra/polling della rigenerazione completa. (Prima del 2026-07-20
 * questa route faceva il lavoro in modo SINCRONO: minuti di HTTP request,
 * nessun retry, nessun lock per-caso.)
 */
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    // Kill-switch operativo condiviso.
    const pausedResponse = processingPausedResponse();
    if (pausedResponse) return pausedResponse;

    // Rate limit BEFORE credit deduction — don't charge for rate-limited requests.
    const rateCheck = await checkRateLimit({
      key: `regen-section:${user.id}`,
      ...RATE_LIMITS.API,
    });
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Troppi tentativi. Riprova tra qualche minuto.' },
        { status: 429 },
      );
    }

    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Parametri non validi' }, { status: 400 });
    }

    const { caseId, instruction, force, expectedVersion, elaborated, selective } = parsed.data;
    const targetIds: SectionRegenTarget[] = parsed.data.sectionIds
      ? parsed.data.sectionIds.map((sectionId) => ({ sectionId }))
      : [{ sectionId: parsed.data.sectionId as string, instruction, elaborated, selective }];

    // Verify ownership + get case metadata
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, case_role, processing_stage')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseRow) {
      return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
    }

    // rc-mvp: solo perizia RC stragiudiziale — le sezioni dei report legacy
    // CTU/CTP non si rigenerano qui (fail-fast PRIMA di scalare crediti).
    if (((caseRow.case_role as string | null) ?? 'stragiudiziale') !== 'stragiudiziale') {
      return NextResponse.json(
        { success: false, error: 'Questo caso è di tipo CTU/CTP (legacy): la rigenerazione di sezione non è disponibile nell\'MVP RC.' },
        { status: 400 },
      );
    }

    const currentStage = (caseRow.processing_stage as string | null) ?? 'idle';
    if (!ALLOWED_STAGES.includes(currentStage)) {
      return NextResponse.json(
        { success: false, error: 'C\'è già un\'elaborazione in corso su questo caso. Attendi che finisca e riprova.' },
        { status: 409 },
      );
    }

    // Get current report (incl. per-section state)
    const { data: currentReport } = await admin
      .from('reports')
      .select('id, version, synthesis, generation_metadata')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentReport?.synthesis) {
      return NextResponse.json({ success: false, error: 'Nessun report esistente' }, { status: 400 });
    }

    // Titoli umani per barra di progresso e messaggi (fallback: id canonico).
    const parsedSections = parseSynthesisSections(currentReport.synthesis as string);
    const targets: SectionRegenTarget[] = targetIds.map((t) => ({
      ...t,
      title: parsedSections.find((s) => s.id === t.sectionId)?.title ?? t.sectionId,
    }));

    // Protect the perito's work: never silently overwrite an edited/locked
    // section. Return blocked → the client asks for explicit confirmation.
    // This runs BEFORE deductCredits so a blocked regen is never charged.
    const currentMetadata = (currentReport.generation_metadata ?? null) as ReportGenerationMetadata | null;
    if (!force) {
      for (const target of targets) {
        const sectionStatus = getSectionStatus(currentMetadata, target.sectionId);
        if (sectionStatus === 'edited' || sectionStatus === 'locked') {
          return NextResponse.json({ success: false, blocked: true, reason: sectionStatus, sectionTitle: target.title });
        }
      }
    }

    // Optimistic concurrency: reject if a newer version exists than the client saw.
    if (typeof expectedVersion === 'number' && (currentReport.version as number) !== expectedVersion) {
      return NextResponse.json(
        { success: false, error: 'Il report è stato modificato da un\'altra operazione. Ricarica la pagina e riprova.' },
        { status: 409 },
      );
    }

    // CAS sullo stage (stesso pattern del full-regenerate): blocca avvii
    // concorrenti e accende la barra di progresso della UI.
    const { data: metaRow } = await admin.from('cases').select('perizia_metadata').eq('id', caseId).single();
    const existingMeta = (metaRow?.perizia_metadata ?? {}) as Record<string, unknown>;
    const { data: staged } = await admin.from('cases').update({
      processing_stage: 'generazione_report',
      perizia_metadata: {
        ...existingMeta,
        generationProgress: { currentSection: 0, totalSections: targets.length, currentSectionTitle: 'Avvio rigenerazione…' },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', caseId).in('processing_stage', ALLOWED_STAGES).select('id');

    if (!staged || staged.length === 0) {
      return NextResponse.json(
        { success: false, error: 'C\'è già un\'elaborazione in corso su questo caso. Attendi che finisca e riprova.' },
        { status: 409 },
      );
    }

    const revertStage = async () => {
      await admin.from('cases').update({
        processing_stage: currentStage,
        updated_at: new Date().toISOString(),
      }).eq('id', caseId);
    };

    // Credit check — dopo blocked/version/stage così un tentativo respinto non
    // viene mai addebitato. batchId correla addebito ↔ consegna ↔ rimborsi.
    const batchId = crypto.randomUUID();
    const totalCost = CREDIT_COSTS.rigenerazione_sezione * targets.length;
    const deduction = await deductCredits(user.id, totalCost, 'rigenerazione_sezione', caseId, {
      reason: 'section_regen',
      batchId,
      sections: targets.length,
    });
    if (!deduction.success) {
      await revertStage();
      return NextResponse.json({ success: false, error: deduction.error }, { status: 402 });
    }

    try {
      await inngest.send({
        name: 'case/section.regenerate',
        data: { caseId, userId: user.id, batchId, sections: targets },
      });
    } catch (sendError) {
      await revertStage();
      await refundCredits(user.id, totalCost, 'rigenerazione_sezione', caseId, {
        reason: 'inngest_send_failed',
        batchId,
      });
      logger.error('processing/regenerate-section', `inngest.send failed for case ${caseId} — stage reverted`, {
        error: sendError instanceof Error ? sendError.message : 'unknown',
      });
      return NextResponse.json(
        { success: false, error: 'Impossibile avviare la rigenerazione. Riprova tra qualche istante. Nessun credito è stato addebitato.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      async: true,
      data: { batchId, sections: targets.length },
    });
  } catch (error) {
    logger.error('processing/regenerate-section', 'Section regeneration dispatch failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ success: false, error: 'Errore avvio rigenerazione sezione.' }, { status: 500 });
  }
}
