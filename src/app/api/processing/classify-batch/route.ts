import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { processingPausedResponse } from '@/lib/processing-guard';
import { getBalance, deductCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { z } from 'zod';

const requestSchema = z.object({
  caseId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * POST /api/processing/classify-batch
 * Trigger Inngest batch classification for multiple documents.
 * Deducts credits upfront, Inngest function refunds on failure.
 */
export async function POST(request: NextRequest) {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  // Kill-switch operativo condiviso.
  const pausedResponse = processingPausedResponse();
  if (pausedResponse) return pausedResponse;

  const rateCheck = await checkRateLimit({ key: `classify-batch:${user.id}`, ...RATE_LIMITS.PROCESSING });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
  }

  const { caseId, documentIds } = parsed.data;

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
  }

  // Dedup + verifica che TUTTI i documentIds appartengano DAVVERO a questo caso:
  // senza questo controllo si addebiterebbero crediti su id duplicati (stesso doc
  // contato piu' volte) o su documenti di un altro caso passati dal client.
  const uniqueDocIds = [...new Set(documentIds)];
  // I secondari di un gruppo unito (merge multi-file 2026-08-19) non si
  // classificano né si addebitano: il loro contenuto confluisce nel primario.
  const { data: ownedDocs } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId)
    .is('merged_into_document_id', null)
    .in('id', uniqueDocIds);
  const validDocIds = (ownedDocs ?? []).map((d) => d.id as string);
  if (validDocIds.length === 0) {
    return NextResponse.json({ success: false, error: 'Nessun documento valido da categorizzare per questo caso.' }, { status: 400 });
  }

  // Credit check (solo sui documenti realmente appartenenti al caso)
  const totalCredits = validDocIds.length * CREDIT_COSTS.categorizzazione;
  const balance = await getBalance(user.id);

  if (balance.total < totalCredits) {
    return NextResponse.json({
      success: false,
      error: `Crediti insufficienti: servono ${totalCredits}, hai ${balance.total}`,
    }, { status: 402 });
  }

  // Deduct credits upfront
  const deduction = await deductCredits(user.id, totalCredits, 'categorizzazione', caseId, {
    documentCount: validDocIds.length,
    batchMode: true,
  });

  if (!deduction.success) {
    return NextResponse.json({ success: false, error: deduction.error }, { status: 402 });
  }

  // Send Inngest event — refund credits if event delivery fails
  try {
    await inngest.send({
      name: 'case/documents.classify-batch',
      data: {
        caseId,
        userId: user.id,
        documentIds: validDocIds,
        totalCredits,
      },
    });
  } catch {
    // Inngest unreachable — refund credits
    const { refundCredits } = await import('@/services/credits/credit-service');
    await refundCredits(user.id, totalCredits, 'categorizzazione', caseId, { reason: 'inngest_send_failed' });
    return NextResponse.json({ success: false, error: 'Servizio non disponibile. Crediti rimborsati. Riprova.' }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    data: { documentsQueued: validDocIds.length, creditsCharged: totalCredits },
  });
}
