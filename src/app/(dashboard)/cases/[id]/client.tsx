'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  Loader2, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { csrfHeaders } from '@/lib/csrf-client';
import { CaseHeader } from './case-header';
import { DocumentsSection } from './documents-section';
import { ProcessingSection } from './processing-section';
import { EventsTab } from './events-tab';
import { ReportTab } from './report-tab';
import { PeriziaMetadataForm } from './perizia-form';
const ReportDialog = dynamic(
  () => import('./report-dialog').then((m) => ({ default: m.ReportDialog })),
  { loading: () => null },
);
const OcrPreviewTab = dynamic(
  () => import('./ocr-preview-tab').then((m) => ({ default: m.OcrPreviewTab })),
  { loading: () => null },
);
import { QualitySummaryCard } from './quality-summary-card';
import { DocumentCoverageCard } from './document-coverage-card';
import { WizardStepBar } from './wizard-step-bar';
import { AnomalyReviewStep } from './anomaly-review-step';
import type {
  CaseData, Document, EventRow, AnomalyRow, MissingDocRow, ReportRow,
} from './types';
import type { DocumentPage } from '../../actions';

// --- Types ---

interface CaseDetailClientProps {
  caseId: string;
  caseData: CaseData;
  documents: Document[];
  events: EventRow[];
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  report: ReportRow | null;
  processingLabels: Record<string, string>;
  eventImages: Record<string, string[]>;
  documentPages: DocumentPage[];
}

// --- Constants ---

const POLL_INTERVAL_MS = 5000;

const WIZARD_STEPS = [
  { number: 1, label: 'Documenti' },
  { number: 2, label: 'Info Perizia' },
  { number: 3, label: 'Elaborazione' },
  { number: 4, label: 'Revisione' },
  { number: 5, label: 'Report' },
] as const;

// --- Helpers ---

function isDocProcessing(status: string): boolean {
  return ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
}

function computeAutoStep(
  processingStage: string,
  hasProcessingDocs: boolean,
  hasClassificationReview: boolean,
  hasReport: boolean,
  hasEvents: boolean,
): number {
  // Stage-based routing (new pipeline)
  if (processingStage === 'completato') return 5;
  if (processingStage === 'generazione_report') return 5; // step 5 with spinner
  if (processingStage === 'revisione_anomalie') return 4;
  if (processingStage === 'elaborazione') return 3;

  // Fallback for legacy cases (processing_stage = 'idle')
  if (hasReport) return 5;
  if (hasEvents) return 4;
  if (hasProcessingDocs || hasClassificationReview) return 3;
  return 1;
}

// --- Main Component ---

export function CaseDetailClient({
  caseId,
  caseData,
  documents: initialDocuments,
  events,
  anomalies,
  missingDocs,
  report,
  processingLabels,
  eventImages,
  documentPages,
}: CaseDetailClientProps) {
  const router = useRouter();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [activeResultTab, setActiveResultTab] = useState(report?.synthesis ? 'synthesis' : 'events');
  const [localAnomalies, setLocalAnomalies] = useState(anomalies);

  // Sync with server data on refresh
  useEffect(() => {
    setLocalAnomalies(anomalies);
  }, [anomalies]);

  // Wizard step
  const hasProcessingDocs = initialDocuments.some((d) => isDocProcessing(d.processing_status));
  const hasClassificationReview = initialDocuments.some((d) => d.processing_status === 'classificazione_completata');
  const hasUploadedDocs = initialDocuments.some((d) => d.processing_status === 'caricato');
  const hasReport = !!report;
  const hasEvents = events.length > 0;
  const hasResults = hasEvents || localAnomalies.length > 0 || hasReport;
  const processingStage = caseData.processing_stage ?? 'idle';

  const autoStep = computeAutoStep(processingStage, hasProcessingDocs, hasClassificationReview, hasReport, hasEvents);
  const [activeStep, setActiveStep] = useState(autoStep);
  const userNavigatedRef = useRef(false);
  const prevAutoStepRef = useRef(autoStep);

  const handleSetStep = useCallback((step: number) => {
    userNavigatedRef.current = true;
    setActiveStep(step);
  }, []);

  // Auto-advance only on meaningful state transitions.
  // Uses refs to avoid stale closure and unnecessary re-runs.
  useEffect(() => {
    const prev = prevAutoStepRef.current;
    prevAutoStepRef.current = autoStep;

    // Major transition detected (e.g. processing started or results arrived)
    if (prev !== autoStep) {
      userNavigatedRef.current = false;
      setActiveStep(autoStep);
      return;
    }

    // No transition, respect user's manual navigation
    if (!userNavigatedRef.current) {
      setActiveStep(autoStep);
    }
  }, [autoStep]);

  const needsPolling = hasProcessingDocs || processingStage === 'generazione_report' || processingStage === 'elaborazione';
  useEffect(() => {
    if (!needsPolling) return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [needsPolling, router]);

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

  return (
    <div className="space-y-6">
      {/* Header, demo banner, completeness, search */}
      <CaseHeader
        caseId={caseId}
        caseData={caseData}
        events={events}
        report={report}
        hasProcessingDocs={hasProcessingDocs}
        hasResults={hasResults}
      />

      {/* Wizard Step Bar */}
      <WizardStepBar
        steps={WIZARD_STEPS.map((step) => ({
          ...step,
          subtitle:
            step.number === 1 ? `${initialDocuments.length} documenti`
            : step.number === 2 ? (caseData.perizia_metadata ? 'Compilato' : 'Da compilare')
            : step.number === 3 ? (hasClassificationReview
                ? 'Revisione classificazione'
                : hasProcessingDocs || processingStage === 'elaborazione'
                ? `${initialDocuments.filter((d) => d.processing_status === 'completato').length}/${initialDocuments.filter((d) => !['caricato'].includes(d.processing_status)).length} documenti`
                : 'Pronto')
            : step.number === 4 ? (processingStage === 'revisione_anomalie'
                ? `${localAnomalies.length + missingDocs.length} da revisionare`
                : localAnomalies.length > 0 || missingDocs.length > 0
                ? `${localAnomalies.length + missingDocs.length} segnalazioni`
                : 'Nessuna anomalia')
            : processingStage === 'generazione_report'
                ? 'Generazione in corso...'
                : hasReport ? 'Report pronto' : 'In attesa',
        }))}
        activeStep={activeStep}
        autoStep={autoStep}
        onSetStep={handleSetStep}
      />

      {/* Step content - aria-live for screen readers */}
      <div aria-live="polite">
      {/* === STEP 1: Documenti === */}
      {activeStep === 1 && (
        <div key="step-1" className="animate-step-in">
        <DocumentsSection
          caseId={caseId}
          documents={initialDocuments}
          processingLabels={processingLabels}
          hasUploadedDocs={hasUploadedDocs}
          onProceedToNext={() => handleSetStep(2)}
        />
        </div>
      )}

      {/* === STEP 2: Info Perizia === */}
      {activeStep === 2 && (
        <div key="step-2" className="animate-step-in">
        <PeriziaMetadataForm
          caseId={caseId}
          caseData={caseData}
          onSaved={() => router.refresh()}
          onProceedToNext={() => handleSetStep(3)}
        />
        </div>
      )}

      {/* === STEP 3: Elaborazione === */}
      {activeStep === 3 && (
        <div key="step-3" className="animate-step-in">
        <ProcessingSection
          caseId={caseId}
          documents={initialDocuments}
          hasProcessingDocs={hasProcessingDocs}
          hasUploadedDocs={hasUploadedDocs}
        />
        </div>
      )}

      {/* === STEP 4: Revisione Anomalie === */}
      {activeStep === 4 && (
        <div key="step-4" className="animate-step-in">
          {processingStage === 'revisione_anomalie' || hasEvents || localAnomalies.length > 0 ? (
            <AnomalyReviewStep
              caseId={caseId}
              anomalies={localAnomalies}
              missingDocs={missingDocs}
              events={events}
              documents={initialDocuments}
              documentPages={documentPages}
              processingStage={processingStage}
              onAnomaliesChanged={(updated) => setLocalAnomalies(updated)}
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="py-8 text-center text-sm text-muted-foreground">
                  In attesa dell&apos;elaborazione. Carica i documenti e avvia l&apos;elaborazione.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* === STEP 5: Report === */}
      {activeStep === 5 && (
        <div key="step-5" className="animate-step-in">
          {hasReport ? (
            <div className="space-y-4">
            {report?.synthesis && (
              <>
                <Button
                  size="lg"
                  className="w-full text-base py-6 bg-primary hover:bg-primary/90 shadow-md"
                  onClick={() => setReportDialogOpen(true)}
                >
                  <FileText className="mr-2 h-5 w-5" />
                  Apri Report Completo
                </Button>
                <ReportDialog
                  open={reportDialogOpen}
                  onOpenChange={setReportDialogOpen}
                  caseId={caseId}
                  caseData={caseData}
                  report={report}
                />
              </>
            )}
            {/* Document Coverage Card */}
            <DocumentCoverageCard
              documents={initialDocuments}
              events={events}
            />
            {/* Quality Summary Card */}
            <QualitySummaryCard
              events={events}
              anomalies={localAnomalies}
              missingDocs={missingDocs}
              documentPages={documentPages}
            />
            <Tabs value={activeResultTab} onValueChange={setActiveResultTab} className="space-y-4">
              <TabsList className="sticky top-[72px] z-20 bg-background/95 backdrop-blur-sm overflow-x-auto scrollbar-hide flex-nowrap">
                <TabsTrigger value="synthesis" className="relative">
                  Report
                  {localAnomalies.filter((a) => a.severity === 'critica' || a.severity === 'alta').length > 0 && (
                    <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0 leading-tight">
                      {localAnomalies.filter((a) => a.severity === 'critica' || a.severity === 'alta').length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="events">Timeline ({events.length})</TabsTrigger>
                <TabsTrigger value="ocr">OCR</TabsTrigger>
              </TabsList>

              <TabsContent value="events">
                <EventsTab
                  caseId={caseId}
                  events={events}
                  eventImages={eventImages}
                  onImageClick={setPreviewImage}
                  highlightedEventOrderNumber={highlightedEventId}
                  onViewInReport={(orderNumber) => {
                    setHighlightedEventId(orderNumber);
                    setActiveResultTab('synthesis');
                  }}
                />
              </TabsContent>

              <TabsContent value="synthesis">
                <ReportTab
                  caseId={caseId}
                  report={report}
                  isRegenerating={isRegenerating}
                  onRegenerate={handleRegenerate}
                  events={events}
                  anomalyCount={localAnomalies.length}
                  missingDocsCount={missingDocs.length}
                  anomalies={localAnomalies}
                  missingDocs={missingDocs}
                  documents={initialDocuments}
                  onSwitchToAnomalies={() => handleSetStep(4)}
                  onEventClick={(orderNumber) => {
                    setHighlightedEventId(orderNumber);
                    setActiveResultTab('events');
                  }}
                />
              </TabsContent>

              <TabsContent value="ocr">
                <OcrPreviewTab
                  caseId={caseId}
                  documents={initialDocuments}
                  documentPages={documentPages}
                />
              </TabsContent>
            </Tabs>
            </div>
          ) : processingStage === 'generazione_report' ? (
            <Card className="border-primary/30">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-base font-semibold">
                      Generazione report in corso...
                    </p>
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
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessun report disponibile. Carica i documenti e avvia l&apos;elaborazione.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      </div>

      {/* Image Preview Dialog */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Immagine documento</DialogTitle>
            </DialogHeader>
            <div className="relative flex items-center justify-center overflow-auto min-h-[300px]">
              <Image
                src={previewImage}
                alt="Immagine documento medico"
                fill
                className="object-contain"
                sizes="(max-width: 896px) 100vw, 896px"
                unoptimized
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
