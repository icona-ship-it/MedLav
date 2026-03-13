'use client';

import { useState, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2, Download, Pencil, X, Save, Printer, GitCompare, ShieldCheck, FileCode, ChevronDown, AlertTriangle } from 'lucide-react';
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
const VersionCompare = dynamic(
  () => import('@/components/version-compare').then((m) => ({ default: m.VersionCompare })),
  { loading: () => null },
);
import { SectionRegenerateButton } from '@/components/section-regenerate-button';
import { ReportRating } from '@/components/report-rating';
import { LinkedReportViewer } from '@/components/linked-report-viewer';
import { parseSections } from '@/lib/section-parser-client';
import { QualityGateDialog } from './quality-gate-dialog';
import type { ReportRow, EventRow, AnomalyRow, MissingDocRow, Document } from './types';

// --- Truncation Detection ---

function isTruncated(synthesis: string): boolean {
  const trimmed = synthesis.trim();
  if (trimmed.length === 0) return false;

  // Check if report has a conclusions section
  const hasConclusioni = /conclusioni|considerazioni\s+finali|in\s+definitiva/i.test(trimmed);
  if (hasConclusioni) return false;

  // Get last meaningful line (skip empty lines)
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  const lastLine = lines[lines.length - 1].trim();

  // Headings, list items, and lines ending with punctuation are valid endings
  if (/^#{1,6}\s/.test(lastLine)) return false;
  const lastChar = lastLine[lastLine.length - 1];
  return !['.', ')', '"', '»', '*', '-', ':', ';', '|', '%', '!'].includes(lastChar);
}

// --- Report Status Buttons ---

function ReportStatusButtons({
  caseId, report, anomalyCount, missingDocsCount, onChanged,
}: {
  caseId: string;
  report: ReportRow;
  anomalyCount: number;
  missingDocsCount: number;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [qualityGateOpen, setQualityGateOpen] = useState(false);
  // Treat legacy "in_revisione" as "bozza"
  const effectiveStatus = report.report_status === 'in_revisione' ? 'bozza' : report.report_status;

  const handleStatusChange = (newStatus: string) => {
    startTransition(async () => {
      await updateReportStatus({ caseId, reportId: report.id, newStatus });
      onChanged();
    });
  };

  return (
    <div className="flex items-center gap-1">
      {effectiveStatus === 'bozza' && (
        <>
          <Button size="sm" onClick={() => setQualityGateOpen(true)} disabled={isPending}>
            {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Approva come Definitivo
          </Button>
          <QualityGateDialog
            open={qualityGateOpen}
            onOpenChange={setQualityGateOpen}
            anomalyCount={anomalyCount}
            missingDocsCount={missingDocsCount}
            onConfirm={() => handleStatusChange('definitivo')}
          />
        </>
      )}
      {effectiveStatus === 'definitivo' && (
        <>
          <Badge variant="success">Definitivo</Badge>
          <Button variant="outline" size="sm" onClick={() => handleStatusChange('bozza')} disabled={isPending}>
            {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Riporta a Bozza
          </Button>
        </>
      )}
    </div>
  );
}

// --- Section-based Report Viewer ---

function SectionedReportView({
  caseId,
  synthesis,
  regeneratingSection,
  onRegenerated,
  events,
  onEventClick,
  lastRegeneratedSection,
}: {
  caseId: string;
  synthesis: string;
  regeneratingSection: string | null;
  onRegenerated: () => void;
  events?: EventRow[];
  onEventClick?: (orderNumber: number) => void;
  lastRegeneratedSection?: string | null;
}) {
  const sections = parseSections(synthesis);
  const eventRefs = events?.map((e) => ({
    orderNumber: e.order_number,
    title: e.title,
    eventDate: e.event_date,
  }));

  return (
    <div className="space-y-6">
      {/* Mini-TOC */}
      {sections.length > 2 && (
        <nav className="flex flex-wrap gap-1.5 pb-2 border-b" aria-label="Indice sezioni report">
          {sections.filter((s) => s.id !== 'preamble').map((section) => (
            <button
              key={section.id}
              type="button"
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              onClick={() => {
                document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {section.title}
            </button>
          ))}
        </nav>
      )}
      {sections.map((section) => (
        <div
          key={section.id}
          id={`section-${section.id}`}
          className={`group rounded-md ${lastRegeneratedSection === section.id ? 'animate-highlight-flash' : ''}`}
        >
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

// --- Compact Warning Bar ---

function CompactWarningBar({
  anomalies,
  missingDocs,
  onSwitchToAnomalies,
}: {
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  onSwitchToAnomalies?: () => void;
}) {
  const highSeverity = anomalies.filter((a) => a.severity === 'critica' || a.severity === 'alta');

  if (highSeverity.length === 0 && missingDocs.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm dark:border-orange-700 dark:bg-orange-950/30">
      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
      <div className="flex flex-1 items-center gap-2 flex-wrap">
        {highSeverity.length > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {highSeverity.length} {highSeverity.length === 1 ? 'anomalia' : 'anomalie'}
          </Badge>
        )}
        {missingDocs.length > 0 && (
          <Badge variant="warning" className="text-[10px]">
            {missingDocs.length} doc. {missingDocs.length === 1 ? 'mancante' : 'mancanti'}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">da verificare</span>
      </div>
      {onSwitchToAnomalies && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs shrink-0"
          onClick={onSwitchToAnomalies}
        >
          Vedi dettagli
        </Button>
      )}
    </div>
  );
}

// --- Incomplete Data Warning ---

function IncompleteDataWarning({ documents, events }: { documents: Document[]; events?: EventRow[] }) {
  const docIds = new Set(events?.map((e) => e.document_id).filter(Boolean) ?? []);
  const completedWithoutEvents = documents.filter(
    (d) => d.processing_status === 'completato' && !docIds.has(d.id),
  );
  if (completedWithoutEvents.length === 0) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Report basato su dati incompleti</p>
        <p className="mt-0.5">
          {completedWithoutEvents.length} {completedWithoutEvents.length === 1 ? 'documento non ha prodotto' : 'documenti non hanno prodotto'} eventi:{' '}
          {completedWithoutEvents.map((d) => d.file_name).join(', ')}
        </p>
      </div>
    </div>
  );
}

// --- Report Tab ---

export function ReportTab({
  caseId, report, isRegenerating, onRegenerate, events, onEventClick,
  anomalyCount = 0, missingDocsCount = 0,
  anomalies, missingDocs, documents, onSwitchToAnomalies,
}: {
  caseId: string;
  report: ReportRow | null;
  isRegenerating: boolean;
  onRegenerate: () => void;
  events?: EventRow[];
  onEventClick?: (orderNumber: number) => void;
  anomalyCount?: number;
  missingDocsCount?: number;
  anomalies?: AnomalyRow[];
  missingDocs?: MissingDocRow[];
  documents?: Document[];
  onSwitchToAnomalies?: () => void;
}) {
  const router = useRouter();
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [editedSynthesis, setEditedSynthesis] = useState('');
  const [isSavingSynthesis, startSaveSynthesis] = useTransition();
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [lastRegeneratedSection, setLastRegeneratedSection] = useState<string | null>(null);

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

  const handleSectionRegenerated = useCallback((sectionId?: string) => {
    setRegeneratingSection(null);
    if (sectionId) {
      setLastRegeneratedSection(sectionId);
      // Clear highlight after animation
      setTimeout(() => setLastRegeneratedSection(null), 2000);
    }
    router.refresh();
  }, [router]);

  return (
    <Card>
      <CardHeader className="sticky top-[72px] z-10 bg-card border-b">
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
                      anomalyCount={anomalyCount}
                      missingDocsCount={missingDocsCount}
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
        {!isEditingReport && report?.synthesis && isTruncated(report.synthesis) && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Il report potrebbe essere stato troncato. Prova a rigenerarlo per ottenere una versione completa.</span>
          </div>
        )}
        {!isEditingReport && report?.synthesis && (anomalies || missingDocs) && (
          <CompactWarningBar
            anomalies={anomalies ?? []}
            missingDocs={missingDocs ?? []}
            onSwitchToAnomalies={onSwitchToAnomalies}
          />
        )}
        {!isEditingReport && report?.synthesis && documents && (
          <IncompleteDataWarning documents={documents} events={events} />
        )}
        {isEditingReport ? (
          <div className="space-y-2">
            <Tabs defaultValue="edit" className="w-full">
              <TabsList>
                <TabsTrigger value="edit">Modifica</TabsTrigger>
                <TabsTrigger value="preview">Anteprima</TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <Textarea
                  className="min-h-[400px] font-mono text-sm"
                  value={editedSynthesis}
                  onChange={(e) => setEditedSynthesis(e.target.value)}
                  autoFocus
                />
              </TabsContent>
              <TabsContent value="preview">
                <div className="min-h-[400px] rounded-md border p-4">
                  <MarkdownPreview content={editedSynthesis} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : report?.synthesis ? (
          <SectionedReportView
            caseId={caseId}
            synthesis={report.synthesis}
            regeneratingSection={regeneratingSection}
            onRegenerated={handleSectionRegenerated}
            events={events}
            onEventClick={onEventClick}
            lastRegeneratedSection={lastRegeneratedSection}
          />
        ) : (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {events && events.length > 0
                ? 'Il report non è ancora stato generato, ma gli eventi sono già disponibili nella tab Timeline.'
                : 'Nessuna sintesi generata. Avvia l\'elaborazione dei documenti.'}
            </p>
            {events && events.length > 0 && (
              <Button variant="outline" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
                {isRegenerating
                  ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Generazione...</>
                  : 'Genera Report'}
              </Button>
            )}
          </div>
        )}
        {!isEditingReport && report?.synthesis && report.report_status === 'definitivo' && (
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
