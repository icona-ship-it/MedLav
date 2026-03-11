'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Download, Pencil, X, Save, Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { updateReportSynthesis } from '../../actions';
import type { CaseData, ReportRow } from './types';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseData: CaseData;
  report: ReportRow | null;
}

export function ReportDialog({
  open, onOpenChange, caseId, caseData, report,
}: ReportDialogProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editedSynthesis, setEditedSynthesis] = useState('');
  const [isSaving, startSave] = useTransition();

  const handleStartEdit = useCallback(() => {
    setEditedSynthesis(report?.synthesis ?? '');
    setIsEditing(true);
  }, [report]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedSynthesis('');
  }, []);

  const handleSaveEdit = useCallback(() => {
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
      setIsEditing(false);
      router.refresh();
    });
  }, [caseId, report, editedSynthesis, router]);

  const handlePdfExport = useCallback(() => {
    const printWindow = window.open(`/api/cases/${caseId}/export/html?inline=true`, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  }, [caseId]);

  const iframeSrc = `/api/cases/${caseId}/export/html?inline=true`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle>Report Completo &mdash; {caseData.code}</DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Pencil className="mr-1 h-3 w-3" />Modifica
                </Button>
              )}
              {isEditing && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
                    <X className="mr-1 h-3 w-3" />Annulla
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                    Salva
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={handlePdfExport}>
                <Printer className="mr-1 h-3 w-3" />PDF
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/cases/${caseId}/export/html`} download>
                  <Download className="mr-1 h-3 w-3" />HTML
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/cases/${caseId}/export/docx`} download>
                  <Download className="mr-1 h-3 w-3" />DOCX
                </a>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {isEditing ? (
            <Tabs defaultValue="edit" className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="edit">Modifica</TabsTrigger>
                <TabsTrigger value="preview">Anteprima</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="flex-1 min-h-0">
                <Textarea
                  className="h-full min-h-[60vh] font-mono text-sm resize-none"
                  value={editedSynthesis}
                  onChange={(e) => setEditedSynthesis(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="preview" className="flex-1 min-h-0">
                <iframe
                  src={iframeSrc}
                  className="w-full h-[70vh] rounded-md border"
                  title="Anteprima report"
                />
              </TabsContent>
            </Tabs>
          ) : (
            <iframe
              src={iframeSrc}
              className="w-full h-[75vh] rounded-md border"
              title="Report completo"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
