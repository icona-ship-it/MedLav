'use client';

/**
 * Reusable microphone button for voice dictation.
 *
 * - Click to start, click again to stop. Auto-stops at maxDurationSec.
 * - Pressing Escape during a recording cancels the clip without sending it.
 * - First time a user opens it in this browser, shows a GDPR disclaimer once.
 *
 * Drop next to any <Textarea> / <Input> / RichText editor — the `onTranscript`
 * callback is invoked with the transcribed text so the consumer decides how
 * to insert it (replace, append, splice at cursor, etc.).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDictation } from '@/hooks/use-dictation';
import { DictationDisclaimer, hasAcceptedDictationDisclaimer } from '@/components/dictation-disclaimer';
import type { DictationLanguage } from '@/services/transcription/transcription-types';

export interface DictationButtonProps {
  /** Called with transcribed text when a clip is successfully transcribed. */
  onTranscript: (text: string) => void;
  /** 'auto' (default) lets Voxtral detect from audio. */
  language?: DictationLanguage;
  /** Domain hint for better accuracy (e.g. "anamnesi ortopedica, ginocchio"). */
  contextHint?: string;
  /** Case ID for audit log linkage (optional). */
  caseId?: string;
  /** Soft auto-stop in seconds. Defaults to 300. Capped at 600 server-side. */
  maxDurationSec?: number;
  /** Visual variant: icon-only (toolbar/inline) or icon + label (standalone). */
  variant?: 'icon-only' | 'icon-label';
  /** Button size. Forwards to shadcn Button. */
  size?: 'sm' | 'default' | 'icon';
  /** Extra classes for the button. */
  className?: string;
  /** Disable the control (e.g. parent form is busy). */
  disabled?: boolean;
}

function formatMmSs(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function DictationButton({
  onTranscript,
  language = 'auto',
  contextHint,
  caseId,
  maxDurationSec,
  variant = 'icon-only',
  size = 'icon',
  className,
  disabled,
}: DictationButtonProps): React.ReactElement {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const { state, elapsedSec, maxDurationSec: effectiveMax, start, stop, cancel, isSupported, error } = useDictation({
    language,
    contextHint,
    caseId,
    maxDurationSec,
    onTranscript: (text) => {
      onTranscript(text);
      toast.success('Trascrizione completata');
    },
    onError: (msg) => {
      toast.error(msg);
    },
  });

  // Surface error state into a toast on transition (once)
  useEffect(() => {
    if (state === 'error' && error) {
      // already surfaced via onError; no-op
    }
  }, [state, error]);

  // ESC cancels an active recording without sending
  useEffect(() => {
    if (state !== 'recording') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
        toast.info('Dettatura annullata');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, cancel]);

  // Warn at 30s before auto-stop (only once per recording)
  useEffect(() => {
    if (state !== 'recording') return;
    if (effectiveMax - elapsedSec === 30) {
      toast.warning(`La registrazione si fermerà tra 30 secondi`);
    }
  }, [state, elapsedSec, effectiveMax]);

  const handleClick = useCallback(async () => {
    if (state === 'recording') {
      stop();
      return;
    }
    if (state === 'transcribing' || state === 'requesting-permission') {
      return;
    }
    if (!hasAcceptedDictationDisclaimer()) {
      setShowDisclaimer(true);
      return;
    }
    await start();
  }, [state, start, stop]);

  const handleDisclaimerAccept = useCallback(async () => {
    setShowDisclaimer(false);
    await start();
  }, [start]);

  const label = useMemo(() => {
    if (state === 'recording') return `Stop (${formatMmSs(elapsedSec)})`;
    if (state === 'transcribing') return 'Trascrizione…';
    if (state === 'requesting-permission') return 'Microfono…';
    return 'Detta';
  }, [state, elapsedSec]);

  const title = useMemo(() => {
    if (!isSupported) return 'Dettatura non supportata da questo browser';
    if (state === 'recording') return `Registrazione in corso (${formatMmSs(elapsedSec)} / ${formatMmSs(effectiveMax)}). Clicca per fermare, ESC per annullare.`;
    if (state === 'transcribing') return 'Trascrizione in corso…';
    return 'Detta con la voce (Mistral Voxtral, EU). Clicca per registrare.';
  }, [isSupported, state, elapsedSec, effectiveMax]);

  const Icon = state === 'recording'
    ? Square
    : state === 'transcribing' || state === 'requesting-permission'
      ? Loader2
      : Mic;

  const isBusy = state === 'transcribing' || state === 'requesting-permission';

  return (
    <>
      <Button
        type="button"
        variant={state === 'recording' ? 'destructive' : 'outline'}
        size={size}
        onClick={handleClick}
        disabled={disabled || !isSupported || isBusy}
        title={title}
        aria-label={label}
        aria-pressed={state === 'recording'}
        className={cn(
          state === 'recording' && 'animate-pulse',
          className,
        )}
      >
        <Icon
          className={cn(
            isBusy && 'animate-spin',
          )}
        />
        {variant === 'icon-label' && (
          <span className="ml-1">{label}</span>
        )}
        {variant === 'icon-only' && state === 'recording' && (
          <span className="ml-1 tabular-nums text-xs">{formatMmSs(elapsedSec)}</span>
        )}
      </Button>

      <DictationDisclaimer
        open={showDisclaimer}
        onOpenChange={setShowDisclaimer}
        onAccept={handleDisclaimerAccept}
      />
    </>
  );
}
