import { createAdminClient } from '@/lib/supabase/admin';
import { linkImagesToEvents } from '@/services/extraction/image-event-linker';
import { analyzeDocumentImages } from '@/services/image-analysis/diagnostic-image-analyzer';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';
import { safeJsonParse } from '@/lib/format';
import type { CaseType } from '@/types';
import { logger } from '@/lib/logger';

/**
 * Step 4.5: Link images to events based on sourcePages.
 * Matches event sourcePages with page image data and inserts event_images rows.
 */
export async function linkImagesToEventsStep(caseId: string): Promise<void> {
  const supabase = createAdminClient();

  logger.info('pipeline', ` Step 4.5: Linking images to events`);

  // Fetch events with source_pages for this case
  const { data: eventsRaw } = await supabase
    .from('events')
    .select('id, document_id, source_pages')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .not('source_pages', 'is', null);

  if (!eventsRaw || eventsRaw.length === 0) {
    logger.info('pipeline', ' Step 4.5: No events with source_pages, skipping');
    return;
  }

  // Fetch pages with images for documents in this case
  const { data: docsRaw } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId);

  if (!docsRaw || docsRaw.length === 0) return;

  const docIds = docsRaw.map((d) => d.id);

  const { data: pagesRaw } = await supabase
    .from('pages')
    .select('id, document_id, page_number, image_path')
    .in('document_id', docIds)
    .not('image_path', 'is', null);

  if (!pagesRaw || pagesRaw.length === 0) {
    logger.info('pipeline', ' Step 4.5: No pages with images, skipping');
    return;
  }

  // Delete old event_images for this case's events
  const eventIds = eventsRaw.map((e) => e.id);
  if (eventIds.length > 0) {
    await supabase
      .from('event_images')
      .delete()
      .in('event_id', eventIds);
  }

  // Build links
  const events = eventsRaw.map((e) => ({
    eventId: e.id as string,
    documentId: (e.document_id ?? null) as string | null,
    sourcePages: safeJsonParse<number[]>(e.source_pages as string, []),
  }));

  const pagesWithImages = pagesRaw.map((p) => ({
    pageId: p.id as string,
    documentId: p.document_id as string,
    pageNumber: p.page_number as number,
    imagePath: p.image_path as string,
  }));

  const links = linkImagesToEvents(events, pagesWithImages);

  if (links.length > 0) {
    const rows = links.map((l) => ({
      event_id: l.eventId,
      page_id: l.pageId,
      image_path: l.imagePath,
      page_number: l.pageNumber,
    }));

    await supabase.from('event_images').insert(rows);
    logger.info('pipeline', ` Step 4.5: Linked ${links.length} images to events`);
  }
}

/**
 * Step 4.6: Analyze diagnostic images (optional, max 5 per case).
 * Downloads images from storage, sends to Mistral vision for objective description.
 */
export async function analyzeDiagnosticImagesStep(
  caseId: string,
  caseType: CaseType,
): Promise<ImageAnalysisResult[]> {
  const supabase = createAdminClient();

  // Fetch pages with images for this case
  const { data: docsForImages } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId);

  if (!docsForImages || docsForImages.length === 0) return [];

  const docIds = docsForImages.map((d) => d.id);
  const { data: pagesWithImages } = await supabase
    .from('pages')
    .select('page_number, image_path, document_id')
    .in('document_id', docIds)
    .not('image_path', 'is', null)
    .limit(3); // Max 3 images to stay within Vercel timeout

  if (!pagesWithImages || pagesWithImages.length === 0) {
    logger.info('pipeline', ' Step 4.6: No images to analyze');
    return [];
  }

  // Download images in parallel
  const downloadResults = await Promise.allSettled(
    pagesWithImages.map(async (page) => {
      const firstPath = (page.image_path as string).split(';')[0];
      const { data: imageData } = await supabase.storage
        .from('documents')
        .download(firstPath);
      if (!imageData) throw new Error('No data');
      const buffer = await imageData.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return { base64, pageNumber: page.page_number as number, storagePath: firstPath };
    }),
  );

  const images = downloadResults
    .filter((r): r is PromiseFulfilledResult<{ base64: string; pageNumber: number; storagePath: string }> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (images.length === 0) return [];

  logger.info('pipeline', ` Step 4.6: Analyzing ${images.length} diagnostic images`);
  const results = await analyzeDocumentImages({
    images,
    caseType,
    maxImages: 3,
  });

  // Attach storage paths to results
  for (const result of results) {
    const match = images.find((img) => img.pageNumber === result.pageNumber);
    if (match) {
      result.storagePath = match.storagePath;
    }
  }

  logger.info('pipeline', ` Step 4.6: Got ${results.length} image descriptions`);
  return results;
}
