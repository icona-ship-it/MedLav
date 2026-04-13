import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { classifyDocument } from '@/services/classification/document-classifier';
import { deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { getSignedUrl } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const requestSchema = z.object({
  documentId: z.string().uuid(),
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/classify-document
 *
 * On-demand AI classification of a single document.
 * Runs OCR (if no existing text) + classification.
 * Costs 1 credit per document.
 */
export async function POST(request: NextRequest) {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `classify:${user.id}`, ...RATE_LIMITS.PROCESSING });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
  }

  const { documentId, caseId } = parsed.data;

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

  // Fetch document
  const { data: doc } = await supabase
    .from('documents')
    .select('id, file_name, file_type, storage_path, processing_status')
    .eq('id', documentId)
    .eq('case_id', caseId)
    .single();

  if (!doc) {
    return NextResponse.json({ success: false, error: 'Documento non trovato' }, { status: 404 });
  }

  // Deduct 1 credit
  const deduction = await deductCredits(
    user.id,
    CREDIT_COSTS.categorizzazione,
    'categorizzazione',
    documentId,
  );

  if (!deduction.success) {
    return NextResponse.json({ success: false, error: deduction.error }, { status: 402 });
  }

  try {
    // Check if we already have OCR text for this document
    const admin = createAdminClient();
    const { data: existingPages } = await admin
      .from('pages')
      .select('ocr_text')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true })
      .limit(3);

    let ocrText: string;

    if (existingPages && existingPages.length > 0) {
      // Use existing OCR text (first 3 pages)
      ocrText = existingPages
        .map((p) => p.ocr_text as string)
        .filter(Boolean)
        .join('\n\n');
    } else {
      // Run OCR on the document
      const signedUrl = await getSignedUrl(doc.storage_path);
      const ocrResult = await ocrDocument({
        documentId,
        fileName: doc.file_name,
        fileType: doc.file_type,
        signedUrl,
      });
      ocrText = ocrResult.fullText;

      // Save OCR pages for future use (avoid re-OCR during pipeline)
      // Note: pages may not have a unique constraint on (document_id, page_number),
      // so we use insert and ignore conflicts via onConflict on id
      for (const page of ocrResult.pages) {
        // Check if page already exists to avoid duplicates
        const { data: existingPage } = await admin
          .from('pages')
          .select('id')
          .eq('document_id', documentId)
          .eq('page_number', page.pageNumber)
          .maybeSingle();

        if (!existingPage) {
          await admin.from('pages').insert({
            document_id: documentId,
            page_number: page.pageNumber,
            ocr_text: page.text,
            ocr_confidence: page.confidence,
          });
        }
      }
    }

    // Classify
    const classification = await classifyDocument(ocrText, doc.file_name);

    // Update document type and classification metadata
    await admin.from('documents').update({
      document_type: classification.documentType,
      classification_metadata: {
        aiSuggestedType: classification.documentType,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
        classifiedAt: new Date().toISOString(),
        classifiedBy: 'on-demand',
      },
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);

    logger.info('classify-document', 'Document classified on-demand', {
      documentId,
      type: classification.documentType,
      confidence: classification.confidence,
    });

    return NextResponse.json({
      success: true,
      data: {
        documentType: classification.documentType,
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    logger.error('classify-document', `Classification failed: ${message}`, { documentId });

    // Refund the credit on failure
    await refundCredits(user.id, CREDIT_COSTS.categorizzazione, 'categorizzazione', documentId, {
      reason: 'classification_failed',
    });

    return NextResponse.json(
      { success: false, error: 'Errore nella categorizzazione. Il credito è stato rimborsato.' },
      { status: 500 },
    );
  }
}
