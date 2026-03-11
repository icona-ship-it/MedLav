'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { csrfHeaders } from '@/lib/csrf-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

interface SectionRegenerateButtonProps {
  caseId: string;
  sectionId: string;
  sectionTitle: string;
  disabled?: boolean;
  onRegenerated: () => void;
}

export function SectionRegenerateButton({
  caseId, sectionId, sectionTitle, disabled, onRegenerated,
}: SectionRegenerateButtonProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/processing/regenerate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          caseId,
          sectionId,
          instruction: instruction.trim() || undefined,
        }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        toast.error(result.error ?? 'Errore rigenerazione sezione');
        return;
      }
      toast.success(`Sezione "${sectionTitle}" rigenerata`);
      setOpen(false);
      setInstruction('');
      onRegenerated();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsRegenerating(false);
    }
  }, [caseId, sectionId, sectionTitle, instruction, onRegenerated]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={disabled || isRegenerating}
          title={`Rigenera "${sectionTitle}"`}
        >
          {isRegenerating ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Rigenera Sezione
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
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
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Rigenerazione...</>
            ) : (
              <><RefreshCw className="mr-1 h-3 w-3" />Rigenera sezione</>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
