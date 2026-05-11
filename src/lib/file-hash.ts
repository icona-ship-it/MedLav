/**
 * Compute the SHA-256 hash of a File using the Web Crypto API.
 *
 * Returns a 64-char lowercase hex string. Returns null if hashing fails
 * (browser quirk on very large files, missing crypto.subtle in non-secure
 * context, etc). Callers should treat null as "no dedup possible" and
 * proceed with the upload anyway — dedup is a convenience, not a security
 * boundary.
 *
 * Designed to run in the browser before uploading the file to Supabase
 * Storage, so that the server can reject duplicates without an extra round
 * trip + re-download.
 */
export async function computeFileSha256(file: File): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }

  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(digest);
  } catch {
    return null;
  }
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
