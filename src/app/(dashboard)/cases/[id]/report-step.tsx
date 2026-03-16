'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { csrfHeaders } from '@/lib/csrf-client';
import { parseSections } from '@/lib/section-parser-client';
import { EventsTab } from './events-tab';
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

// --- Types ---

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
  onNavigateToStep,
}: ReportStepProps) {
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('report');

  // Dialog / sheet state
  const [qualitySheetOpen, setQualitySheetOpen] = useState(false);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

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

  const sections = report?.synthesis ? parseSections(report.synthesis) : [];

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
      return (
        <Card className="border-primary/30">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-base font-semibold">Generazione report in corso...</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  L&apos;AI sta analizzando {events.length} eventi e generando il report medico-legale.
                </p>
                <p className="mt-2 text-xs text-muted-foreground italic">
                  Questa operazione richiede 1-3 minuti. La pagina si aggiorna automaticamente.
                </p>
              </div>
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
      {/* Tabs: Report + Timeline */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({events.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="report">
          <div className="flex gap-6">
            {/* Left: TOC sidebar (xl only) */}
            <ReportTocSidebar sections={sections} />

            {/* Center: A4 viewer */}
            <div className="flex-1 min-w-0">
              <ReportA4Viewer
                caseId={caseId}
                report={report}
                events={events}
                onEventClick={(orderNumber) => {
                  setHighlightedEventId(orderNumber);
                  setActiveTab('timeline');
                }}
                regeneratingSection={regeneratingSection}
                onSectionRegenerated={handleSectionRegenerated}
                lastRegeneratedSection={lastRegeneratedSection}
                showVersionCompare={showVersionCompare}
                versions={versions}
              />
            </div>

            {/* Right: Quality sidebar (lg+ only) */}
            <div className="w-80 shrink-0 hidden lg:block">
              <div className="sticky top-[140px]">
                <QualitySidebar
                  report={report}
                  events={events}
                  anomalies={anomalies}
                  missingDocs={missingDocs}
                  documents={documents}
                  documentPages={documentPages}
                  onSwitchToAnomalies={() => onNavigateToStep(4)}
                  onOpenOcr={() => setOcrDialogOpen(true)}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <EventsTab
            caseId={caseId}
            events={events}
            eventImages={eventImages}
            onImageClick={() => {}}
            highlightedEventOrderNumber={highlightedEventId}
            onViewInReport={(orderNumber) => {
              setHighlightedEventId(orderNumber);
              setActiveTab('report');
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Action bar - always visible */}
      <ReportActionBar
        caseId={caseId}
        report={report}
        anomalyCount={anomalies.length}
        missingDocsCount={missingDocs.length}
        isRegenerating={isRegenerating}
        onRegenerate={handleRegenerate}
        onEdit={() => setEditDialogOpen(true)}
        onVersionsToggle={handleVersionsToggle}
        alertCount={alertCount}
        onOpenQualitySheet={() => setQualitySheetOpen(true)}
      />

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
                onNavigateToStep(4);
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

      {/* Edit Dialog (fullscreen) */}
      <ReportDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        caseId={caseId}
        report={report}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
