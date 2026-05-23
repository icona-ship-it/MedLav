/**
 * Audio dictation service — thin orchestrator over the Mistral Voxtral client helper.
 *
 * Separates the API-route concerns (auth, rate-limit, credits, validation) from
 * the actual transcription call. Lets us mock the service in route tests and
 * mock the client in service tests without crossing layers.
 */

import { transcribeAudio, MISTRAL_MODELS } from '@/lib/mistral/client';
import { logger } from '@/lib/logger';
import type { DictationLanguage } from './transcription-types';

const TAG = 'transcription';

export interface TranscribeDictationParams {
  /** Audio bytes received from the browser (multipart upload). */
  audio: Uint8Array;
  /** MIME type, already whitelisted by the route. */
  mimeType: string;
  /** Filename hint passed to Voxtral (extension matters for codec routing). */
  filename: string;
  /** 'auto' or a specific ISO code. 'auto' is converted to undefined. */
  language: DictationLanguage;
  /** Optional context bias terms — improve accuracy on domain vocabulary. */
  contextHint?: string;
  /** Label for retry/log traces (e.g. 'dictation:user-abc'). */
  label: string;
}

export interface TranscribeDictationResult {
  text: string;
  language: string | null;
  durationSec: number;
  model: string;
}

/**
 * Build the contextBias array from a free-text hint.
 * Voxtral accepts up to a few short phrases that bias the decoder toward
 * domain vocabulary. We split the hint on commas and trim — the perito (or
 * the calling component) can pass something like
 * "anamnesi ortopedica, ginocchio, frattura".
 */
function buildContextBias(hint: string | undefined): string[] | undefined {
  if (!hint) return undefined;
  const terms = hint
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 60);
  if (terms.length === 0) return undefined;
  return terms.slice(0, 8); // cap to 8 terms to stay polite to the API
}

/**
 * Transcribe a single dictation clip.
 *
 * GDPR:
 *  - The audio is forwarded to Mistral (EU) and never persisted by us.
 *  - The returned `text` MUST stay confined to the user's session — never log
 *    it, never write it to audit_log. Only metadata (durationSec/language) is
 *    safe to record.
 */
export async function transcribeDictation(
  params: TranscribeDictationParams,
): Promise<TranscribeDictationResult> {
  const { audio, mimeType, filename, language, contextHint, label } = params;

  const startMs = Date.now();
  logger.info(TAG, 'Dictation transcription started', {
    bytes: audio.byteLength,
    mimeType,
    languageHint: language,
    label,
  });

  const contextBias = buildContextBias(contextHint);

  const result = await transcribeAudio({
    audio,
    mimeType,
    filename,
    label,
    ...(language !== 'auto' && { language }),
    ...(contextBias && { contextBias }),
    model: MISTRAL_MODELS.VOXTRAL_MINI,
  });

  logger.info(TAG, 'Dictation transcription done', {
    label,
    elapsedMs: Date.now() - startMs,
    durationSec: result.durationSec,
    languageDetected: result.language,
    textLen: result.text.length,
  });

  return result;
}
