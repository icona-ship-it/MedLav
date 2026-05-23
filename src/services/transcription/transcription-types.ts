/**
 * Types for the audio dictation feature (Mistral Voxtral batch transcription).
 *
 * The user-facing language type uses 'auto' as a sentinel: when the perito does
 * NOT pre-select a language, the route omits the `language` field and Voxtral
 * auto-detects from audio. When they pin a language, we pass the ISO code.
 */

/** Selectable language for the dictation UI. 'auto' = let Voxtral detect from audio. */
export type DictationLanguage = 'auto' | 'it' | 'de' | 'en';

/** Result returned to the browser by /api/transcribe. */
export interface DictationResult {
  /** Transcribed text. May be empty in pathological cases — UI must handle. */
  text: string;
  /** ISO language code detected by Voxtral (e.g. 'it'). Null when unknown. */
  language: string | null;
  /** Audio duration in seconds, used for billing display. */
  durationSec: number;
  /** Credits consumed for this transcription (already deducted server-side). */
  costCredits: number;
}

/** Whitelist of audio MIME types accepted by /api/transcribe. */
export const DICTATION_ALLOWED_MIME_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/ogg',
  'audio/ogg;codecs=opus',
] as const;

/** Hard size cap for a single dictation clip, in bytes. ~5MB ≈ 10 min @ 64kbps WebM/Opus. */
export const DICTATION_MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/** Soft UX cap for recording duration before auto-stop, in seconds. */
export const DICTATION_DEFAULT_MAX_DURATION_SEC = 300;

/** Hard cap for recording duration even if caller overrides, in seconds. */
export const DICTATION_HARD_MAX_DURATION_SEC = 600;
