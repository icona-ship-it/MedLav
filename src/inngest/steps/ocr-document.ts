import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import type { DocumentInfo, OcrResult } from './types';
import { logger } from '@/lib/logger';

/**
 * Step 2: OCR a single document — text only, no base64 images (fast, light response).
 * Saves OCR pages to database and updates document status.
 * Returns null if OCR fails (error is logged and document marked as errore).
 */
export async function ocrSingleDocument(doc: DocumentInfo): Promise<OcrResult | null> {
  const supabase = createAdminClient();

  await supabase
    .from('documents')
    .update({ processing_status: 'ocr_in_corso', updated_at: new Date().toISOString() })
    .eq('id', doc.id);

  try {
    const signedUrl = await getSignedUrl(doc.storagePath);

    const ocrStartMs = Date.now();
    logger.info('pipeline', ` Step 2: Starting OCR for doc ${doc.id} (${doc.fileName})`);

    const result = await ocrDocument({
      documentId: doc.id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      signedUrl,
    });

    // Save OCR pages to database (text only)
    if (result.pages.length > 0) {
      const pageRows = result.pages.map((p) => ({
        document_id: doc.id,
        page_number: p.pageNumber,
        ocr_text: p.text,
        ocr_confidence: p.confidence,
        has_handwriting: p.hasHandwriting,
        handwriting_confidence: p.handwritingConfidence,
      }));

      await supabase.from('pages').insert(pageRows);
    }

    await supabase
      .from('documents')
      .update({ page_count: result.pageCount, updated_at: new Date().toISOString() })
      .eq('id', doc.id);

    logger.info('pipeline', ` Step 2: OCR completed for doc ${doc.id} - ${result.pageCount} pages in ${Date.now() - ocrStartMs}ms`);

    return {
      documentId: doc.id,
      fileName: doc.fileName,
      documentType: doc.documentType,
      fullText: result.fullText,
      pageCount: result.pageCount,
      averageConfidence: result.averageConfidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR failed';
    await supabase
      .from('documents')
      .update({
        processing_status: 'errore',
        processing_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doc.id);

    logger.error('pipeline', ` OCR failed for doc ${doc.id}: ${message}`);
    return null;
  }
}
