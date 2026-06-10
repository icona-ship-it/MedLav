'use client';

import { useState, useCallback, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/rich-text-editor';
import { saveDraft, getDraft, clearDraft, isDraftFromOtherTab } from '@/lib/draft-storage';
import { updateReportSynthesis } from '../../actions';
import type { ReportRow } from './types';

const AUTOSAVE_INTERVAL_MS = 30_000;

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
  const [draftBanner, setDraftBanner] = useState<{ content: string; savedAt: string } | null>(null);
  const editedRef = useRef(editedSynthesis);

  // Keep ref in sync with state (outside render)
  useEffect(() => {
    editedRef.current = editedSynthesis;
  }, [editedSynthesis]);

  // Sync content when dialog opens + check for draft recovery
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    const dbContent = report?.synthesis ?? '';
    setEditedSynthesis(dbContent);

    // Check for draft newer than DB
    const draft = getDraft(caseId);
    if (draft && draft.content !== dbContent) {
      setDraftBanner({ content: draft.content, savedAt: draft.savedAt });
    } else {
      setDraftBanner(null);
    }
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  // Autosave every 30 seconds while dialog is open
  const dbContentRef = useRef(report?.synthesis ?? '');
  useEffect(() => {
    dbContentRef.current = report?.synthesis ?? '';
  }, [report?.synthesis]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      const current = editedRef.current;
      if (current && current !== dbContentRef.current) {
        saveDraft(caseId, current);
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [open, caseId]);

  // Detect cross-tab edits via storage event
  useEffect(() => {
    if (!open) return;
    const key = `legmed-draft-${caseId}`;
    const handler = (e: StorageEvent) => {
      if (e.key === key && e.newValue && isDraftFromOtherTab(caseId)) {
        toast.warning('Un\'altra scheda sta modificando questo report. Salva per evitare conflitti.');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [open, caseId]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Save draft on close without saving
      if (editedRef.current && editedRef.current !== (report?.synthesis ?? '')) {
        saveDraft(caseId, editedRef.current);
      }
      setEditedSynthesis('');
      setDraftBanner(null);
    }
    onOpenChange(isOpen);
  };

  const handleRestoreDraft = useCallback(() => {
    if (draftBanner) {
      setEditedSynthesis(draftBanner.content);
      setDraftBanner(null);
      toast.success('Bozza ripristinata');
    }
  }, [draftBanner]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft(caseId);
    setDraftBanner(null);
  }, [caseId]);

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
      clearDraft(caseId);
      toast.success('Report aggiornato');
      onOpenChange(false);
      setEditedSynthesis('');
      setDraftBanner(null);
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
                variant="approve"
                className="px-6 shadow-sm"
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

        {/* Draft recovery banner */}
        {draftBanner && (
          <div className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm flex-1">
              Hai modifiche non salvate del{' '}
              {new Date(draftBanner.savedAt).toLocaleString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              . Ripristinare?
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDiscardDraft}>
                Scarta
              </Button>
              <Button size="sm" onClick={handleRestoreDraft}>
                Ripristina
              </Button>
            </div>
          </div>
        )}

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
