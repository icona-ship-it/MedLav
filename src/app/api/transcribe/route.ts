/**
 * POST /api/transcribe
 *
 * Voice dictation endpoint for the perito UI. Accepts a short audio clip
 * (multipart form-data), forwards it to Mistral Voxtral, returns the text.
 *
 * GDPR: the audio is never persisted (no Storage, no DB). Only metadata
 * (duration, language, cost) is recorded in audit_log. The transcript is
 * returned to the caller and lives only in their textarea until they save.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { deductCredits, refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { transcribeDictation } from '@/services/transcription/transcription-service';
import {
  DICTATION_MAX_AUDIO_BYTES,
  type DictationLanguage,
  type DictationResult,
} from '@/services/transcription/transcription-types';
import {
  isAllowedDictationMime,
  looksLikeAudioBytes,
  filenameForMime,
} from '@/services/transcription/transcription-validators';
import { logAccess } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { toUserMessage } from '@/lib/user-error-messages';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TAG = 'api:transcribe';

const metadataSchema = z.object({
  language: z.enum(['auto', 'it', 'de', 'en']).default('auto'),
  contextHint: z.string().max(200).optional(),
  /** Caso a cui la dettatura e' associata (per audit). Opzionale: alcuni form non hanno caseId. */
  caseId: z.string().uuid().optional(),
});

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError('Non autenticato', 401);

  const rateCheck = await checkRateLimit({
    key: `dictation:${user.id}`,
    ...RATE_LIMITS.DICTATION,
  });
  if (!rateCheck.success) {
    return jsonError(
      'Hai superato il limite di trascrizioni vocali per questa ora. Riprova piu tardi.',
      429,
    );
  }

  // ── Parse multipart form-data ──
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError('Richiesta non valida: atteso multipart/form-data.', 400);
  }

  const audioField = formData.get('audio');
  if (!(audioField instanceof Blob)) {
    return jsonError('Campo audio mancante.', 400);
  }

  if (audioField.size === 0) {
    return jsonError('Nessun audio rilevato.', 400);
  }

  if (audioField.size > DICTATION_MAX_AUDIO_BYTES) {
    return jsonError(
      `Audio troppo grande: massimo ${Math.floor(DICTATION_MAX_AUDIO_BYTES / 1024 / 1024)}MB.`,
      413,
    );
  }

  const mimeType = audioField.type || 'application/octet-stream';
  if (!isAllowedDictationMime(mimeType)) {
    return jsonError(`Formato audio non supportato: ${mimeType}.`, 415);
  }

  const metadataRaw = formData.get('metadata');
  const metadataJson = typeof metadataRaw === 'string' ? metadataRaw : '{}';
  let metadata: z.infer<typeof metadataSchema>;
  try {
    metadata = metadataSchema.parse(JSON.parse(metadataJson));
  } catch {
    return jsonError('Metadata dettatura non valida.', 400);
  }

  // Read bytes once and validate magic bytes
  const audioBuffer = new Uint8Array(await audioField.arrayBuffer());
  if (!looksLikeAudioBytes(audioBuffer)) {
    return jsonError('I dati caricati non risultano essere un file audio valido.', 400);
  }

  const filename = filenameForMime(mimeType);

  // ── Credit deduction (pre-operation, flat 1 credit) ──
  const deduction = await deductCredits(
    user.id,
    CREDIT_COSTS.dettatura,
    'dettatura',
    metadata.caseId,
    { mimeType, bytes: audioBuffer.byteLength, language: metadata.language },
  );
  if (!deduction.success) {
    return jsonError(deduction.error ?? 'Crediti insufficienti per la dettatura.', 402);
  }

  // ── Call Voxtral ──
  try {
    const result = await transcribeDictation({
      audio: audioBuffer,
      mimeType,
      filename,
      language: metadata.language as DictationLanguage,
      contextHint: metadata.contextHint,
      label: `dictation:${user.id.slice(0, 8)}`,
    });

    // Audit log: NEVER include the transcript text — only metadata
    logAccess({
      userId: user.id,
      action: 'dictation.transcribe',
      entityType: metadata.caseId ? 'case' : 'user',
      entityId: metadata.caseId ?? user.id,
      metadata: {
        durationSec: result.durationSec,
        languageDetected: result.language,
        languageRequested: metadata.language,
        costCredits: CREDIT_COSTS.dettatura,
        model: result.model,
        bytes: audioBuffer.byteLength,
      },
    });

    const payload: DictationResult = {
      text: result.text,
      language: result.language,
      durationSec: result.durationSec,
      costCredits: CREDIT_COSTS.dettatura,
    };
    return NextResponse.json({ success: true, data: payload });
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : 'unknown';
    logger.error(TAG, 'Transcription failed', {
      userId: user.id,
      bytes: audioBuffer.byteLength,
      error: rawMessage.slice(0, 200),
    });

    // Refund the credit on failure
    await refundCredits(user.id, CREDIT_COSTS.dettatura, 'dettatura', metadata.caseId, {
      reason: 'transcription_failed',
    });

    return jsonError(toUserMessage(rawMessage), 500);
  }
}
