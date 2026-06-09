'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { csrfHeaders } from '@/lib/csrf-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

interface SectionRegenerateButtonProps {
  caseId: string;
  /** Canonical section id (section.canonicalId) — the endpoint matches on this. */
  sectionId: string;
  sectionTitle: string;
  /** Report version the client is acting on (optimistic concurrency). */
  reportVersion?: number;
  disabled?: boolean;
  onRegenerated: () => void;
  /** documentazione_sanitaria: generate the LLM-"elaborated" (integral) variant. */
  elaborated?: boolean;
  /** documentazione_sanitaria: generate the LLM-"selective" variant — quote
   * significant findings verbatim, paraphrase routine, hard-verify each quote. */
  selective?: boolean;
  /** Custom trigger label (default "Rigenera Sezione"). */
  label?: string;
  /** Fired with the in-flight state (true on start, false on finish) so a parent
   * can disable sibling actions during a regeneration. */
  onRegeneratingChange?: (active: boolean) => void;
}

export function SectionRegenerateButton({
  caseId, sectionId, sectionTitle, reportVersion, disabled, onRegenerated, elaborated, selective, label, onRegeneratingChange,
}: SectionRegenerateButtonProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  // When the server blocks a regen because the section was edited/locked,
  // we surface a confirmation instead of silently overwriting the perito's work.
  const [blockedReason, setBlockedReason] = useState<'edited' | 'locked' | null>(null);

  const handleRegenerate = useCallback(async (force = false) => {
    setIsRegenerating(true);
    onRegeneratingChange?.(true);
    try {
      const response = await fetch('/api/processing/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          caseId,
          sectionId,
          instruction: instruction.trim() || undefined,
          force,
          expectedVersion: reportVersion,
          elaborated: elaborated || undefined,
          selective: selective || undefined,
        }),
      });
      const result = await response.json() as {
        success: boolean; error?: string; blocked?: boolean; reason?: 'edited' | 'locked';
      };
      if (result.blocked) {
        // Section is protected — ask the perito to confirm overwrite.
        setBlockedReason(result.reason ?? 'edited');
        return;
      }
      if (!result.success) {
        toast.error(result.error ?? 'Errore rigenerazione sezione');
        return;
      }
      toast.success(`Sezione "${sectionTitle}" rigenerata`);
      setOpen(false);
      setInstruction('');
      setBlockedReason(null);
      onRegenerated();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsRegenerating(false);
      onRegeneratingChange?.(false);
    }
  }, [caseId, sectionId, sectionTitle, instruction, reportVersion, onRegenerated, elaborated, selective, onRegeneratingChange]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setBlockedReason(null);
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled || isRegenerating}
          title={
            selective
              ? `Genera la versione sintetica (AI) di "${sectionTitle}": cita verbatim i reperti rilevanti, parafrasa la routine`
              : elaborated
                ? `Genera la versione elaborata (AI) di "${sectionTitle}"`
                : `Rigenera "${sectionTitle}"`
          }
        >
          {isRegenerating ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          {label ?? 'Rigenera Sezione'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        {blockedReason ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
              <p>
                {blockedReason === 'locked'
                  ? `"${sectionTitle}" è confermata (bloccata).`
                  : `"${sectionTitle}" è stata modificata a mano.`}
                {' '}Rigenerarla <strong>sovrascriverà</strong> il tuo testo. Continuare?
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => setBlockedReason(null)} disabled={isRegenerating}>
                Annulla
              </Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleRegenerate(true)} disabled={isRegenerating}>
                {isRegenerating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Sovrascrivi
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">Rigenera: {sectionTitle}</p>
            <Textarea
              placeholder="Istruzioni opzionali (es: enfatizza la perdita di chance, aggiungi dettagli sul nesso causale...)"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value.slice(0, 500))}
              className="min-h-[80px] text-sm"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">{instruction.length}/500 caratteri</p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => handleRegenerate(false)}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Rigenerazione...</>
              ) : (
                <><RefreshCw className="mr-1 h-3 w-3" />Rigenera sezione</>
              )}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
