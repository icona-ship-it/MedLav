/**
 * Utility for resolving ocr-image: placeholders in report text.
 * Downloads images from Supabase Storage and replaces placeholders with:
 * - base64 data URIs (for self-contained HTML export)
 * - Binary data (for DOCX image embedding)
 */

import { downloadFile } from '@/lib/supabase/storage';
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
 * Download all images referenced in text from Supabase Storage.
 * Returns a map of storage path to resolved image data.
 */
export async function resolveOcrImages(text: string): Promise<Map<string, ResolvedImage>> {
  const paths = extractOcrImagePaths(text);
  const resolved = new Map<string, ResolvedImage>();

  await Promise.all(paths.map(async (storagePath) => {
    try {
      const blob = await downloadFile(storagePath);
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const mimeType = blob.type || 'image/png';
      resolved.set(storagePath, { storagePath, base64, mimeType, buffer });
    } catch (err) {
      logger.warn('export', `Failed to resolve image ${storagePath}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }));

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
