import { createAdminClient } from './admin';

const BUCKET_NAME = 'documents';
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

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
