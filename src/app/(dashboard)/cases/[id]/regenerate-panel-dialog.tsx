'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { csrfHeaders } from '@/lib/csrf-client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface RegenerablePanelSection {
  canonicalId: string;
  title: string;
  /** Has manual edits → regenerating overwrites them (needs force + warning). */
  edited: boolean;
}

interface RegeneratePanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  /** Sections flagged as possibly out of date by the staleness check. */
  sections: RegenerablePanelSection[];
  /** Called after a successful run (clears the mutated-events banner + refresh). */
  onDone: () => void;
}

/**
 * "Scegli cosa rigenerare": lists the sections affected by the perito's event
 * edits, pre-selected. Edited sections are flagged (regenerating overwrites the
 * manual text). Runs the per-section regeneration sequentially with explicit
 * confirmation (the panel itself is the confirmation → force).
 */
export function RegeneratePanelDialog({
  open, onOpenChange, caseId, sections, onDone,
}: RegeneratePanelDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // Pre-select all affected sections each time the dialog opens.
  useEffect(() => {
    if (open) setSelected(new Set(sections.map((s) => s.canonicalId)));
  }, [open, sections]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleRun = useCallback(async () => {
    const targets = sections.filter((s) => selected.has(s.canonicalId));
    if (targets.length === 0) return;
    setIsRunning(true);
    let ok = 0;
    try {
      // Sequential: each regeneration builds on the previous version (avoids
      // races on the report version). force:true — the perito chose these
      // explicitly in the panel (the panel is the confirmation).
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        setProgress(`Rigenerazione ${i + 1}/${targets.length}: ${target.title}`);
        const response = await fetch('/api/processing/regenerate-section', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ caseId, sectionId: target.canonicalId, force: true }),
        });
        const json = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
        if (!response.ok || !json?.success) {
          toast.error(`"${target.title}": ${json?.error ?? 'errore'}`);
          break;
        }
        ok += 1;
      }
      if (ok > 0) {
        toast.success(`${ok} ${ok === 1 ? 'sezione rigenerata' : 'sezioni rigenerate'}.`);
        onOpenChange(false);
        onDone();
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [caseId, sections, selected, onOpenChange, onDone]);

  const anyEditedSelected = sections.some((s) => s.edited && selected.has(s.canonicalId));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isRunning) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiorna le sezioni interessate</DialogTitle>
          <DialogDescription>
            Hai modificato degli eventi. Queste sezioni potrebbero non riflettere più i dati.
            Scegli quali rigenerare. I fatti (tabelle ITT/ITP e spese) si aggiornano da soli e non sono qui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto py-1">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna sezione da aggiornare.</p>
          ) : (
            sections.map((s) => (
              <label
                key={s.canonicalId}
                className="flex items-start gap-3 rounded-md border border-border/60 p-3 text-sm cursor-pointer hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={selected.has(s.canonicalId)}
                  onChange={() => toggle(s.canonicalId)}
                  disabled={isRunning}
                />
                <span className="flex-1">
                  <span className="font-medium">{s.title}</span>
                  {s.edited && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Modificata a mano — rigenerarla sovrascriverà il tuo testo.
                    </span>
                  )}
                </span>
                {s.edited && <Badge variant="info">Modificata</Badge>}
              </label>
            ))
          )}
        </div>

        {anyEditedSelected && (
          <p className="flex items-center gap-2 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Alcune sezioni selezionate hanno modifiche manuali che verranno sovrascritte.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isRunning}>
            Annulla
          </Button>
          <Button onClick={handleRun} disabled={isRunning || selected.size === 0}>
            {isRunning
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{progress ?? 'Rigenerazione…'}</>
              : <><RefreshCw className="mr-1.5 h-4 w-4" />Rigenera selezionate ({selected.size})</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
