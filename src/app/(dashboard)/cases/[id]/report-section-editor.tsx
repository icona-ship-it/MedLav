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
import { updateReportSection } from '../../actions';

interface ReportSectionEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  reportId: string;
  sectionId: string;
  sectionCanonicalId?: string;
  sectionTitle: string;
  sectionContent: string;
  reportUpdatedAt?: string;
  onSaved: () => void;
}

export function ReportSectionEditor({
  open, onOpenChange, caseId, reportId,
  sectionId, sectionCanonicalId, sectionTitle, sectionContent, reportUpdatedAt, onSaved,
}: ReportSectionEditorProps) {
  const router = useRouter();
  const [editedContent, setEditedContent] = useState('');
  const [isSaving, startSave] = useTransition();

  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setEditedContent(sectionContent);
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setEditedContent('');
    }
    onOpenChange(isOpen);
  };

  const handleSave = useCallback(() => {
    startSave(async () => {
      const result = await updateReportSection({
        caseId,
        reportId,
        sectionId,
        sectionCanonicalId,
        sectionContent: editedContent,
        expectedUpdatedAt: reportUpdatedAt,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Sezione "${sectionTitle}" aggiornata`);
      onOpenChange(false);
      setEditedContent('');
      onSaved();
      router.refresh();
    });
  }, [caseId, reportId, sectionId, sectionCanonicalId, sectionTitle, editedContent, reportUpdatedAt, router, onOpenChange, onSaved]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">
              Modifica: {sectionTitle}
            </DialogTitle>
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
                Salva sezione
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <RichTextEditor
            content={editedContent}
            onChange={setEditedContent}
            caseId={caseId}
            className="h-full"
            allowedHeadingLevels={[3]}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
