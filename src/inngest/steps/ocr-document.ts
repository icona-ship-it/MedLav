import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl, uploadBase64Image } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import type { OcrImageResult } from '@/services/ocr/ocr-types';
import type { DocumentInfo, OcrResult } from './types';
import { logger } from '@/lib/logger';

/**
 * Upload OCR-extracted images to Supabase Storage and update pages.image_path.
 * Groups images by page, uploads each to ocr-images/{docId}/p{N}-f{M}.png,
 * then updates the page row with semicolon-separated storage paths.
 */
const MAX_OCR_IMAGES_TO_SAVE = 20;

async function saveOcrImagesToStorage(
  supabase: ReturnType<typeof createAdminClient>,
  documentId: string,
  images: OcrImageResult[],
): Promise<void> {
  // Limit images to avoid timeout (large docs can have 50+ images)
  const imagesToSave = images.slice(0, MAX_OCR_IMAGES_TO_SAVE);

  // Upload ALL images in parallel
  const uploadResults = await Promise.allSettled(
    imagesToSave.map(async (img) => {
      const storagePath = `ocr-images/${documentId}/p${img.pageNumber}-f${img.figureIndex}.png`;
      await uploadBase64Image({ base64Data: img.imageBase64, storagePath });
      return { pageNumber: img.pageNumber, storagePath };
    }),
  );

  // Group successful uploads by page
  const byPage = new Map<number, string[]>();
  for (const result of uploadResults) {
    if (result.status === 'fulfilled') {
      const { pageNumber, storagePath } = result.value;
      const existing = byPage.get(pageNumber) ?? [];
      existing.push(storagePath);
      byPage.set(pageNumber, existing);
    }
  }

  // Update pages in parallel
  const savedCount = [...byPage.values()].reduce((sum, paths) => sum + paths.length, 0);
  await Promise.allSettled(
    [...byPage.entries()].map(([pageNumber, paths]) =>
      supabase
        .from('pages')
        .update({ image_path: paths.join(';') })
        .eq('document_id', documentId)
        .eq('page_number', pageNumber),
    ),
  );

  logger.info('pipeline', ` Step 2: Saved ${savedCount}/${imagesToSave.length} images to storage for doc ${documentId}`);
}

/**
 * Step 2: OCR a single document.
 * Always runs fresh OCR to ensure maximum analysis quality.
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

    // Save OCR pages to database
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

      // Upload extracted images to Supabase Storage and update pages.image_path
      if (result.images.length > 0) {
        await saveOcrImagesToStorage(supabase, doc.id, result.images);
      }
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
