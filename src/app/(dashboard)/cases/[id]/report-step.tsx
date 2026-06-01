'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2, Download, AlertTriangle } from 'lucide-react';
import { InlineAlert } from '@/components/ui/inline-alert';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { PubMedTab } from './pubmed-tab';
import type { PubMedReference } from './pubmed-tab';
import { csrfHeaders } from '@/lib/csrf-client';
import { parseSections } from '@/lib/section-parser-client';
import { getSectionStatus } from '@/lib/section-state';
import { computeStaleSections } from '@/lib/section-staleness';
import { EventsTab } from './events-tab';
import { RegeneratePanelDialog } from './regenerate-panel-dialog';
import { ReportA4Viewer } from './report-a4-viewer';
import { ReportTocSidebar } from './report-toc-sidebar';
import { QualitySidebar, computeAlertCount } from './quality-sidebar';
import { ReportActionBar } from './report-action-bar';
import type {
  Document, EventRow, AnomalyRow, MissingDocRow, ReportRow,
} from './types';
import type { DocumentPage } from '../../actions';

const OcrPreviewTab = dynamic(
  () => import('./ocr-preview-tab').then((m) => ({ default: m.OcrPreviewTab })),
  { loading: () => null },
);
const ReportDialog = dynamic(
  () => import('./report-dialog').then((m) => ({ default: m.ReportDialog })),
  { loading: () => null },
);
const AnomaliesSection = dynamic(
  () => import('./anomalies-section').then((m) => ({ default: m.AnomaliesSection })),
  { loading: () => null },
);

// --- Types ---

export interface GenerationProgress {
  currentSection: number;
  totalSections: number;
  currentSectionTitle: string;
}

export interface PipelineWarningItem {
  step: string;
  severity: 'warning' | 'critical';
  message: string;
  failedCount?: number;
  totalCount?: number;
  failedItems?: string[];
}

interface ReportStepProps {
  caseId: string;
  report: ReportRow | null;
  events: EventRow[];
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  documents: Document[];
  documentPages: DocumentPage[];
  eventImages: Record<string, string[]>;
  processingStage: string;
  onNavigateToStep: (step: number) => void;
  generationProgress?: GenerationProgress | null;
  pubmedReferences?: PubMedReference[];
  pipelineWarnings?: PipelineWarningItem[];
}

// --- Component ---

export function ReportStep({
  caseId,
  report,
  events,
  anomalies,
  missingDocs,
  documents,
  documentPages,
  eventImages,
  processingStage,
  // onNavigateToStep reserved for future use (e.g. "go back to documents" button)
  generationProgress,
  pubmedReferences = [],
  pipelineWarnings = [],
}: ReportStepProps) {
  const router = useRouter();

  // Dialog / sheet state
  const [qualitySheetOpen, setQualitySheetOpen] = useState(false);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [anomalyDialogOpen, setAnomalyDialogOpen] = useState(false);

  // UX Ondata 3-IA Fase A: drawer additivi (eventi/pubmed/ocr).
  // Per ora coesistono con i tab esistenti. La Fase B rimuovera' i tab.
  const [eventsDrawerOpen, setEventsDrawerOpen] = useState(false);
  const [pubmedDrawerOpen, setPubmedDrawerOpen] = useState(false);
  const [ocrDrawerOpen, setOcrDrawerOpen] = useState(false);

  // Track the EVENT TYPES the perito mutated since the report was generated.
  // Drives the staleness check (which sections may be out of date) and the
  // "scegli cosa rigenerare" panel.
  const [mutatedEventTypes, setMutatedEventTypes] = useState<Set<string>>(new Set());
  const [regeneratePanelOpen, setRegeneratePanelOpen] = useState(false);

  // Report interaction state
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [lastRegeneratedSection, setLastRegeneratedSection] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Version compare
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [versions, setVersions] = useState<ReportRow[]>([]);

  // Alert count for mobile badge
  const alertCount = report
    ? computeAlertCount(report, anomalies, missingDocs, documents, events)
    : 0;

  // UX refactor Ondata 2: anomalie actionable promosse a banner above-fold.
  // Conteggio separato perche' "actionable" = status detected|llm_confirmed (richiede decisione),
  // mentre alertCount include anche missing docs e altri segnali aggregati.
  const actionableAnomalies = anomalies.filter(
    (a) => a.status === 'detected' || a.status === 'llm_confirmed' || a.status == null,
  );
  const actionableCount = actionableAnomalies.length;
  const missingDocsCount = missingDocs.length;

  const sections = report?.synthesis ? parseSections(report.synthesis) : [];

  // Which sections may be out of date after the perito's event edits? Pure,
  // dependency-based. Deterministic/placeholder/locked sections are excluded.
  const staleForPanel = computeStaleSections(
    sections
      .filter((s) => s.id !== 'preamble' && s.id !== 'full_report')
      .map((s) => ({ canonicalId: s.canonicalId, status: getSectionStatus(report?.generation_metadata, s.canonicalId) })),
    mutatedEventTypes,
  ).map((st) => ({
    canonicalId: st.canonicalId,
    title: sections.find((s) => s.canonicalId === st.canonicalId)?.title ?? st.canonicalId,
    edited: st.edited,
  }));

  const handleSectionRegenerated = useCallback((sectionId?: string) => {
    setRegeneratingSection(null);
    if (sectionId) {
      setLastRegeneratedSection(sectionId);
      setTimeout(() => setLastRegeneratedSection(null), 2000);
    }
    router.refresh();
  }, [router]);

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/processing/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        toast.error(result.error ?? 'Errore rigenerazione');
      }
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsRegenerating(false);
    }
  }, [caseId, router]);

  const handleVersionsToggle = useCallback((loadedVersions: ReportRow[]) => {
    setVersions(loadedVersions);
    setShowVersionCompare(true);
  }, []);

  // --- No report yet ---
  if (!report) {
    if (processingStage === 'generazione_report') {
      const progressPct = generationProgress
        ? Math.round((generationProgress.currentSection / generationProgress.totalSections) * 100)
        : 0;
      return (
        <Card className="border-primary/30">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center space-y-2">
                {generationProgress ? (
                  <>
                    <p className="text-base font-semibold">
                      Preparazione report: sezione {generationProgress.currentSection} di {generationProgress.totalSections}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {generationProgress.currentSectionTitle}
                    </p>
                    <div className="mx-auto mt-3 w-64">
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-700"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{progressPct}%</p>
                    </div>
                  </>
                ) : (
                  <p className="text-base font-semibold">Preparazione report in corso...</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  Analisi in corso — stiamo preparando il tuo report.
                </p>
                <p className="mt-2 text-xs text-muted-foreground italic">
                  La pagina si aggiorna automaticamente al completamento.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Extraction-only case: no report but events available after completion
    if (events.length > 0 && processingStage === 'completato') {
      return (
        <div className="flex flex-col">
          {/* Warning banner for pipeline issues */}
          {pipelineWarnings.length > 0 && (
            <PipelineWarningsBanner warnings={pipelineWarnings} documents={documents} events={events} />
          )}

          {/* Export toolbar for timeline data */}
          <div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur-sm px-4 py-3 mb-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Analisi completata — {events.length} eventi trovati
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Esporta Cronistoria
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem asChild>
                    <a href={`/api/cases/${caseId}/export/docx`} download>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      <div>
                        <div>Esporta DOCX</div>
                        <p className="text-xs text-muted-foreground font-normal">Documento Word — per stampare o inviare</p>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/cases/${caseId}/export/html`} download>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      <div>
                        <div>Esporta HTML</div>
                        <p className="text-xs text-muted-foreground font-normal">Anteprima nel browser</p>
                      </div>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`/api/cases/${caseId}/export/csv`} download>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      <div>
                        <div>Esporta CSV</div>
                        <p className="text-xs text-muted-foreground font-normal">Tabella dati — per Excel</p>
                      </div>
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Events tab only — no report tab */}
          <EventsTab
            caseId={caseId}
            events={events}
            eventImages={eventImages}
            highlightedEventOrderNumber={highlightedEventId}
          />
        </div>
      );
    }

    // Processing completed but no events found (e.g. pipeline truncated by step limit)
    if (processingStage === 'completato') {
      return (
        <Card className="border-orange-300/50">
          <CardContent className="pt-6">
            <div className="py-8 text-center space-y-2">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                Elaborazione completata, ma nessun evento trovato.
              </p>
              <p className="text-xs text-muted-foreground">
                Prova a rielaborare il caso. Se il problema persiste, i documenti potrebbero non contenere dati clinici estraibili.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent className="pt-6">
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessun report disponibile. Carica i documenti e avvia l&apos;elaborazione.
          </p>
        </CardContent>
      </Card>
    );
  }

  // --- Report available ---
  return (
    <div className="flex flex-col">
      {/* Warning banner for pipeline issues */}
      {pipelineWarnings.length > 0 && (
        <PipelineWarningsBanner warnings={pipelineWarnings} documents={documents} events={events} />
      )}

      {/* Action bar - toolbar at top for immediate visibility */}
      <ReportActionBar
        caseId={caseId}
        report={report}
        anomalyCount={anomalies.length}
        missingDocsCount={missingDocsCount}
        isRegenerating={isRegenerating}
        onRegenerate={handleRegenerate}
        onEdit={() => setEditDialogOpen(true)}
        onVersionsToggle={handleVersionsToggle}
        alertCount={alertCount}
        onOpenQualitySheet={() => setQualitySheetOpen(true)}
        onOpenEventsDrawer={() => setEventsDrawerOpen(true)}
        onOpenPubmedDrawer={pubmedReferences.length > 0 ? () => setPubmedDrawerOpen(true) : undefined}
        onOpenOcrDrawer={() => setOcrDrawerOpen(true)}
        eventsCount={events.length}
        pubmedCount={pubmedReferences.reduce((s, r) => s + r.articles.length, 0)}
      />

      {/* UX Ondata 3-IA Fase B: vista SOLA del Report.
          Cronistoria / PubMed / OCR sono accessibili dai drawer in toolbar.
          Eliminati i Tabs concorrenti — il Report e' l'unico output principale,
          gli altri sono pannelli di supporto. */}

      {/* UX Ondata 2: banner above-fold per anomalie e doc mancanti. */}
      {(actionableCount > 0 || missingDocsCount > 0) && (
        <InlineAlert
          variant={actionableCount > 0 ? 'warning' : 'info'}
          title={
            actionableCount > 0 && missingDocsCount > 0
              ? `${actionableCount} anomalie cliniche da valutare · ${missingDocsCount} documenti attesi mancanti`
              : actionableCount > 0
                ? `${actionableCount} anomalie cliniche da valutare prima del deposito`
                : `${missingDocsCount} documenti attesi non caricati`
          }
          action={{
            label: 'Apri elenco',
            onClick: () => setAnomalyDialogOpen(true),
          }}
          className="mb-4"
        >
          {actionableCount > 0
            ? 'Conferma o escludi ciascuna anomalia prima di approvare il report.'
            : 'Carica i documenti mancanti o segnala l\'indisponibilità nel report.'}
        </InlineAlert>
      )}

      {/* Sync banner: the perito edited events → some narrative sections may be
          out of date. Facts (ITT/ITP, spese) auto-update and are NOT listed.
          The perito chooses what to regenerate (controllo a richiesta). */}
      {staleForPanel.length > 0 && (
        <InlineAlert
          variant="info"
          title={`Hai modificato degli eventi: ${staleForPanel.length} ${staleForPanel.length === 1 ? 'sezione potrebbe essere' : 'sezioni potrebbero essere'} da aggiornare.`}
          action={{
            label: 'Scegli cosa rigenerare',
            onClick: () => setRegeneratePanelOpen(true),
          }}
          onDismiss={() => setMutatedEventTypes(new Set())}
          className="mb-4"
        >
          Le tabelle dei fatti (ITT/ITP, spese) si aggiornano da sole. Per le sezioni descrittive, scegli quali rigenerare.
        </InlineAlert>
      )}

      <div className="flex gap-6">
        {/* Left: TOC sidebar (xl only) — naviga le sezioni del report */}
        <ReportTocSidebar sections={sections} />

        {/* Center: A4 viewer */}
        <div className="flex-1 min-w-0">
          <ReportA4Viewer
            caseId={caseId}
            report={report}
            events={events}
            onEventClick={(orderNumber) => {
              // UX Ondata 3-IA: click su [Ev.N] -> apre il drawer eventi
              // e highlighta l'evento, invece di switchare di tab.
              setHighlightedEventId(orderNumber);
              setEventsDrawerOpen(true);
            }}
            regeneratingSection={regeneratingSection}
            onSectionRegenerated={handleSectionRegenerated}
            lastRegeneratedSection={lastRegeneratedSection}
            showVersionCompare={showVersionCompare}
            versions={versions}
          />
        </div>

        {/* UX Ondata 3-IA Fase E: QualitySidebar destra rimossa.
            Le sue funzioni sono distribuite:
            - Anomalie e doc mancanti -> banner above-fold (gia' fatto)
            - OCR -> drawer attivato da toolbar
            - Eventi count -> badge sul bottone Eventi in toolbar
            - Metriche residue (qualita' OCR, copertura) -> ancora disponibili
              tramite il bottone "Qualita'" mobile (Sheet), per chi le cerca.
        */}
      </div>

      {/* Mobile: Quality sidebar as Sheet */}
      <Sheet open={qualitySheetOpen} onOpenChange={setQualitySheetOpen}>
        <SheetContent side="right" className="w-[340px] sm:w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Qualità Report</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <QualitySidebar
              report={report}
              events={events}
              anomalies={anomalies}
              missingDocs={missingDocs}
              documents={documents}
              documentPages={documentPages}
              onSwitchToAnomalies={() => {
                setQualitySheetOpen(false);
                setAnomalyDialogOpen(true);
              }}
              onOpenOcr={() => {
                setQualitySheetOpen(false);
                setOcrDialogOpen(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* OCR Dialog (Avanzate) */}
      <Dialog open={ocrDialogOpen} onOpenChange={setOcrDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Anteprima OCR</DialogTitle>
          </DialogHeader>
          <OcrPreviewTab
            caseId={caseId}
            documents={documents}
            documentPages={documentPages}
          />
        </DialogContent>
      </Dialog>

      {/* UX Ondata 3-IA Fase A: support panel drawers (additivi).
          Wrappa i tab esistenti in Sheet a destra, attivati da bottoni in toolbar. */}
      <Sheet open={eventsDrawerOpen} onOpenChange={setEventsDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pb-3 border-b">
            <SheetTitle>Eventi clinici</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <EventsTab
              caseId={caseId}
              events={events}
              eventImages={eventImages}
              highlightedEventOrderNumber={highlightedEventId}
              onEventMutated={(t) => setMutatedEventTypes((prev) => {
                const next = new Set(prev);
                next.add(t ?? 'altro');
                return next;
              })}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={pubmedDrawerOpen} onOpenChange={setPubmedDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pb-3 border-b">
            <SheetTitle>Riferimenti scientifici (PubMed)</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <PubMedTab references={pubmedReferences} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={ocrDrawerOpen} onOpenChange={setOcrDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="pb-3 border-b">
            <SheetTitle>Testo OCR originale</SheetTitle>
          </SheetHeader>
          <div className="py-4">
            <OcrPreviewTab
              caseId={caseId}
              documents={documents}
              documentPages={documentPages}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Dialog (fullscreen) */}
      <ReportDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        caseId={caseId}
        report={report}
        onSaved={() => router.refresh()}
      />

      {/* Anomaly Review Dialog */}
      <Dialog open={anomalyDialogOpen} onOpenChange={setAnomalyDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Anomalie e Documenti Mancanti</DialogTitle>
          </DialogHeader>
          <AnomaliesSection
            caseId={caseId}
            anomalies={anomalies}
            events={events}
            documents={documents}
            onChanged={() => router.refresh()}
          />
        </DialogContent>
      </Dialog>

      {/* "Scegli cosa rigenerare" — sezioni interessate dalle modifiche eventi */}
      {report && (
        <RegeneratePanelDialog
          open={regeneratePanelOpen}
          onOpenChange={setRegeneratePanelOpen}
          caseId={caseId}
          sections={staleForPanel}
          onDone={() => { setMutatedEventTypes(new Set()); router.refresh(); }}
        />
      )}
    </div>
  );
}

// --- Pipeline Warnings Banner ---

function PipelineWarningsBanner({
  warnings,
  documents,
  events,
}: {
  warnings: PipelineWarningItem[];
  documents: Document[];
  events: EventRow[];
}) {
  const [detailWarning, setDetailWarning] = useState<PipelineWarningItem | null>(null);

  const hasCritical = warnings.some((w) => w.severity === 'critical');
  const borderColor = hasCritical
    ? 'border-red-300 dark:border-red-800'
    : 'border-orange-300 dark:border-orange-800';
  const bgColor = hasCritical
    ? 'bg-red-50 dark:bg-red-950/20'
    : 'bg-orange-50 dark:bg-orange-950/20';
  const iconColor = hasCritical
    ? 'text-red-600 dark:text-red-400'
    : 'text-orange-600 dark:text-orange-400';
  const titleColor = hasCritical
    ? 'text-red-800 dark:text-red-300'
    : 'text-orange-800 dark:text-orange-300';

  return (
    <>
      <div className={`mb-4 rounded-lg border ${borderColor} ${bgColor} px-4 py-3`}>
        <div className="flex gap-3">
          <AlertTriangle className={`h-5 w-5 ${iconColor} shrink-0 mt-0.5`} />
          <div className="space-y-2 min-w-0 flex-1">
            <p className={`text-sm font-medium ${titleColor}`}>
              {warnings.length === 1 ? 'Problema durante l\'elaborazione' : `${warnings.length} problemi durante l'elaborazione`}
            </p>
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  <span className={w.severity === 'critical' ? 'font-medium text-red-700 dark:text-red-400' : ''}>
                    {w.message}
                  </span>
                  {w.failedItems && w.failedItems.length > 0 && (
                    <>
                      <span className="text-muted-foreground/70">
                        {' '}({w.failedItems.slice(0, 3).join(', ')}
                        {w.failedItems.length > 3 && ` +${w.failedItems.length - 3}`})
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetailWarning(w)}
                        className="ml-2 underline underline-offset-2 hover:text-foreground transition-colors"
                      >
                        Vedi dettagli
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Il risultato potrebbe essere incompleto. Prova a rielaborare il caso.
            </p>
          </div>
        </div>
      </div>

      <PipelineWarningDetailDialog
        warning={detailWarning}
        documents={documents}
        events={events}
        onClose={() => setDetailWarning(null)}
      />
    </>
  );
}

// --- Failed Documents Detail Dialog ---

function PipelineWarningDetailDialog({
  warning,
  documents,
  events,
  onClose,
}: {
  warning: PipelineWarningItem | null;
  documents: Document[];
  events: EventRow[];
  onClose: () => void;
}) {
  if (!warning?.failedItems || warning.failedItems.length === 0) return null;

  // Match each failed item (filename) to its Document record and count events.
  const failedDocs = warning.failedItems.map((fileName) => {
    const doc = documents.find((d) => d.file_name === fileName);
    const eventCount = doc ? events.filter((e) => e.document_id === doc.id).length : 0;
    return { fileName, doc, eventCount };
  });

  return (
    <Dialog open={warning !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dettaglio documenti</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <p className="text-sm text-muted-foreground">
            {warning.message}. Per ciascun documento qui sotto, trovi i dettagli e una possibile spiegazione del motivo per cui non sono stati individuati eventi clinici cronologici.
          </p>
          <div className="space-y-2">
            {failedDocs.map(({ fileName, doc, eventCount }, idx) => (
              <FailedDocumentRow
                key={idx}
                fileName={fileName}
                doc={doc}
                eventCount={eventCount}
              />
            ))}
          </div>
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 mt-4">
            <p className="text-xs text-blue-800 dark:text-blue-300 font-medium mb-1">Cosa fare</p>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Se uno di questi documenti contiene informazioni cliniche cronologiche importanti (date, esami, visite, terapie), prova a rielaborare il caso. Se il documento è uno scan di bassa qualità o contiene solo dati amministrativi, è normale che non produca eventi.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FailedDocumentRow({
  fileName,
  doc,
  eventCount,
}: {
  fileName: string;
  doc: Document | undefined;
  eventCount: number;
}) {
  const sizeLabel = doc?.file_size ? formatFileSize(doc.file_size) : null;
  const typeLabel = doc?.document_type
    ? (PIPELINE_DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type)
    : 'Tipo non classificato';

  // Build a non-technical explanation
  let reason: string;
  if (doc?.processing_error) {
    reason = `Errore di elaborazione: ${doc.processing_error}`;
  } else if (doc?.processing_status === 'failed') {
    reason = 'L\'elaborazione del documento non è andata a buon fine.';
  } else if (doc?.document_type === 'memoria_difensiva' || doc?.document_type === 'documento_amministrativo' || doc?.document_type === 'spese_mediche') {
    reason = 'Documento non clinico (es. memoria, atto amministrativo, spese): non sono attesi eventi cronologici.';
  } else if (doc?.document_type === 'altro' || !doc?.document_type) {
    reason = 'Documento non riconosciuto come clinico, oppure di natura non chiaramente cronologica.';
  } else {
    reason = 'Nessun evento cronologico è stato individuato. Possibili cause: scansione di bassa qualità, documento prevalentemente di immagini, o contenuto già coperto da altri documenti.';
  }

  return (
    <div className="rounded-md border bg-card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium break-all">{fileName}</p>
        {eventCount > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{eventCount} eventi</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Tipo: <span className="text-foreground">{typeLabel}</span></span>
        {sizeLabel && <span>Dimensione: <span className="text-foreground">{sizeLabel}</span></span>}
      </div>
      <p className="text-xs text-muted-foreground italic">{reason}</p>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PIPELINE_DOC_TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'Cartella clinica',
  referto_specialistico: 'Referto specialistico',
  esame_strumentale: 'Esame strumentale',
  esame_laboratorio: 'Esame di laboratorio',
  lettera_dimissione: 'Lettera di dimissione',
  certificato: 'Certificato medico',
  spese_mediche: 'Spese mediche',
  perizia_precedente: 'Perizia precedente',
  perizia_ctp: 'Perizia CTP',
  perizia_ctu: 'Perizia CTU',
  memoria_difensiva: 'Memoria difensiva',
  documento_amministrativo: 'Documento amministrativo',
  altro: 'Altro / non classificato',
  misto: 'Documento misto',
};
