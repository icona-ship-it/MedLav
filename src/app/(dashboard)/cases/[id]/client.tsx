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
import { AnomaliesSection, MissingDocsSection } from './anomalies-section';
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
  { number: 4, label: 'Risultati' },
] as const;

// --- Helpers ---

function isDocProcessing(status: string): boolean {
  return ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
}

function computeAutoStep(hasResults: boolean, hasProcessingDocs: boolean, hasClassificationReview: boolean): number {
  if (hasResults && !hasProcessingDocs) return 4;
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
  const hasResults = events.length > 0 || localAnomalies.length > 0 || !!report;

  const autoStep = computeAutoStep(hasResults, hasProcessingDocs, hasClassificationReview);
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

  useEffect(() => {
    if (!hasProcessingDocs) return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasProcessingDocs, router]);

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
                : hasProcessingDocs
                ? `${initialDocuments.filter((d) => d.processing_status === 'completato').length}/${initialDocuments.filter((d) => !['caricato'].includes(d.processing_status)).length} documenti`
                : 'Pronto')
            : hasResults ? `${events.length} eventi` : 'In attesa',
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

      {/* === STEP 4: Risultati === */}
      {activeStep === 4 && hasProcessingDocs && !hasResults && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Elaborazione in corso... I risultati saranno disponibili al completamento di tutti i documenti.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {activeStep === 4 && (hasResults || hasProcessingDocs) && !(hasProcessingDocs && !hasResults) && (
        <div key="step-4" className="animate-step-in">
          {hasResults ? (
            <div className="space-y-4">
            {/* Processing indicator when partial results are visible */}
            {hasProcessingDocs && (
              <div className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>Elaborazione ancora in corso. I risultati parziali sono già visibili.</span>
              </div>
            )}
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
                {(localAnomalies.length > 0 || missingDocs.length > 0) && (
                  <TabsTrigger value="problems">
                    Problemi ({localAnomalies.length + missingDocs.length})
                  </TabsTrigger>
                )}
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
                  onSwitchToAnomalies={() => setActiveResultTab('problems')}
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

              <TabsContent value="problems">
                <div className="space-y-4">
                  {localAnomalies.length > 0 && (
                    <AnomaliesSection
                      anomalies={localAnomalies}
                      events={events}
                      documents={initialDocuments}
                      caseId={caseId}
                      onChanged={(dismissedId) => {
                        if (dismissedId) {
                          setLocalAnomalies((prev) => {
                            const updated = prev.filter((a) => a.id !== dismissedId);
                            if (updated.length === 0 && missingDocs.length === 0) {
                              setActiveResultTab('synthesis');
                            }
                            return updated;
                          });
                        }
                        router.refresh();
                      }}
                    />
                  )}
                  {missingDocs.length > 0 && (
                    <MissingDocsSection
                      missingDocs={missingDocs}
                      caseId={caseId}
                      onUploadComplete={() => router.refresh()}
                    />
                  )}
                </div>
              </TabsContent>

            </Tabs>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessun risultato disponibile. Carica i documenti e avvia l&apos;elaborazione.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {activeStep === 4 && !hasProcessingDocs && !hasResults && (
        <Card>
          <CardContent className="pt-6">
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun risultato disponibile. Carica i documenti e avvia l&apos;elaborazione.
            </p>
          </CardContent>
        </Card>
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
