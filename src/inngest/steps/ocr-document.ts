import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl, uploadBase64Image } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { isTextIngestType, buildTextIngestResult } from '@/services/ocr/text-ingestion';
import type { OcrImageResult } from '@/services/ocr/ocr-types';
import type { DocumentInfo, OcrResult } from './types';
import { logger } from '@/lib/logger';
import { recordDiagnostic, classifyPipelineError, sanitizeErrorForDetail } from '@/lib/pipeline-diagnostics';

/**
 * Upload OCR-extracted images to Supabase Storage and update pages.image_path.
 * Groups images by page, uploads each to ocr-images/{docId}/p{N}-f{M}.png,
 * then updates the page row with semicolon-separated storage paths.
 */
// Audit P1-OCR-002: raised from 20 → 80. Storage is cheap; medico-legal
// completeness matters (a case with 50 RX/TAC referti should keep ALL images,
// not silently truncate).
const MAX_OCR_IMAGES_TO_SAVE = 80;

export async function saveOcrImagesToStorage(
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
  const updateResults = await Promise.allSettled(
    [...byPage.entries()].map(([pageNumber, paths]) =>
      supabase
        .from('pages')
        .update({ image_path: paths.join(';') })
        .eq('document_id', documentId)
        .eq('page_number', pageNumber),
    ),
  );

  // Surface image_path DB-update failures: a swallowed failure means the image is
  // in Storage but NOT linked to its page → it never reaches the report (silent).
  const linkFailures = updateResults.filter(
    (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error),
  ).length;
  if (linkFailures > 0) {
    logger.error('pipeline', `Step 2: ${linkFailures}/${updateResults.length} image_path update(s) FAILED for doc ${documentId} — those diagnostic images will not appear in the report`);
  }

  logger.info('pipeline', ` Step 2: Saved ${savedCount}/${imagesToSave.length} images to storage for doc ${documentId}`);
}

/**
 * OCR "grezzo" di un singolo file: text-ingestion per XML/TXT, Mistral OCR per
 * il resto. Nessuna scrittura DB — riusato sia dal percorso singolo sia
 * dall'OCR di gruppo (merge multi-file 2026-08-19).
 */
export async function fetchOcrRawResult(doc: DocumentInfo) {
  if (isTextIngestType(doc.fileType, doc.fileName)) {
    // Text-based document (XML/TXT): the file IS text — read it directly
    // (no OCR call, ocrPages = 0). XML is sanitized: tags stripped,
    // attribute values kept, embedded base64 payloads removed.
    const { downloadFile } = await import('@/lib/supabase/storage');
    const blob = await downloadFile(doc.storagePath);
    const rawText = await blob.text();
    const result = buildTextIngestResult({
      documentId: doc.id,
      fileName: doc.fileName,
      fileType: doc.fileType,
      rawText,
    });
    logger.info('pipeline', ` Step 2: Text ingestion for doc ${doc.id}: ${result.pageCount} pages from ${rawText.length} raw chars`);
    return result;
  }
  const signedUrl = await getSignedUrl(doc.storagePath);
  return ocrDocument({
    documentId: doc.id,
    fileName: doc.fileName,
    fileType: doc.fileType,
    signedUrl,
  });
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
    const ocrStartMs = Date.now();
    logger.info('pipeline', ` Step 2: Starting OCR for doc ${doc.id} (${doc.fileName})`);

    const result = await fetchOcrRawResult(doc);

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
      // Total extracted chars (computed here while the text is in hand) —
      // drives the map-reduce volume gate without re-reading pages from DB.
      totalChars: result.pages.reduce((sum, p) => sum + (p.text?.length ?? 0), 0),
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
    // DocumentInfo non porta il caseId: lo si risolve qui (best-effort, solo
    // per la riga di diagnostica — mai bloccante).
    const { data: docRow } = await supabase.from('documents').select('case_id').eq('id', doc.id).single();
    if (docRow?.case_id) {
      await recordDiagnostic({
        caseId: docRow.case_id as string,
        step: 'ocr',
        code: classifyPipelineError(message),
        detail: { docId: doc.id, error: sanitizeErrorForDetail(message) },
      });
    }
    return null;
  }
}
