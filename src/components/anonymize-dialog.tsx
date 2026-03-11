'use client';

import { useState, useCallback, useTransition } from 'react';
import { Loader2, Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { anonymizeReport } from '@/app/(dashboard)/anonymize-actions';

interface AnonymizeDialogProps {
  caseId: string;
}

export function AnonymizeDialog({ caseId }: AnonymizeDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [anonymizedText, setAnonymizedText] = useState<string | null>(null);
  const [replacementCount, setReplacementCount] = useState<number>(0);

  const handleOpen = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Fetch anonymized text when dialog opens
      startTransition(async () => {
        const result = await anonymizeReport(caseId);
        if (!result.success || !result.anonymizedText) {
          toast.error(result.error ?? 'Errore durante l\'anonimizzazione');
          setOpen(false);
          return;
        }
        setAnonymizedText(result.anonymizedText);
        setReplacementCount(result.replacementCount ?? 0);
      });
    } else {
      // Reset state when dialog closes
      setAnonymizedText(null);
      setReplacementCount(0);
    }
  }, [caseId]);

  const handleDownload = useCallback(() => {
    if (!anonymizedText) return;

    const blob = new Blob([anonymizedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-anonimizzato-${caseId.slice(0, 8)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Report anonimizzato scaricato');
  }, [anonymizedText, caseId]);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
          Anonimizza
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Anteprima Report Anonimizzato</DialogTitle>
          <DialogDescription>
            I dati personali identificabili sono stati sostituiti con segnaposto.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Anonimizzazione in corso...</span>
          </div>
        ) : anonymizedText ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">
                {replacementCount} {replacementCount === 1 ? 'sostituzione' : 'sostituzioni'} effettuata{replacementCount === 1 ? '' : 'e'}
              </Badge>
            </div>
            <div className="flex-1 overflow-auto rounded-md border bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                {anonymizedText}
              </pre>
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button
            onClick={handleDownload}
            disabled={!anonymizedText || isPending}
          >
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            Scarica .txt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
