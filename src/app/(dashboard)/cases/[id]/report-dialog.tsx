'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownPreview } from '@/components/markdown-preview';
import { updateReportSynthesis } from '../../actions';
import type { ReportRow } from './types';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  report: ReportRow | null;
  onSaved: () => void;
}

export function ReportDialog({
  open, onOpenChange, caseId, report, onSaved,
}: ReportDialogProps) {
  const router = useRouter();
  const [editedSynthesis, setEditedSynthesis] = useState('');
  const [isSaving, startSave] = useTransition();
  // Initialize content when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && report?.synthesis) {
      setEditedSynthesis(report.synthesis);
    }
    if (!isOpen) {
      setEditedSynthesis('');
    }
    onOpenChange(isOpen);
  };

  const handleSave = useCallback(() => {
    if (!report) return;
    startSave(async () => {
      const result = await updateReportSynthesis({
        caseId,
        reportId: report.id,
        synthesis: editedSynthesis,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Report aggiornato');
      onOpenChange(false);
      setEditedSynthesis('');
      onSaved();
      router.refresh();
    });
  }, [caseId, report, editedSynthesis, router, onOpenChange, onSaved]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Modifica Report</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                <X className="mr-1 h-3 w-3" />
                Annulla
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Salva
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
          {/* Left: Editor */}
          <div className="flex flex-col min-h-0">
            <p className="text-xs font-medium text-muted-foreground mb-2">Modifica (Markdown)</p>
            <Textarea
              className="flex-1 min-h-[60vh] font-mono text-sm resize-none"
              value={editedSynthesis}
              onChange={(e) => setEditedSynthesis(e.target.value)}
              autoFocus
            />
          </div>

          {/* Right: Preview in A4 style */}
          <div className="flex flex-col min-h-0">
            <p className="text-xs font-medium text-muted-foreground mb-2">Anteprima</p>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-md border bg-muted/30">
              <div className="report-a4-page !shadow-none !rounded-none">
                <MarkdownPreview content={editedSynthesis} caseId={caseId} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
