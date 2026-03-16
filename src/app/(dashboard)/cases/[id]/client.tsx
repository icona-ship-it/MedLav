'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { CaseHeader } from './case-header';
import { DocumentsSection } from './documents-section';
import { ProcessingSection } from './processing-section';
import { PeriziaMetadataForm } from './perizia-form';
import { ReportStep } from './report-step';
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

const POLL_INTERVAL_MS = 10000;

const WIZARD_STEPS = [
  { number: 1, label: 'Documenti', hint: 'Carica i documenti clinici del caso' },
  { number: 2, label: 'Info Perizia', hint: 'Compila i dati della perizia (facoltativo)' },
  { number: 3, label: 'Elaborazione', hint: 'Avvia l\'analisi AI dei documenti' },
  { number: 4, label: 'Revisione', hint: 'Rivedi le segnalazioni trovate' },
  { number: 5, label: 'Report', hint: 'Il tuo report è pronto' },
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
  if (processingStage === 'revisione_classificazione') return 3;
  if (processingStage === 'elaborazione') return 3;
  if (processingStage === 'errore') {
    if (hasReport) return 5;  // Report saved before failure (e.g. finalize failed)
    if (hasEvents) return 4;  // Partial results available
    return 3;                 // Early failure — step 3 shows retry button
  }

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
  const [localAnomalies, setLocalAnomalies] = useState(anomalies);
  const [localDocuments, setLocalDocuments] = useState(initialDocuments);

  // Sync with server data on refresh
  useEffect(() => {
    setLocalAnomalies(anomalies);
  }, [anomalies]);

  useEffect(() => {
    setLocalDocuments(initialDocuments);
  }, [initialDocuments]);

  // Wizard step
  const hasProcessingDocs = localDocuments.some((d) => isDocProcessing(d.processing_status));
  const hasClassificationReview = localDocuments.some((d) => d.processing_status === 'classificazione_completata');
  const hasUploadedDocs = localDocuments.some((d) => d.processing_status === 'caricato');
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

  const needsPolling = processingStage !== 'errore' && (hasProcessingDocs || processingStage === 'generazione_report' || processingStage === 'elaborazione');
  useEffect(() => {
    if (!needsPolling) return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [needsPolling, router]);

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
            step.number === 1 ? `${localDocuments.length} documenti`
            : step.number === 2 ? (caseData.perizia_metadata ? 'Compilato' : 'Da compilare')
            : step.number === 3 ? (processingStage === 'revisione_classificazione' || hasClassificationReview
                ? 'Revisione classificazione'
                : hasProcessingDocs || processingStage === 'elaborazione'
                ? `${localDocuments.filter((d) => d.processing_status === 'completato').length}/${localDocuments.filter((d) => !['caricato'].includes(d.processing_status)).length} documenti`
                : 'Pronto')
            : step.number === 4 ? (processingStage === 'revisione_anomalie'
                ? `${localAnomalies.length + missingDocs.length} da revisionare`
                : localAnomalies.length > 0 || missingDocs.length > 0
                ? `${localAnomalies.length + missingDocs.length} segnalazioni`
                : 'Nessuna anomalia')
            : processingStage === 'generazione_report'
                ? 'Generazione in corso...'
                : hasReport ? 'Report pronto' : 'In attesa',
          hint: activeStep === step.number ? step.hint : undefined,
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
          documents={localDocuments}
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
          documents={localDocuments}
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
              documents={localDocuments}
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
          <ReportStep
            caseId={caseId}
            report={report}
            events={events}
            anomalies={localAnomalies}
            missingDocs={missingDocs}
            documents={localDocuments}
            documentPages={documentPages}
            eventImages={eventImages}
            processingStage={processingStage}
            onNavigateToStep={handleSetStep}
          />
        </div>
      )}
      </div>
    </div>
  );
}
