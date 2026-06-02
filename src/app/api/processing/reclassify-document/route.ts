import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { classifyDocument } from '@/services/classification/document-classifier';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBalance, deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const requestSchema = z.object({
  caseId: z.string().uuid(),
  documentId: z.string().uuid(),
});

/**
 * POST /api/processing/reclassify-document
 * Re-run AI classification on a single document during classification review.
 * Returns the new classification result so the UI can update immediately.
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non autenticato' },
        { status: 401 },
      );
    }

    // Rate limiting PER-UTENTE (non per-IP: x-forwarded-for è spoofabile).
    const rateCheck = await checkRateLimit({ key: `reclassify:${user.id}`, ...RATE_LIMITS.API });
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429 },
      );
    }

    // Validate request body
    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dati non validi' },
        { status: 400 },
      );
    }

    const { caseId, documentId } = parsed.data;

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

    // Only allow reclassification during classification review
    if (caseData.processing_stage !== 'revisione_classificazione') {
      return NextResponse.json(
        { success: false, error: 'La riclassificazione è possibile solo durante la revisione' },
        { status: 400 },
      );
    }

    // Verify document belongs to this case and is in the right status
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, file_name, processing_status')
      .eq('id', documentId)
      .eq('case_id', caseId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { success: false, error: 'Documento non trovato' },
        { status: 404 },
      );
    }

    if (doc.processing_status !== 'classificazione_completata') {
      return NextResponse.json(
        { success: false, error: 'Il documento non è pronto per la riclassificazione' },
        { status: 400 },
      );
    }

    // Fetch OCR text from pages (admin client to bypass RLS).
    // Wave C.3: cap at 20 pages with '\n\n' separator so the input matches
    // exactly what classify-batch/classify-document send — guarantees same
    // doc → same classification regardless of entry point.
    const admin = createAdminClient();
    const { data: pagesData } = await admin
      .from('pages')
      .select('page_number, ocr_text')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true })
      .limit(20);

    const ocrText = (pagesData ?? [])
      .map((p) => p.ocr_text ?? '')
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (!ocrText) {
      return NextResponse.json(
        { success: false, error: 'Nessun testo OCR disponibile per questo documento' },
        { status: 400 },
      );
    }

    // Charge 1 credit for the AI re-classification (single Mistral Large call).
    // Deduct AFTER all cheap validations so rejected requests are never billed,
    // and BEFORE the LLM call so the cost is always covered.
    const balance = await getBalance(user.id);
    if (balance.total < CREDIT_COSTS.categorizzazione) {
      return NextResponse.json(
        {
          success: false,
          error: `Crediti insufficienti: serve ${CREDIT_COSTS.categorizzazione} credito per riclassificare.`,
          creditsNeeded: CREDIT_COSTS.categorizzazione,
          creditsAvailable: balance.total,
        },
        { status: 402 },
      );
    }
    const deduction = await deductCredits(
      user.id,
      CREDIT_COSTS.categorizzazione,
      'categorizzazione',
      documentId,
      { reason: 'reclassify' },
    );
    if (!deduction.success) {
      return NextResponse.json({ success: false, error: deduction.error }, { status: 402 });
    }

    // Re-run AI classification — refund the credit on any failure (no work delivered).
    let result;
    try {
      result = await classifyDocument(ocrText, doc.file_name);
    } catch (classifyErr) {
      await refundCredits(user.id, CREDIT_COSTS.categorizzazione, 'categorizzazione', documentId, {
        reason: 'reclassify_failed',
      });
      throw classifyErr;
    }

    // Save new classification metadata to DB
    const classificationMetadata = {
      aiSuggestedType: result.documentType,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };

    const { error: updateError } = await admin
      .from('documents')
      .update({
        classification_metadata: classificationMetadata,
        document_type: result.documentType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);
    if (updateError) {
      await refundCredits(user.id, CREDIT_COSTS.categorizzazione, 'categorizzazione', documentId, {
        reason: 'reclassify_save_failed',
      });
      return NextResponse.json({ success: false, error: 'Errore nel salvataggio della classificazione.' }, { status: 500 });
    }

    logger.info('reclassify', `Document ${documentId} reclassified as ${result.documentType} (${result.confidence}%)`);

    return NextResponse.json({
      success: true,
      data: {
        documentId,
        documentType: result.documentType,
        classificationMetadata,
      },
    });
  } catch (error) {
    logger.error('processing/reclassify-document', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Errore nella riclassificazione. Riprova.' },
      { status: 500 },
    );
  }
}
