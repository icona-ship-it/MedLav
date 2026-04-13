import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
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

  // Credit check
  const totalCredits = documentIds.length * CREDIT_COSTS.categorizzazione;
  const balance = await getBalance(user.id);

  if (balance.total < totalCredits) {
    return NextResponse.json({
      success: false,
      error: `Crediti insufficienti: servono ${totalCredits}, hai ${balance.total}`,
    }, { status: 402 });
  }

  // Deduct credits upfront
  const deduction = await deductCredits(user.id, totalCredits, 'categorizzazione', caseId, {
    documentCount: documentIds.length,
    batchMode: true,
  });

  if (!deduction.success) {
    return NextResponse.json({ success: false, error: deduction.error }, { status: 402 });
  }

  // Send Inngest event
  await inngest.send({
    name: 'case/documents.classify-batch',
    data: {
      caseId,
      userId: user.id,
      documentIds,
      totalCredits,
    },
  });

  return NextResponse.json({
    success: true,
    data: { documentsQueued: documentIds.length, creditsCharged: totalCredits },
  });
}
