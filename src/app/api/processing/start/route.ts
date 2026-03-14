import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getPlanLimits } from '@/lib/stripe/config';
import { validateCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/start
 * Trigger document processing for a case.
 * Validates auth, ownership, and document availability before sending Inngest event.
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateCheck = await checkRateLimit({ key: `processing:${ip}`, ...RATE_LIMITS.PROCESSING });
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non autenticato' },
        { status: 401 },
      );
    }

    // Validate request body
    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'ID caso non valido' },
        { status: 400 },
      );
    }

    const { caseId } = parsed.data;

    // Check subscription plan limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status, subscription_plan')
      .eq('id', user.id)
      .single();

    const plan = (profile?.subscription_plan as string) ?? 'trial';
    const status = (profile?.subscription_status as string) ?? 'trial';

    if (status === 'canceled' || status === 'past_due') {
      return NextResponse.json(
        { success: false, error: 'Abbonamento non attivo. Aggiorna il tuo piano per continuare.' },
        { status: 403 },
      );
    }

    const { casesLimit } = getPlanLimits(plan);
    if (casesLimit !== Infinity) {
      const { count: totalCases } = await supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (totalCases && totalCases >= casesLimit) {
        return NextResponse.json(
          { success: false, error: `Hai raggiunto il limite di ${casesLimit} casi del piano ${plan}. Passa al piano Pro per casi illimitati.` },
          { status: 403 },
        );
      }
    }

    // Verify case ownership
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, user_id, processing_stage')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (caseError || !caseData) {
      return NextResponse.json(
        { success: false, error: 'Caso non trovato' },
        { status: 404 },
      );
    }

    // Re-processing cleanup: if the case was already processed, clean ALL derived data
    // including OCR pages — every analysis runs fresh for maximum quality
    // This runs BEFORE the running check so that stuck documents from failed runs get cleaned up
    const isReprocessing = caseData.processing_stage !== 'idle';
    if (isReprocessing) {
      logger.info('processing/start', `Re-processing case ${caseId}: cleaning all data for fresh analysis`);
      await Promise.all([
        supabase.from('events').delete().eq('case_id', caseId),
        supabase.from('anomalies').delete().eq('case_id', caseId),
        supabase.from('missing_documents').delete().eq('case_id', caseId),
        supabase.from('reports').delete().eq('case_id', caseId),
        supabase.from('event_images').delete().eq('case_id', caseId),
      ]);
      // Delete OCR pages per document (fresh OCR on every run)
      const { data: docs } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', caseId);
      if (docs && docs.length > 0) {
        await Promise.all(
          docs.map((d) => supabase.from('pages').delete().eq('document_id', d.id)),
        );
      }
    }

    // Check that there are documents to process
    const { count: docCount, error: countError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId);

    if (countError || !docCount || docCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Nessun documento da elaborare. Carica almeno un documento.' },
        { status: 400 },
      );
    }

    // Reset document status for processing
    await supabase
      .from('documents')
      .update({
        processing_status: 'in_coda',
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('case_id', caseId);

    await supabase
      .from('cases')
      .update({
        processing_stage: 'elaborazione',
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);

    // Send Inngest event to trigger processing
    await inngest.send({
      name: 'case/process.requested',
      data: {
        caseId,
        userId: user.id,
      },
    });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: isReprocessing ? 'case.reprocessing.started' : 'case.processing.started',
      entity_type: 'case',
      entity_id: caseId,
      metadata: { documentsToProcess: docCount, isReprocessing },
    });

    return NextResponse.json({
      success: true,
      data: { caseId, documentsQueued: docCount },
    });
  } catch (error) {
    logger.error('processing/start', 'Unexpected error', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
