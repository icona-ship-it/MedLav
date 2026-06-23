import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getBalance, deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { PIPELINE_LIMITS } from '@/lib/pipeline-limits';
import { getSignedUrl } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { classifyPage, detectBoundaries } from '@/services/document-organizer/page-classifier';
import { splitPdf } from '@/services/document-organizer/pdf-splitter';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const maxDuration = 120;

const requestSchema = z.object({
  documentId: z.string().uuid(),
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/split-document
 *
 * Split a mixed PDF into separate documents by type.
 * Costs 3 credits per resulting document.
 * Refunds if split fails or document can't be split.
 */
export async function POST(request: NextRequest) {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `split:${user.id}`, ...RATE_LIMITS.PROCESSING });
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

  if (doc.file_type !== 'application/pdf') {
    return NextResponse.json({ success: false, error: 'Solo i PDF possono essere divisi' }, { status: 400 });
  }

  // Pre-check: need at least 3 credits (minimum 1 resulting document)
  const balance = await getBalance(user.id);
  if (balance.total < CREDIT_COSTS.split_pdf) {
    return NextResponse.json({
      success: false,
      error: `Crediti insufficienti: servono almeno ${CREDIT_COSTS.split_pdf}, hai ${balance.total}`,
    }, { status: 402 });
  }

  const admin = createAdminClient();
  let creditsCharged = 0;

  try {
    // Step 1: Download PDF from Storage
    const signedUrl = await getSignedUrl(doc.storage_path);
    const pdfResponse = await fetch(signedUrl);
    if (!pdfResponse.ok) {
      return NextResponse.json({ success: false, error: 'Errore download documento' }, { status: 500 });
    }
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Step 2: OCR the document (or use existing pages)
    const { data: existingPages } = await admin
      .from('pages')
      .select('page_number, ocr_text')
      .eq('document_id', documentId)
      .order('page_number', { ascending: true });

    let ocrPages: Array<{ pageNumber: number; ocrText: string }>;

    if (existingPages && existingPages.length > 0) {
      ocrPages = existingPages.map((p) => ({
        pageNumber: p.page_number as number,
        ocrText: (p.ocr_text as string) ?? '',
      }));
    } else {
      const ocrResult = await ocrDocument({
        documentId,
        fileName: doc.file_name,
        fileType: doc.file_type,
        signedUrl,
      });
      ocrPages = ocrResult.pages.map((p) => ({
        pageNumber: p.pageNumber,
        ocrText: p.text,
      }));
    }

    if (ocrPages.length < 3) {
      return NextResponse.json({
        success: false,
        error: 'Il documento ha meno di 3 pagine. La divisione richiede almeno 3 pagine.',
      }, { status: 400 });
    }

    // Page cap: the classification loop below makes one Mistral Large call PER
    // page. Bound it before doing any LLM work (denial-of-wallet guard).
    if (ocrPages.length > PIPELINE_LIMITS.MAX_PAGES_PER_RUN) {
      return NextResponse.json({
        success: false,
        error: `Troppe pagine (${ocrPages.length}, limite ${PIPELINE_LIMITS.MAX_PAGES_PER_RUN}).`,
      }, { status: 400 });
    }

    // Analysis deposit: the per-page classification below is real LLM cost, so it
    // is charged UP FRONT (before the loop) and KEPT even when the document turns
    // out not to be splittable. This closes the "loop split-document for free
    // classification" denial-of-wallet hole (early returns no longer do unpaid
    // LLM work). On a successful split the per-resulting-doc remainder is added.
    const analysisFee = CREDIT_COSTS.split_pdf;
    const depositDeduction = await deductCredits(user.id, analysisFee, 'split_pdf', documentId, {
      reason: 'split_analysis',
      pages: ocrPages.length,
    });
    if (!depositDeduction.success) {
      return NextResponse.json({ success: false, error: depositDeduction.error }, { status: 402 });
    }
    creditsCharged = analysisFee;

    // Step 3: Classify each page + detect boundaries
    const pageClassifications = [];
    for (const page of ocrPages) {
      const classification = await classifyPage(page.ocrText, page.pageNumber);
      pageClassifications.push(classification);
    }

    const boundaries = detectBoundaries(pageClassifications);

    if (boundaries.length <= 1) {
      // Single content type: nothing to split. The analysis deposit is KEPT (the
      // per-page classification ran). No refund here — that is the exploit fix.
      return NextResponse.json({
        success: false,
        error: 'Il documento contiene un solo tipo di contenuto. Non serve dividerlo.',
      }, { status: 400 });
    }

    // Step 4: Split the PDF
    const segments = await splitPdf(new Uint8Array(pdfBuffer), boundaries, doc.file_name);

    // Step 5: Charge the per-resulting-document remainder. Total = segments * 3,
    // of which `analysisFee` was already taken as the deposit. Best-effort: if the
    // user lacks credits for the remainder we still deliver the completed split
    // (work is done) rather than failing — the under-charge is a minor revenue
    // matter, never a security one.
    const totalCredits = segments.length * CREDIT_COSTS.split_pdf;
    const remainder = totalCredits - analysisFee;
    if (remainder > 0) {
      const remainderDeduction = await deductCredits(user.id, remainder, 'split_pdf', documentId, {
        reason: 'split_resulting_docs',
        resultingDocs: segments.length,
      });
      if (remainderDeduction.success) {
        creditsCharged += remainder;
      } else {
        logger.warn('split-document', `Remainder charge of ${remainder} failed for ${documentId} — delivering split anyway`);
      }
    }

    // Step 6: Upload split PDFs and create document records
    const newDocIds: string[] = [];
    for (const segment of segments) {
      const ext = 'pdf';
      const storagePath = `${user.id}/${caseId}/${crypto.randomUUID()}.${ext}`;

      // Upload to Supabase Storage
      const { error: uploadErr } = await admin.storage
        .from('documents')
        .upload(storagePath, segment.buffer, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadErr) {
        logger.error('split-document', `Failed to upload split segment: ${uploadErr.message}`);
        continue;
      }

      // Create document record
      const { data: newDoc, error: insertErr } = await admin
        .from('documents')
        .insert({
          case_id: caseId,
          file_name: segment.fileName,
          file_type: 'application/pdf',
          file_size: segment.buffer.length,
          storage_path: storagePath,
          document_type: segment.documentType,
          processing_status: 'caricato',
          page_count: segment.pageCount,
          classification_metadata: {
            aiSuggestedType: segment.documentType,
            confidence: segment.avgConfidence,
            classifiedAt: new Date().toISOString(),
            classifiedBy: 'split-pdf',
          },
        })
        .select('id')
        .single();

      if (insertErr) {
        logger.error('split-document', `Failed to create document record: ${insertErr.message}`);
        continue;
      }

      if (newDoc) newDocIds.push(newDoc.id);
    }

    if (newDocIds.length === 0) {
      // All uploads failed — full refund
      await refundCredits(user.id, totalCredits, 'split_pdf', documentId, { reason: 'all_uploads_failed' });
      return NextResponse.json({ success: false, error: 'Errore nel caricamento dei documenti divisi' }, { status: 500 });
    }

    // Partial failure: refund for segments that failed to upload
    const failedSegments = segments.length - newDocIds.length;
    if (failedSegments > 0) {
      const partialRefund = failedSegments * CREDIT_COSTS.split_pdf;
      await refundCredits(user.id, partialRefund, 'split_pdf', documentId, {
        reason: 'partial_upload_failure',
        failedSegments,
        totalSegments: segments.length,
      });
    }

    // Step 7: Delete original document from Storage + DB
    await admin.storage.from('documents').remove([doc.storage_path]);
    await admin.from('pages').delete().eq('document_id', documentId);
    await admin.from('documents').delete().eq('id', documentId);

    // Update case document count
    const { count } = await admin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId);

    await admin
      .from('cases')
      .update({ document_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq('id', caseId);

    // Audit log
    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'document.split',
      entity_type: 'document',
      entity_id: documentId,
      metadata: {
        caseId,
        originalFileName: doc.file_name,
        resultingDocs: newDocIds.length,
        creditsCharged: totalCredits,
      },
    });

    // GDPR: niente file_name nei log (può contenere il nome del paziente); documentId basta.
    logger.info('split-document', `Split document into ${newDocIds.length} documents`, { documentId, caseId });

    return NextResponse.json({
      success: true,
      data: {
        resultingDocs: newDocIds.length,
        creditsCharged: totalCredits,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    logger.error('split-document', `Split failed: ${message}`, { documentId });

    // Refund credits if they were deducted before the error
    if (creditsCharged > 0) {
      await refundCredits(user.id, creditsCharged, 'split_pdf', documentId, { reason: 'split_failed' });
    }

    return NextResponse.json(
      { success: false, error: 'Errore nella divisione del PDF. Crediti rimborsati. Riprova.' },
      { status: 500 },
    );
  }
}
