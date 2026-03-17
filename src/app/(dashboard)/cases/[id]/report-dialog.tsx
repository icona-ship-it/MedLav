'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/rich-text-editor';
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

  // Sync content when dialog opens — React 19 "adjusting state based on props" pattern.
  // Uses useState (not useRef) to track the previous open value during render,
  // so RichTextEditor receives the report content on its first render.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setEditedSynthesis(report?.synthesis ?? '');
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  const handleOpenChange = (isOpen: boolean) => {
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
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">Modifica Report</DialogTitle>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
              >
                <X className="mr-1.5 h-4 w-4" />
                Annulla
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-green-600 hover:bg-green-700 text-white px-6 shadow-sm"
              >
                {isSaving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Salva modifiche
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <RichTextEditor
            content={editedSynthesis}
            onChange={setEditedSynthesis}
            caseId={caseId}
            className="h-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
