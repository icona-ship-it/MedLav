import { createAdminClient } from '@/lib/supabase/admin';
import { linkImagesToEvents } from '@/services/extraction/image-event-linker';
import { analyzeDocumentImages } from '@/services/image-analysis/diagnostic-image-analyzer';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';
import { safeJsonParse } from '@/lib/format';
import type { CaseType } from '@/types';
import { logger } from '@/lib/logger';

/** Un riferimento a una singola figura diagnostica (storagePath risolto). */
export interface FigureRef {
  path: string;
  pageNumber: number;
  documentId: string;
}

/**
 * Espande le pagine in singole FIGURE: `image_path` può contenere PIÙ figure sulla
 * stessa pagina separate da ';' (es. "p1-f0.png;p1-f1.png" — due proiezioni RX). Il
 * vecchio `.split(';')[0]` teneva solo la prima → le altre immagini diagnostiche
 * SPARIVANO dal referto. Capato a `max` (budget Pixtral/MAX_DIAGNOSTIC_IMAGES). Pura e testabile.
 */
export function expandFigureRefs(
  pages: ReadonlyArray<{ page_number: number; image_path: string; document_id: string }>,
  max: number,
): FigureRef[] {
  const refs: FigureRef[] = [];
  for (const page of pages) {
    for (const path of page.image_path.split(';').map((p) => p.trim()).filter(Boolean)) {
      if (refs.length >= max) return refs;
      refs.push({ path, pageNumber: page.page_number, documentId: page.document_id });
    }
  }
  return refs;
}

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

  const pagesRaw: Array<Record<string, unknown>> = [];
  for (let i = 0; i < docIds.length; i += 200) {
    const { data } = await supabase
      .from('pages')
      .select('id, document_id, page_number, image_path')
      .in('document_id', (docIds as string[]).slice(i, i + 200))
      .not('image_path', 'is', null);
    if (data) pagesRaw.push(...data);
  }

  if (!pagesRaw || pagesRaw.length === 0) {
    logger.info('pipeline', ' Step 4.5: No pages with images, skipping');
    return;
  }

  // Delete old event_images for this case's events (batched to avoid URL length limit)
  const eventIds = eventsRaw.map((e) => e.id as string);
  for (let i = 0; i < eventIds.length; i += 200) {
    await supabase
      .from('event_images')
      .delete()
      .in('event_id', eventIds.slice(i, i + 200));
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

    const { error: insertError } = await supabase.from('event_images').insert(rows);
    if (insertError) {
      logger.error('pipeline', `Failed to insert ${rows.length} event_images: ${insertError.message}`);
      // Non-blocking: images are supplementary, pipeline continues
    } else {
      logger.info('pipeline', ` Step 4.5: Linked ${links.length} images to events`);
    }
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

  // Count total pages with images before limiting (batched for URL limit)
  let totalImagesCount = 0;
  for (let i = 0; i < docIds.length; i += 200) {
    const { count } = await supabase
      .from('pages')
      .select('id', { count: 'exact', head: true })
      .in('document_id', (docIds as string[]).slice(i, i + 200))
      .not('image_path', 'is', null);
    totalImagesCount += count ?? 0;
  }

  // Audit P1-IMG-002: raised from 3 → 15 for maximum medico-legal coverage.
  // Pixtral cost ~€0.007/image → €0.10/case marginal. Pre/post-op RX series,
  // multi-slice RM, full TAC panels can easily require 10-15 images.
  const MAX_DIAGNOSTIC_IMAGES = 15;
  const pagesWithImages: Array<Record<string, unknown>> = [];
  for (let i = 0; i < docIds.length && pagesWithImages.length < MAX_DIAGNOSTIC_IMAGES; i += 200) {
    const { data } = await supabase
      .from('pages')
      .select('page_number, image_path, document_id')
      .in('document_id', (docIds as string[]).slice(i, i + 200))
      .not('image_path', 'is', null)
      .limit(MAX_DIAGNOSTIC_IMAGES - pagesWithImages.length);
    if (data) pagesWithImages.push(...data);
  }

  if (!pagesWithImages || pagesWithImages.length === 0) {
    logger.info('pipeline', ' Step 4.6: No images to analyze');
    return [];
  }

  const skippedCount = (totalImagesCount ?? 0) - pagesWithImages.length;
  if (skippedCount > 0) {
    logger.warn('pipeline',
      ` Step 4.6: ${skippedCount} diagnostic images skipped (limit: ${MAX_DIAGNOSTIC_IMAGES}, total: ${totalImagesCount}). ` +
      `Consider increasing MAX_DIAGNOSTIC_IMAGES for comprehensive analysis.`,
    );
  }

  // Espandi TUTTE le figure di ogni pagina (non solo la prima): una pagina con più
  // proiezioni RX/immagini altrimenti perdeva tutte le figure tranne la prima.
  const figureRefs = expandFigureRefs(
    pagesWithImages as Array<{ page_number: number; image_path: string; document_id: string }>,
    MAX_DIAGNOSTIC_IMAGES,
  );

  // Download images in parallel
  const downloadResults = await Promise.allSettled(
    figureRefs.map(async (ref) => {
      const { data: imageData } = await supabase.storage
        .from('documents')
        .download(ref.path);
      if (!imageData) throw new Error('No data');
      const buffer = await imageData.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return {
        base64,
        pageNumber: ref.pageNumber,
        storagePath: ref.path,
        documentId: ref.documentId,
      };
    }),
  );

  const images = downloadResults
    .filter((r): r is PromiseFulfilledResult<{ base64: string; pageNumber: number; storagePath: string; documentId: string }> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (images.length === 0) return [];

  logger.info('pipeline', ` Step 4.6: Analyzing ${images.length} diagnostic images`);
  // storagePath/documentId travel WITH each image into the analyzer and come back
  // on each result — no re-attach by pageNumber (which collides when two
  // documents share a page number → wrong image under the right caption).
  const results = await analyzeDocumentImages({
    images,
    caseType,
    maxImages: MAX_DIAGNOSTIC_IMAGES,
  });

  logger.info('pipeline', ` Step 4.6: Got ${results.length} image descriptions`);
  return results;
}
