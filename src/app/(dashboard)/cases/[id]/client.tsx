'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, FileText, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CaseHeader } from './case-header';
import { DocumentsSection } from './documents-section';
import { ProcessingSection } from './processing-section';
import { AnomaliesSection, MissingDocsSection } from './anomalies-section';
import { EventsTab } from './events-tab';
import { ReportTab } from './report-tab';
import { PeriziaMetadataForm } from './perizia-form';
import { ReportDialog } from './report-dialog';
import { OcrPreviewTab } from './ocr-preview-tab';
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
  { number: 2, label: 'Elaborazione' },
  { number: 3, label: 'Risultati' },
] as const;

// --- Helpers ---

function isDocProcessing(status: string): boolean {
  return ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
}

function computeAutoStep(hasResults: boolean, hasProcessingDocs: boolean): number {
  if (hasResults && !hasProcessingDocs) return 3;
  if (hasProcessingDocs) return 2;
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
  const [activeResultTab, setActiveResultTab] = useState('events');

  // Wizard step
  const hasProcessingDocs = initialDocuments.some((d) => isDocProcessing(d.processing_status));
  const hasUploadedDocs = initialDocuments.some((d) => d.processing_status === 'caricato');
  const hasResults = events.length > 0 || anomalies.length > 0 || !!report;

  const autoStep = computeAutoStep(hasResults, hasProcessingDocs);
  const [activeStep, setActiveStep] = useState(autoStep);

  useEffect(() => {
    setActiveStep(computeAutoStep(hasResults, hasProcessingDocs));
  }, [hasResults, hasProcessingDocs]);

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
        headers: { 'Content-Type': 'application/json' },
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
      <nav aria-label="Passaggi caso" className="flex items-center gap-2">
        {WIZARD_STEPS.map((step, index) => {
          const isActive = activeStep === step.number;
          const isCompleted = autoStep > step.number;
          return (
            <div key={step.number} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => setActiveStep(step.number)}
                className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : isCompleted
                      ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/10'
                      : 'border-muted hover:border-muted-foreground/30'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : step.number}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${
                    isActive ? 'text-primary' : isCompleted ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'
                  }`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    {step.number === 1 && `${initialDocuments.length} documenti`}
                    {step.number === 2 && (hasProcessingDocs ? 'In corso...' : 'Pronto')}
                    {step.number === 3 && (hasResults ? `${events.length} eventi` : 'In attesa')}
                  </p>
                </div>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <div className={`mx-2 h-0.5 w-4 shrink-0 rounded ${
                  autoStep > step.number ? 'bg-green-500' : 'bg-muted'
                }`} />
              )}
            </div>
          );
        })}
      </nav>

      {/* === STEP 1: Documenti === */}
      {activeStep === 1 && (
        <DocumentsSection
          caseId={caseId}
          documents={initialDocuments}
          processingLabels={processingLabels}
          hasUploadedDocs={hasUploadedDocs}
          onProceedToProcessing={() => setActiveStep(2)}
        />
      )}

      {/* === STEP 2: Elaborazione === */}
      {activeStep === 2 && (
        <ProcessingSection
          caseId={caseId}
          caseData={caseData}
          documents={initialDocuments}
          hasProcessingDocs={hasProcessingDocs}
          hasUploadedDocs={hasUploadedDocs}
        />
      )}

      {/* === STEP 3: Risultati === */}
      {activeStep === 3 && hasProcessingDocs && (
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
      {activeStep === 3 && !hasProcessingDocs && (
        <>
          {hasResults ? (
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
            <Tabs value={activeResultTab} onValueChange={setActiveResultTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="events">Timeline ({events.length})</TabsTrigger>
                <TabsTrigger value="ocr">OCR</TabsTrigger>
                <TabsTrigger value="synthesis">Report</TabsTrigger>
                {anomalies.length > 0 && (
                  <TabsTrigger value="anomalies">Anomalie ({anomalies.length})</TabsTrigger>
                )}
                {missingDocs.length > 0 && (
                  <TabsTrigger value="missing">Doc. Mancanti ({missingDocs.length})</TabsTrigger>
                )}
                <TabsTrigger value="perizia">Metadati</TabsTrigger>
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

              <TabsContent value="ocr">
                <OcrPreviewTab
                  documents={initialDocuments}
                  documentPages={documentPages}
                />
              </TabsContent>

              <TabsContent value="synthesis">
                <ReportTab
                  caseId={caseId}
                  report={report}
                  isRegenerating={isRegenerating}
                  onRegenerate={handleRegenerate}
                  events={events}
                  onEventClick={(orderNumber) => {
                    setHighlightedEventId(orderNumber);
                    setActiveResultTab('events');
                  }}
                />
              </TabsContent>

              <TabsContent value="anomalies">
                <AnomaliesSection anomalies={anomalies} />
              </TabsContent>

              <TabsContent value="missing">
                <MissingDocsSection missingDocs={missingDocs} />
              </TabsContent>

              <TabsContent value="perizia">
                <PeriziaMetadataForm caseId={caseId} caseData={caseData} onSaved={() => router.refresh()} />
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
        </>
      )}

      {/* Image Preview Dialog */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Immagine documento</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage}
                alt="Immagine documento medico"
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
