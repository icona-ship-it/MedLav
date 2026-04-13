/**
 * Utility for resolving ocr-image: placeholders in report text.
 * Downloads images from Supabase Storage and replaces placeholders with:
 * - base64 data URIs (for self-contained HTML export)
 * - Binary data (for DOCX image embedding)
 */

import { downloadFile } from '@/lib/supabase/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export interface ResolvedImage {
  storagePath: string;
  base64: string;
  mimeType: string;
  buffer: Buffer;
}

const OCR_IMAGE_REGEX = /!\[([^\]]*)\]\(ocr-image:([^)]+)\)/g;

/**
 * Extract all ocr-image: paths referenced in text.
 */
export function extractOcrImagePaths(text: string): string[] {
  const paths = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(OCR_IMAGE_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    paths.add(match[2]);
  }
  return [...paths];
}

/**
 * Fetch all real image storage paths for a case from the DB.
 * Used to remap LLM-invented filenames to actual storage paths.
 */
async function fetchRealImagePaths(caseId: string): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    const { data: docs } = await supabase
      .from('documents')
      .select('id')
      .eq('case_id', caseId);
    if (!docs || docs.length === 0) return [];

    const docIds = docs.map((d) => d.id as string);
    const allPaths: string[] = [];
    for (let i = 0; i < docIds.length; i += 200) {
      const { data: pages } = await supabase
        .from('pages')
        .select('image_path')
        .in('document_id', docIds.slice(i, i + 200))
        .not('image_path', 'is', null);
      if (pages) {
        for (const p of pages) {
          const paths = (p.image_path as string).split(';').filter(Boolean);
          allPaths.push(...paths);
        }
      }
    }
    return allPaths;
  } catch {
    return [];
  }
}

/**
 * Download all images referenced in text from Supabase Storage.
 * If LLM-generated paths don't match real storage paths, tries to remap them.
 * @param caseId - optional case ID for remapping LLM-invented paths to real ones
 */
export async function resolveOcrImages(text: string, caseId?: string): Promise<Map<string, ResolvedImage>> {
  const paths = extractOcrImagePaths(text);
  const resolved = new Map<string, ResolvedImage>();

  // First try direct download (paths match storage)
  const unresolved: string[] = [];
  await Promise.all(paths.map(async (storagePath) => {
    try {
      const blob = await downloadFile(storagePath);
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const isJpeg = storagePath.endsWith('.jpg') || storagePath.endsWith('.jpeg');
      const mimeType = isJpeg ? 'image/jpeg' : (blob.type || 'image/png');
      resolved.set(storagePath, { storagePath, base64, mimeType, buffer });
    } catch {
      unresolved.push(storagePath);
    }
  }));

  // If some paths failed and we have a caseId, try remapping to real storage paths
  if (unresolved.length > 0 && caseId) {
    const realPaths = await fetchRealImagePaths(caseId);
    if (realPaths.length > 0) {
      // Try to match each unresolved path to a real path by position order
      // (LLM typically references images in the order they appear in the document)
      let realIdx = 0;
      for (const fakePath of unresolved) {
        if (realIdx >= realPaths.length) break;
        const realPath = realPaths[realIdx];
        try {
          const blob = await downloadFile(realPath);
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64 = buffer.toString('base64');
          const isJpeg = realPath.endsWith('.jpg') || realPath.endsWith('.jpeg');
          const mimeType = isJpeg ? 'image/jpeg' : (blob.type || 'image/png');
          resolved.set(fakePath, { storagePath: realPath, base64, mimeType, buffer });
          realIdx++;
        } catch (err) {
          logger.warn('export', `Failed to download remapped image ${realPath}: ${err instanceof Error ? err.message : 'unknown'}`);
          realIdx++;
        }
      }
      if (resolved.size > paths.length - unresolved.length) {
        logger.info('export', `Remapped ${resolved.size - (paths.length - unresolved.length)} LLM-invented image paths to real storage paths`);
      }
    }
  }

  return resolved;
}

/**
 * Replace ocr-image: placeholders with base64 data URIs for self-contained HTML.
 */
export function replaceWithDataUris(text: string, images: Map<string, ResolvedImage>): string {
  return text.replace(
    new RegExp(OCR_IMAGE_REGEX.source, 'g'),
    (_match: string, alt: string, path: string) => {
      const img = images.get(path);
      if (!img) return `[Immagine non disponibile: ${alt}]`;
      return `![${alt}](data:${img.mimeType};base64,${img.base64})`;
    },
  );
}

/**
 * Replace ocr-image: placeholders with API proxy URLs for UI preview.
 */
export function replaceWithProxyUrls(text: string, caseId: string): string {
  return text.replace(
    new RegExp(OCR_IMAGE_REGEX.source, 'g'),
    (_match: string, alt: string, path: string) => {
      return `![${alt}](/api/cases/${caseId}/images?path=${encodeURIComponent(path)})`;
    },
  );
}
