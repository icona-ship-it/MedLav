import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkFeatureAccess } from '@/lib/subscription';
import { inngest } from '@/lib/inngest/client';
import { getBalance, deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { PIPELINE_LIMITS } from '@/lib/pipeline-limits';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const gate = await checkFeatureAccess(user.id, 'document_organizer');
  if (!gate.allowed) {
    return NextResponse.json({ success: false, error: gate.reason ?? 'Funzionalità Pro richiesta.' }, { status: 403 });
  }

  const rateCheck = await checkRateLimit({ key: `doc-organizer:${user.id}`, ...RATE_LIMITS.PROCESSING });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
  }

  const { caseId } = parsed.data;

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, processing_stage')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
  }

  // Cost is PER OCR PAGE, not per document: the organizer makes ~1 Mistral Large
  // call per page (classifyPage), so a single many-page PDF would otherwise cost
  // 1 credit for thousands of LLM calls (denial-of-wallet). Charge by real page
  // count and hard-cap the run.
  const { data: docRows } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId);
  const docIds = (docRows ?? []).map((d) => d.id as string);
  if (docIds.length === 0) {
    return NextResponse.json({ success: false, error: 'Nessun documento da organizzare.' }, { status: 400 });
  }

  const { count: pageCount } = await supabase
    .from('pages')
    .select('*', { count: 'exact', head: true })
    .in('document_id', docIds);
  const totalPages = pageCount ?? 0;
  if (totalPages === 0) {
    return NextResponse.json(
      { success: false, error: 'Nessuna pagina da analizzare. Elabora prima i documenti.' },
      { status: 400 },
    );
  }
  if (totalPages > PIPELINE_LIMITS.MAX_PAGES_PER_RUN) {
    return NextResponse.json(
      { success: false, error: `Troppe pagine (${totalPages}, limite ${PIPELINE_LIMITS.MAX_PAGES_PER_RUN}). Suddividi il caso.` },
      { status: 400 },
    );
  }

  const organizeCost = totalPages * CREDIT_COSTS.organizzazione_documenti;
  const balance = await getBalance(user.id);
  if (balance.total < organizeCost) {
    return NextResponse.json(
      {
        success: false,
        error: `Crediti insufficienti: servono ${organizeCost} crediti per organizzare ${totalPages} pagine, hai ${balance.total}.`,
        creditsNeeded: organizeCost,
        creditsAvailable: balance.total,
      },
      { status: 402 },
    );
  }
  const deduction = await deductCredits(user.id, organizeCost, 'organizzazione_documenti', caseId, { pageCount: totalPages });
  if (!deduction.success) {
    return NextResponse.json({ success: false, error: deduction.error }, { status: 402 });
  }

  try {
    await inngest.send({
      name: 'case/documents.organize',
      // Pass creditCost so the onFailure refunds the EXACT amount of THIS run
      // (charges are variable per-page; refunding the "newest consumption" would
      // be wrong when a case has multiple organize runs of different sizes).
      data: { caseId, userId: user.id, creditCost: organizeCost },
    });

    logger.info('document-organizer', `Started organization for case ${caseId} (${totalPages} pages, ${organizeCost} credits)`);
    return NextResponse.json({ success: true });
  } catch (error) {
    // No job will run → refund.
    await refundCredits(user.id, organizeCost, 'organizzazione_documenti', caseId, { reason: 'organize_dispatch_failed' });
    logger.error('document-organizer', `Failed to start: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json({ success: false, error: 'Errore avvio organizzazione.' }, { status: 500 });
  }
}
