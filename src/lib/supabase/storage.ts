import sharp from 'sharp';
import { createAdminClient } from './admin';
import { logger } from '@/lib/logger';

const BUCKET_NAME = 'documents';
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Max width for stored images. Medical images displayed at max ~800px in A4,
 * so 1600px gives 2x for retina/print while keeping size reasonable.
 */
const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 80;

/**
 * Generate a signed URL for downloading a file from Supabase Storage.
 * Uses admin client (service role) for server-side access.
 */
export async function getSignedUrl(storagePath: string): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate signed URL for ${storagePath}: ${error?.message ?? 'unknown error'}`);
  }

  return data.signedUrl;
}

/**
 * Download a file from Supabase Storage as a Blob.
 * Uses admin client (service role) for server-side access.
 */
export async function downloadFile(storagePath: string): Promise<Blob> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Failed to download file ${storagePath}: ${error?.message ?? 'unknown error'}`);
  }

  return data;
}

/**
 * Remove every file under a Storage prefix (e.g. `doc-summaries/{docId}` o
 * `ocr-images/{docId}`). Usata dalle cascate di cancellazione GDPR.
 *
 * PAGINA la list(): `.list()` di default ritorna solo 100 elementi — un
 * documento grande (200 pagine con figure) può avere >100 immagini OCR, che
 * altrimenti resterebbero orfane nel bucket (erasure Art.9 incompleta). Qui
 * scorriamo per pagine da 1000 finché non arriva una pagina più corta.
 */
export async function removeStoragePrefix(prefix: string): Promise<void> {
  const supabase = createAdminClient();
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data: listed, error: listErr } = await supabase.storage
      .from(BUCKET_NAME)
      .list(prefix, { limit: PAGE, offset });
    if (listErr) {
      logger.warn('storage', `list prefisso fallita (${prefix}, offset ${offset}): ${listErr.message}`);
      return;
    }
    if (!listed || listed.length === 0) return;
    const paths = listed.map((f) => `${prefix}/${f.name}`);
    const { error: rmErr } = await supabase.storage.from(BUCKET_NAME).remove(paths);
    if (rmErr) logger.warn('storage', `remove prefisso fallita (${prefix}, ${paths.length} file, possibili orfani): ${rmErr.message}`);
    if (listed.length < PAGE) return;
    offset += PAGE;
  }
}

/**
 * Upload a base64-encoded image to Supabase Storage.
 * Compresses to JPEG (quality 80) and resizes to max 1600px width to save storage and egress.
 * Backwards-compatible: storage path extension is controlled by the caller.
 */
export async function uploadBase64Image(params: {
  base64Data: string;
  storagePath: string;
}): Promise<void> {
  const supabase = createAdminClient();

  // Strip data URL prefix if present (e.g., "data:image/png;base64,")
  const rawBase64 = params.base64Data.includes(',')
    ? params.base64Data.split(',')[1]
    : params.base64Data;

  const rawBuffer = Buffer.from(rawBase64, 'base64');

  // Compress: resize to max width + convert to JPEG quality 80
  // Typical reduction: 2-5 MB PNG → 100-400 KB JPEG
  const compressed = await sharp(rawBuffer)
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(params.storagePath, compressed, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload image to ${params.storagePath}: ${error.message}`);
  }
}
