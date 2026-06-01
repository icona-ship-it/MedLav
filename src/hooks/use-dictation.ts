'use client';

/**
 * React hook for the dictation feature.
 *
 * Wraps getUserMedia + MediaRecorder + POST /api/transcribe in a small
 * state machine, so DictationButton (and any future consumer) doesn't have
 * to deal with browser audio plumbing.
 *
 * UX model: toggle. Caller invokes start() then stop(). Auto-stop fires at
 * maxDurationSec. cancel() throws the clip away without sending.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf-client';
import type { DictationLanguage, DictationResult } from '@/services/transcription/transcription-types';
import {
  DICTATION_DEFAULT_MAX_DURATION_SEC,
  DICTATION_HARD_MAX_DURATION_SEC,
} from '@/services/transcription/transcription-types';

export type DictationState =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'transcribing'
  | 'error';

export interface UseDictationOptions {
  /** Pre-pin the language. 'auto' (default) lets Voxtral detect from audio. */
  language?: DictationLanguage;
  /** Free-text hint to bias transcription toward domain vocabulary. */
  contextHint?: string;
  /** Caso a cui legare la dettatura nell'audit log (opzionale). */
  caseId?: string;
  /** Soft auto-stop. Defaults to 300 s. Hard-capped at 600 s server-side anyway. */
  maxDurationSec?: number;
  /** Called once with the transcribed text on successful clip. */
  onTranscript: (text: string, info: { language: string | null; durationSec: number }) => void;
  /** Called with a user-friendly error message when something fails. */
  onError?: (message: string) => void;
}

export interface UseDictationApi {
  state: DictationState;
  /** Seconds elapsed in the current recording (0 when not recording). */
  elapsedSec: number;
  /** Soft cap for the current session. */
  maxDurationSec: number;
  /** Start recording. No-op if already in a non-idle state. */
  start: () => Promise<void>;
  /** Stop recording and trigger transcription. No-op if not recording. */
  stop: () => void;
  /** Cancel recording and discard the audio without uploading. */
  cancel: () => void;
  /** Whether the browser exposes MediaRecorder + getUserMedia. */
  isSupported: boolean;
  /** Last error message (if any). */
  error: string | null;
}

function pickSupportedMimeType(): { mimeType: string } | null {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return null;
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ];
  for (const mt of candidates) {
    if (window.MediaRecorder.isTypeSupported(mt)) return { mimeType: mt };
  }
  // Last-resort: let the browser pick its default
  return { mimeType: '' };
}

function isMediaSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

function mapMicError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return "Accesso al microfono negato. Abilita il microfono nelle impostazioni del browser.";
    }
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      return 'Nessun microfono rilevato. Collega un microfono e riprova.';
    }
    if (err.name === 'NotReadableError') {
      return "Microfono occupato da un'altra applicazione.";
    }
  }
  return 'Errore microfono. Riprova.';
}

export function useDictation(options: UseDictationOptions): UseDictationApi {
  const {
    language = 'auto',
    contextHint,
    caseId,
    maxDurationSec: maxDurationOpt,
    onTranscript,
    onError,
  } = options;

  const maxDurationSec = Math.min(
    Math.max(10, maxDurationOpt ?? DICTATION_DEFAULT_MAX_DURATION_SEC),
    DICTATION_HARD_MAX_DURATION_SEC,
  );

  const [state, setState] = useState<DictationState>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const mimeTypeRef = useRef<string>('audio/webm');

  // Keep latest callbacks in refs so we don't recreate start/stop every render
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onTranscript, onError]);

  const releaseTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setElapsedSec(0);
  }, []);

  const reportError = useCallback((msg: string) => {
    setError(msg);
    setState('error');
    releaseTracks();
    onErrorRef.current?.(msg);
  }, [releaseTracks]);

  const uploadAndTranscribe = useCallback(async (blob: Blob): Promise<void> => {
    setState('transcribing');
    // Hard client-side timeout so the "sto trascrivendo…" spinner can never hang
    // forever if the network stalls after the server has already replied.
    // Server maxDuration=60s + Mistral timeout=60s → 90s gives margin.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    try {
      const fd = new FormData();
      fd.append('audio', blob, `dictation.${mimeTypeRef.current.split('/')[1]?.split(';')[0] ?? 'webm'}`);
      fd.append(
        'metadata',
        JSON.stringify({
          language,
          ...(contextHint ? { contextHint } : {}),
          ...(caseId ? { caseId } : {}),
        }),
      );

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { ...csrfHeaders() },
        body: fd,
        signal: controller.signal,
      });

      const json = (await res.json().catch(() => null)) as
        | { success: true; data: DictationResult }
        | { success: false; error: string }
        | null;

      if (!res.ok || !json || !json.success) {
        const message = json && 'error' in json && json.error
          ? json.error
          : `Errore durante la trascrizione (HTTP ${res.status}).`;
        reportError(message);
        return;
      }

      setState('idle');
      setError(null);
      onTranscriptRef.current(json.data.text, {
        language: json.data.language,
        durationSec: json.data.durationSec,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        reportError('Trascrizione interrotta: il server non ha risposto in tempo. Riprova.');
      } else {
        reportError(err instanceof Error ? err.message : 'Errore di rete durante la trascrizione.');
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, [language, contextHint, caseId, reportError]);

  const handleStop = useCallback(() => {
    if (cancelledRef.current) {
      releaseTracks();
      cancelledRef.current = false;
      setState('idle');
      return;
    }
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' });
    releaseTracks();
    if (blob.size === 0) {
      reportError('Nessun audio rilevato. Riprova.');
      return;
    }
    void uploadAndTranscribe(blob);
  }, [releaseTracks, reportError, uploadAndTranscribe]);

  const start = useCallback(async (): Promise<void> => {
    if (state !== 'idle' && state !== 'error') return;
    if (!isMediaSupported()) {
      reportError('Il tuo browser non supporta la dettatura vocale.');
      return;
    }
    const mt = pickSupportedMimeType();
    if (!mt) {
      reportError('Il tuo browser non supporta la dettatura vocale.');
      return;
    }
    cancelledRef.current = false;
    setError(null);
    setState('requesting-permission');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      reportError(mapMicError(err));
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = mt.mimeType
        ? new MediaRecorder(stream, { mimeType: mt.mimeType })
        : new MediaRecorder(stream);
      mimeTypeRef.current = recorder.mimeType || mt.mimeType || 'audio/webm';
    } catch {
      reportError('Impossibile inizializzare la registrazione.');
      return;
    }

    recorder.addEventListener('dataavailable', (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunksRef.current.push(ev.data);
      }
    });
    recorder.addEventListener('stop', handleStop);
    recorder.addEventListener('error', () => {
      reportError('Errore durante la registrazione.');
    });

    recorderRef.current = recorder;

    try {
      recorder.start(1000); // collect chunks every 1s — robust to abrupt stops
    } catch {
      reportError('Impossibile avviare la registrazione.');
      return;
    }

    setState('recording');
    setElapsedSec(0);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    autoStopRef.current = setTimeout(() => {
      // Auto-stop hit the soft cap — treat as a normal stop, upload the clip
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
    }, maxDurationSec * 1000);
  }, [state, maxDurationSec, handleStop, reportError]);

  const stop = useCallback((): void => {
    if (state !== 'recording') return;
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') {
      rec.stop();
    }
  }, [state]);

  const cancel = useCallback((): void => {
    if (state !== 'recording' && state !== 'requesting-permission') return;
    cancelledRef.current = true;
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') {
      rec.stop();
    } else {
      releaseTracks();
      setState('idle');
    }
  }, [state, releaseTracks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      releaseTracks();
    };
  }, [releaseTracks]);

  return {
    state,
    elapsedSec,
    maxDurationSec,
    start,
    stop,
    cancel,
    isSupported: isMediaSupported(),
    error,
  };
}
