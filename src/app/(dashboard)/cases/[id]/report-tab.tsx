'use client';

import { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Download, Pencil, X, Save, Printer, GitCompare } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { updateReportStatus, updateReportSynthesis, getCaseReportVersions } from '../../actions';
import { MarkdownPreview } from '@/components/markdown-preview';
import { VersionCompare } from '@/components/version-compare';
import type { ReportRow } from './types';

// --- Report Status Buttons ---

function ReportStatusButtons({
  caseId, report, onChanged,
}: {
  caseId: string;
  report: ReportRow;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const currentStatus = report.report_status;

  const handleStatusChange = (newStatus: string) => {
    startTransition(async () => {
      await updateReportStatus({ caseId, reportId: report.id, newStatus });
      onChanged();
    });
  };

  return (
    <div className="flex items-center gap-1">
      {currentStatus === 'bozza' && (
        <Button variant="outline" size="sm" onClick={() => handleStatusChange('in_revisione')} disabled={isPending}>
          In Revisione
        </Button>
      )}
      {currentStatus === 'in_revisione' && (
        <>
          <Button variant="outline" size="sm" onClick={() => handleStatusChange('bozza')} disabled={isPending}>
            Bozza
          </Button>
          <Button size="sm" onClick={() => handleStatusChange('definitivo')} disabled={isPending}>
            Definitivo
          </Button>
        </>
      )}
      {currentStatus === 'definitivo' && (
        <Badge variant="success">Definitivo</Badge>
      )}
    </div>
  );
}

// --- Report Tab ---

export function ReportTab({
  caseId, report, isRegenerating, onRegenerate,
}: {
  caseId: string;
  report: ReportRow | null;
  isRegenerating: boolean;
  onRegenerate: () => void;
}) {
  const router = useRouter();
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [editedSynthesis, setEditedSynthesis] = useState('');
  const [isSavingSynthesis, startSaveSynthesis] = useTransition();

  // Version compare state
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [versions, setVersions] = useState<ReportRow[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const handleStartEdit = useCallback(() => {
    setEditedSynthesis(report?.synthesis ?? '');
    setIsEditingReport(true);
  }, [report]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingReport(false);
    setEditedSynthesis('');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!report) return;
    startSaveSynthesis(async () => {
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
      setIsEditingReport(false);
      router.refresh();
    });
  }, [caseId, report, editedSynthesis, router]);

  const handlePdfExport = useCallback(() => {
    const printWindow = window.open(`/api/cases/${caseId}/export/html`, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  }, [caseId]);

  const handleToggleVersions = useCallback(async () => {
    if (showVersionCompare) {
      setShowVersionCompare(false);
      return;
    }
    setIsLoadingVersions(true);
    try {
      const result = await getCaseReportVersions(caseId);
      setVersions(result);
      setShowVersionCompare(true);
    } catch {
      toast.error('Errore caricamento versioni');
    } finally {
      setIsLoadingVersions(false);
    }
  }, [caseId, showVersionCompare]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>Report Medico-Legale</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {report && (
              <>
                <Badge variant="secondary">v{report.version}</Badge>
                {!isEditingReport && (
                  <Button variant="outline" size="sm" onClick={handleStartEdit}>
                    <Pencil className="mr-1 h-3 w-3" />Modifica
                  </Button>
                )}
                {isEditingReport && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSavingSynthesis}>
                      <X className="mr-1 h-3 w-3" />Annulla
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={isSavingSynthesis}>
                      {isSavingSynthesis ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                      Salva
                    </Button>
                  </>
                )}
                {!isEditingReport && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      disabled={isRegenerating}
                    >
                      {isRegenerating
                        ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Rigenerazione...</>
                        : 'Rigenera Report'
                      }
                    </Button>
                    <ReportStatusButtons
                      caseId={caseId}
                      report={report}
                      onChanged={() => router.refresh()}
                    />
                  </>
                )}
                {report.version > 1 && !isEditingReport && (
                  <Button variant="outline" size="sm" onClick={handleToggleVersions} disabled={isLoadingVersions}>
                    {isLoadingVersions ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <GitCompare className="mr-1 h-3 w-3" />}
                    Confronta versioni
                  </Button>
                )}
              </>
            )}
            {/* Export buttons */}
            <Button variant="outline" size="sm" onClick={handlePdfExport}>
              <Printer className="mr-1 h-3 w-3" aria-hidden="true" />PDF
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/cases/${caseId}/export/html`} download aria-label="Esporta in formato HTML">
                <Download className="mr-1 h-3 w-3" aria-hidden="true" />HTML
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/cases/${caseId}/export/csv`} download aria-label="Esporta in formato CSV">
                <Download className="mr-1 h-3 w-3" aria-hidden="true" />CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/cases/${caseId}/export/docx`} download aria-label="Esporta in formato DOCX">
                <Download className="mr-1 h-3 w-3" aria-hidden="true" />DOCX
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEditingReport ? (
          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">Modifica</TabsTrigger>
              <TabsTrigger value="preview">Anteprima</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <Textarea
                className="min-h-[400px] font-mono text-sm"
                value={editedSynthesis}
                onChange={(e) => setEditedSynthesis(e.target.value)}
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-[400px] rounded-md border p-4">
                <MarkdownPreview content={editedSynthesis} />
              </div>
            </TabsContent>
          </Tabs>
        ) : report?.synthesis ? (
          <MarkdownPreview content={report.synthesis} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessuna sintesi generata. Avvia l&apos;elaborazione dei documenti.
          </p>
        )}
        {showVersionCompare && versions.length > 1 && report && (
          <div className="mt-6 border-t pt-6">
            <VersionCompare currentReport={report} versions={versions} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
