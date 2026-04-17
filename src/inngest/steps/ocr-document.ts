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
// Audit P1-OCR-002: raised from 20 → 80. Storage is cheap; medico-legal
// completeness matters (a case with 50 RX/TAC referti should keep ALL images,
// not silently truncate).
const MAX_OCR_IMAGES_TO_SAVE = 80;

async function saveOcrImagesToStorage(
  supabase: ReturnType<typeof createAdminClient>,
  documentId: string,
  images: OcrImageResult[],
): Promise<void> {
  // Filter out non-diagnostic images (logos, signatures, stamps are typically < 15KB base64)
  const MIN_IMAGE_BASE64_LENGTH = 15_000; // ~11KB real file — diagnostic images are much larger
  const diagnosticImages = images.filter((img) => {
    if (img.imageBase64.length < MIN_IMAGE_BASE64_LENGTH) {
      logger.info('pipeline', ` Skipping small image p${img.pageNumber}-f${img.figureIndex} (${Math.round(img.imageBase64.length / 1000)}KB base64) — likely logo/signature`);
      return false;
    }
    return true;
  });

  // Limit remaining images to avoid timeout (large docs can have 50+ images)
  const imagesToSave = diagnosticImages.slice(0, MAX_OCR_IMAGES_TO_SAVE);

  // Upload ALL images in parallel
  const uploadResults = await Promise.allSettled(
    imagesToSave.map(async (img) => {
      const storagePath = `ocr-images/${documentId}/p${img.pageNumber}-f${img.figureIndex}.jpg`;
      await uploadBase64Image({ base64Data: img.imageBase64, storagePath });
      return { pageNumber: img.pageNumber, storagePath };
    }),
  );

  // Log failed uploads for observability
  for (const result of uploadResults) {
    if (result.status === 'rejected') {
      logger.warn('pipeline', `Image upload failed for doc ${documentId}: ${result.reason instanceof Error ? result.reason.message : 'unknown'}`);
    }
  }

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

/** Number of documents to process per Inngest step (batch).
 * Kept at 5 to stay well within Vercel's 800s timeout (5 × 80s = 400s worst case). */
export const OCR_BATCH_SIZE = 5;

/**
 * OCR a batch of documents sequentially within a single Inngest step.
 * Each doc is processed one at a time (Mistral semaphore serializes anyway).
 * Returns only successful results (failures are logged and documents marked as errore).
 */
export async function ocrDocumentBatch(
  docs: DocumentInfo[],
): Promise<OcrResult[]> {
  const results: OcrResult[] = [];
  for (const doc of docs) {
    const result = await ocrSingleDocument(doc);
    if (result !== null) results.push(result);
  }
  return results;
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
    let savedPageCount = 0;
    if (result.pages.length > 0) {
      const pageRows = result.pages.map((p) => ({
        document_id: doc.id,
        page_number: p.pageNumber,
        ocr_text: p.text,
        ocr_confidence: p.confidence,
        has_handwriting: p.hasHandwriting,
        handwriting_confidence: p.handwritingConfidence,
      }));

      // Upsert to handle Inngest step retries — avoids duplicate pages
      const { error: upsertError } = await supabase.from('pages').upsert(pageRows, { onConflict: 'document_id,page_number' });
      if (upsertError) {
        throw new Error(`Pages upsert failed for doc ${doc.id}: ${upsertError.message}`);
      }

      // Verify pages were actually saved (belt-and-suspenders)
      const { count } = await supabase
        .from('pages')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', doc.id);
      savedPageCount = count ?? 0;
      if (savedPageCount === 0) {
        throw new Error(`Pages upsert returned no error but 0 pages found in DB for doc ${doc.id} — possible silent failure`);
      }

      // Upload extracted images to Supabase Storage and update pages.image_path
      if (result.images.length > 0) {
        await saveOcrImagesToStorage(supabase, doc.id, result.images);
      }
    }

    await supabase
      .from('documents')
      .update({ page_count: savedPageCount || result.pageCount, updated_at: new Date().toISOString() })
      .eq('id', doc.id);

    logger.info('pipeline', ` Step 2: OCR completed for doc ${doc.id} - ${savedPageCount} pages saved (${result.pageCount} from API) in ${Date.now() - ocrStartMs}ms`);

    return {
      documentId: doc.id,
      fileName: doc.fileName,
      documentType: doc.documentType,
      fullText: '', // OCR text is stored in pages table — empty here to minimize Inngest step payload
      pageCount: savedPageCount || result.pageCount,
      averageConfidence: result.averageConfidence,
      ocrPages: result.ocrPages ?? result.pageCount,
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
