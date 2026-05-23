/**
 * Pure validation helpers for the /api/transcribe route.
 * Extracted to be unit-testable without route/supabase infrastructure.
 */

import { DICTATION_ALLOWED_MIME_TYPES } from './transcription-types';

/**
 * Whether a MIME type is allowed for dictation upload.
 * Tolerant to codec suffixes (e.g. "audio/webm;codecs=opus" matches "audio/webm").
 */
export function isAllowedDictationMime(mime: string): boolean {
  if (!mime || typeof mime !== 'string') return false;
  return (DICTATION_ALLOWED_MIME_TYPES as readonly string[]).some((allowed) => {
    if (mime === allowed) return true;
    const base = allowed.split(';')[0];
    return mime.startsWith(`${base};`);
  });
}

/**
 * Crude magic-byte sniff so an obviously-not-audio payload is rejected before
 * we burn Mistral cost or a credit. Not a security boundary — Voxtral will
 * reject garbage too — but it surfaces the common mistake of POSTing a PDF
 * with audio/webm MIME.
 *
 * Supported families: OGG, RIFF/WAV, MP3 (ID3 or sync word), WebM/Matroska,
 * MP4/M4A (ftyp box).
 */
export function looksLikeAudioBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  const h = bytes;
  // OGG: "OggS"
  if (h[0] === 0x4f && h[1] === 0x67 && h[2] === 0x67 && h[3] === 0x53) return true;
  // RIFF (WAV)
  if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46) return true;
  // MP3: ID3 tag at start
  if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) return true;
  // MP3: MPEG audio sync word (0xFFE0 mask)
  if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return true;
  // WebM / Matroska EBML
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return true;
  // MP4 / M4A: bytes 4-7 spell "ftyp"
  if (h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70) return true;
  return false;
}

/**
 * Pick the filename extension Voxtral expects from the MIME the browser sent.
 * Falls back to ogg.
 */
export function filenameForMime(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'dictation.webm';
  if (mime.startsWith('audio/mp4')) return 'dictation.m4a';
  if (mime.startsWith('audio/mpeg')) return 'dictation.mp3';
  if (
    mime.startsWith('audio/wav') ||
    mime.startsWith('audio/wave') ||
    mime.startsWith('audio/x-wav')
  ) {
    return 'dictation.wav';
  }
  return 'dictation.ogg';
}
