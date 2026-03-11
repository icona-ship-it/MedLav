'use client';

import { useState, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Download, Pencil, X, Save, Printer, GitCompare, ShieldCheck, FileCode, ChevronDown } from 'lucide-react';
import { AnonymizeDialog } from '@/components/anonymize-dialog';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { updateReportStatus, updateReportSynthesis, getCaseReportVersions } from '../../actions';
import { MarkdownPreview } from '@/components/markdown-preview';
import { VersionCompare } from '@/components/version-compare';
import { SectionRegenerateButton } from '@/components/section-regenerate-button';
import { ReportRating } from '@/components/report-rating';
import { LinkedReportViewer } from '@/components/linked-report-viewer';
import { parseSections } from '@/lib/section-parser-client';
import type { ReportRow, EventRow } from './types';

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

// --- Section-based Report Viewer ---

function SectionedReportView({
  caseId,
  synthesis,
  regeneratingSection,
  onRegenerateStart,
  onRegenerated,
  events,
  onEventClick,
}: {
  caseId: string;
  synthesis: string;
  regeneratingSection: string | null;
  onRegenerateStart: (sectionId: string) => void;
  onRegenerated: () => void;
  events?: EventRow[];
  onEventClick?: (orderNumber: number) => void;
}) {
  const sections = parseSections(synthesis);
  const eventRefs = events?.map((e) => ({
    orderNumber: e.order_number,
    title: e.title,
    eventDate: e.event_date,
  }));

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.id} className="group">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">{section.title}</h3>
            {section.id !== 'preamble' && section.id !== 'full_report' && (
              <SectionRegenerateButton
                caseId={caseId}
                sectionId={section.id}
                sectionTitle={section.title}
                disabled={regeneratingSection !== null}
                onRegenerated={onRegenerated}
              />
            )}
          </div>
          {eventRefs && eventRefs.length > 0 ? (
            <LinkedReportViewer
              content={section.content}
              events={eventRefs}
              onEventClick={onEventClick}
            />
          ) : (
            <MarkdownPreview content={section.content} />
          )}
        </div>
      ))}
    </div>
  );
}

// --- Report Tab ---

export function ReportTab({
  caseId, report, isRegenerating, onRegenerate, events, onEventClick,
}: {
  caseId: string;
  report: ReportRow | null;
  isRegenerating: boolean;
  onRegenerate: () => void;
  events?: EventRow[];
  onEventClick?: (orderNumber: number) => void;
}) {
  const router = useRouter();
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [editedSynthesis, setEditedSynthesis] = useState('');
  const [isSavingSynthesis, startSaveSynthesis] = useTransition();
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);

  // Rating state
  const [existingRating, setExistingRating] = useState<number | null>(null);
  const [existingComment, setExistingComment] = useState<string | null>(null);

  useEffect(() => {
    if (!report?.id) return;
    fetch(`/api/report-ratings?reportId=${report.id}`)
      .then((r) => r.json())
      .then((result: { success: boolean; data?: { rating: number; comment: string | null } | null }) => {
        if (result.success && result.data) {
          setExistingRating(result.data.rating);
          setExistingComment(result.data.comment);
        }
      })
      .catch(() => { /* ignore */ });
  }, [report?.id]);

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

  const handleSectionRegenerated = useCallback(() => {
    setRegeneratingSection(null);
    router.refresh();
  }, [router]);

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
            {/* Export dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-3 w-3" aria-hidden="true" />
                  Esporta Report
                  <ChevronDown className="ml-1 h-3 w-3" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-2">
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" className="justify-start" asChild>
                    <a href={`/api/cases/${caseId}/export/html`} download aria-label="Esporta in formato HTML">
                      <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Esporta HTML
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start" asChild>
                    <a href={`/api/cases/${caseId}/export/docx`} download aria-label="Esporta in formato DOCX">
                      <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Esporta DOCX
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start" asChild>
                    <a href={`/api/cases/${caseId}/export/csv`} download aria-label="Esporta in formato CSV">
                      <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Esporta CSV
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start" asChild>
                    <a href={`/api/cases/${caseId}/export/pct`} download aria-label="Esporta in formato PCT XML">
                      <FileCode className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Esporta PCT
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start" onClick={handlePdfExport}>
                    <Printer className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Stampa PDF
                  </Button>
                  <div className="my-1 h-px bg-border" />
                  <Button variant="ghost" size="sm" className="justify-start" asChild>
                    <a href={`/api/cases/${caseId}/export/html?anonymize=true`} download aria-label="Esporta HTML anonimizzato">
                      <ShieldCheck className="mr-2 h-3.5 w-3.5" aria-hidden="true" />Anonimizza
                    </a>
                  </Button>
                  <AnonymizeDialog caseId={caseId} />
                </div>
              </PopoverContent>
            </Popover>
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
          <SectionedReportView
            caseId={caseId}
            synthesis={report.synthesis}
            regeneratingSection={regeneratingSection}
            onRegenerateStart={setRegeneratingSection}
            onRegenerated={handleSectionRegenerated}
            events={events}
            onEventClick={onEventClick}
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessuna sintesi generata. Avvia l&apos;elaborazione dei documenti.
          </p>
        )}
        {!isEditingReport && report?.synthesis && report.report_status !== 'bozza' && (
          <ReportRating
            reportId={report.id}
            existingRating={existingRating}
            existingComment={existingComment}
            onRated={() => router.refresh()}
          />
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
