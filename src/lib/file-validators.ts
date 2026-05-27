/**
 * Magic-byte file validators for documents uploaded by users.
 *
 * Why: clients can lie about MIME type. A `.exe` renamed `.pdf` would pass
 * a content-type check but fails magic-byte inspection. For software handling
 * medical-legal documents in a shared environment, accepting forged files is
 * a vector for case-sharing-based malware distribution.
 *
 * Whitelist: PDF, JPEG, PNG, TIFF, WebP, DOC, DOCX, XLS, XLSX (formats actually
 * used by perito-uploaded clinical documentation).
 */

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const);

export type AllowedDocumentMime = typeof ALLOWED_DOCUMENT_MIME_TYPES extends Set<infer T> ? T : never;

export function isAllowedDocumentMime(mime: string): boolean {
  return (ALLOWED_DOCUMENT_MIME_TYPES as Set<string>).has(mime);
}

/**
 * Detect file format from leading bytes (magic numbers).
 * Returns the canonical MIME type, or null if unrecognized.
 *
 * Reference: https://en.wikipedia.org/wiki/List_of_file_signatures
 */
export function detectMimeFromMagic(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 4) return null;
  const h = bytes;

  // PDF: "%PDF-"
  if (h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46) {
    return 'application/pdf';
  }

  // JPEG: FF D8 FF
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47 &&
    h[4] === 0x0d && h[5] === 0x0a && h[6] === 0x1a && h[7] === 0x0a
  ) {
    return 'image/png';
  }

  // TIFF (little-endian "II*\0" or big-endian "MM\0*")
  if ((h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00) ||
      (h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a)) {
    return 'image/tiff';
  }

  // WebP: RIFF....WEBP
  if (h.byteLength >= 12 &&
      h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 &&
      h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50) {
    return 'image/webp';
  }

  // ZIP-based formats (DOCX, XLSX, PPTX): all begin with PK\x03\x04
  // We can't distinguish doc/xls/ppt from magic alone — caller must pair
  // with file extension or explicit content type from the upload metadata.
  if (h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04) {
    return 'application/zip-office'; // sentinel — caller resolves to docx/xlsx
  }

  // Legacy MS Office (.doc, .xls) — Compound File Binary Format: D0 CF 11 E0 A1 B1 1A E1
  if (h.byteLength >= 8 &&
      h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0 &&
      h[4] === 0xa1 && h[5] === 0xb1 && h[6] === 0x1a && h[7] === 0xe1) {
    return 'application/cfb-office'; // sentinel — caller resolves to doc/xls
  }

  return null;
}

interface ValidateResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate that the bytes match one of the allowed document formats,
 * AND that the detected magic is consistent with the declared MIME type.
 *
 * The "sentinel" magic types (zip-office, cfb-office) require pairing with
 * the declared `mimeType` — if the user says DOCX and bytes are zip-office,
 * we accept; if they say PNG and bytes are zip-office, we reject.
 */
export function validateDocumentBytes(
  bytes: Uint8Array,
  declaredMimeType: string,
): ValidateResult {
  if (bytes.byteLength === 0) {
    return { ok: false, reason: 'File vuoto.' };
  }

  if (!isAllowedDocumentMime(declaredMimeType)) {
    return { ok: false, reason: `Tipo file non supportato: ${declaredMimeType}` };
  }

  const detected = detectMimeFromMagic(bytes);
  if (detected == null) {
    return {
      ok: false,
      reason: 'Formato file non riconosciuto. Caricabili: PDF, JPEG, PNG, TIFF, WebP, DOC/DOCX, XLS/XLSX.',
    };
  }

  // Direct matches
  if (detected === declaredMimeType) {
    return { ok: true };
  }

  // Office sentinel matching
  const OFFICE_NEW = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]);
  if (detected === 'application/zip-office' && OFFICE_NEW.has(declaredMimeType)) {
    return { ok: true };
  }

  const OFFICE_LEGACY = new Set(['application/msword', 'application/vnd.ms-excel']);
  if (detected === 'application/cfb-office' && OFFICE_LEGACY.has(declaredMimeType)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Il contenuto del file non corrisponde al tipo dichiarato (${declaredMimeType}). Possibile file rinominato o corrotto.`,
  };
}
