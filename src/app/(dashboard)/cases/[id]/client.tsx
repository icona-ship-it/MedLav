'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CaseHeader } from './case-header';
import { DocumentsSection } from './documents-section';
import { ProcessingSection } from './processing-section';
import { PeriziaMetadataForm } from './perizia-form';
import { ReportStep } from './report-step';
import type { GenerationProgress } from './report-step';
import { AnonymizeStep } from './anonymize-step';
import { ExpenseTable } from './expense-table';
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

const FULL_WIZARD_STEPS = [
  { number: 1, label: 'Documenti', hint: 'Carica i documenti clinici del caso' },
  { number: 2, label: 'Info Perizia', hint: 'Compila i dati della perizia (facoltativo)' },
  { number: 3, label: 'Elaborazione', hint: 'Avvia l\'analisi AI dei documenti' },
  { number: 4, label: 'Report', hint: 'Il tuo report è pronto' },
] as const;

const EXTRACTION_WIZARD_STEPS = [
  { number: 1, label: 'Documenti', hint: 'Carica i documenti da analizzare' },
  { number: 2, label: 'Elaborazione', hint: 'Avvia l\'estrazione eventi' },
  { number: 3, label: 'Cronistoria', hint: 'La cronistoria estratta è pronta' },
] as const;

const EXPENSES_WIZARD_STEPS = [
  { number: 1, label: 'Documenti', hint: 'Carica scontrini, fatture, ricevute' },
  { number: 2, label: 'Elaborazione', hint: 'Avvia l\'analisi delle spese' },
  { number: 3, label: 'Spese', hint: 'La tabella spese è pronta' },
] as const;

const ANONYMIZE_WIZARD_STEPS = [
  { number: 1, label: 'Documenti', hint: 'Carica i documenti da anonimizzare' },
  { number: 2, label: 'Anonimizza', hint: 'Visualizza e scarica il testo anonimizzato' },
] as const;

// --- Helpers ---

function isDocProcessing(status: string): boolean {
  return ['in_coda', 'ocr_in_corso', 'classificazione_completata', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
}

function computeExtractionAutoStep(
  processingStage: string,
  hasProcessingDocs: boolean,
  hasEvents: boolean,
): number {
  // 3-step wizard: 1=Documenti, 2=Elaborazione, 3=Cronistoria
  if (processingStage === 'completato') return 3;
  if (processingStage === 'elaborazione') return 2;
  if (processingStage === 'errore') {
    if (hasEvents) return 3;
    return 2;
  }
  if (hasEvents) return 3;
  if (hasProcessingDocs) return 2;
  return 1;
}

function computeAnonymizeAutoStep(
  documents: Document[],
): number {
  // 2-step wizard: 1=Documenti, 2=Anonimizza
  if (documents.length === 0) return 1;
  return 2;
}

function computeAutoStep(
  processingStage: string,
  hasProcessingDocs: boolean,
  hasReport: boolean,
  hasEvents: boolean,
): number {
  // 4-step wizard: 1=Documenti, 2=Info Perizia, 3=Elaborazione, 4=Report
  // No more separate anomaly review step — anomalies shown inside report step
  if (processingStage === 'completato') return 4;
  if (processingStage === 'generazione_report') return 4;
  if (processingStage === 'revisione_anomalie') return 4; // legacy: treat as report step
  if (processingStage === 'elaborazione') return 3;
  if (processingStage === 'errore') {
    if (hasReport) return 4;
    if (hasEvents) return 4;
    return 3;
  }

  if (hasReport) return 4;
  if (hasEvents) return 4;
  if (hasProcessingDocs) return 3;
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

  // Determine pipeline mode for UI adaptation
  const pipelineMode = caseData.pipeline_mode ?? 'full';
  const reportSectionExclusions = (caseData.perizia_metadata as Record<string, unknown> | null)
    ?.excludedReportSections as string[] | undefined;
  const isExtractionOnly = pipelineMode === 'extraction_only';
  const isExpensesOnly = pipelineMode === 'expenses_only';
  const isAnonymizeOnly = pipelineMode === 'anonymize_only';
  const WIZARD_STEPS = isAnonymizeOnly
    ? ANONYMIZE_WIZARD_STEPS
    : isExpensesOnly
      ? EXPENSES_WIZARD_STEPS
      : isExtractionOnly
        ? EXTRACTION_WIZARD_STEPS
        : FULL_WIZARD_STEPS;

  // Sync with server data on refresh
  useEffect(() => {
    setLocalAnomalies(anomalies);
  }, [anomalies]);

  useEffect(() => {
    setLocalDocuments(initialDocuments);
  }, [initialDocuments]);

  // Wizard step
  const hasProcessingDocs = localDocuments.some((d) => isDocProcessing(d.processing_status));
  const hasUploadedDocs = localDocuments.some((d) => d.processing_status === 'caricato');
  const hasReport = !!report;
  const hasEvents = events.length > 0;
  const hasResults = hasEvents || localAnomalies.length > 0 || hasReport;
  const processingStage = caseData.processing_stage ?? 'idle';

  // Extract generation progress from perizia_metadata (updated per section during report generation)
  const generationProgress = (
    (caseData.perizia_metadata as Record<string, unknown> | null)?.generationProgress as GenerationProgress | undefined
  ) ?? null;

  // Extract pipeline warnings from perizia_metadata (saved at finalize when any step had issues)
  const pipelineWarnings = (
    (caseData.perizia_metadata as Record<string, unknown> | null)?.pipelineWarnings as Array<{
      step: string;
      severity: 'warning' | 'critical';
      message: string;
      failedCount?: number;
      totalCount?: number;
      failedItems?: string[];
    }> | undefined
  ) ?? [];

  // Extract processing progress from perizia_metadata (updated per pipeline phase)
  const processingProgress = (
    (caseData.perizia_metadata as Record<string, unknown> | null)?.processingProgress as {
      phase: string;
      ocrCompleted?: number;
      totalDocs?: number;
      totalChunks?: number;
    } | undefined
  ) ?? null;

  // Extract classification progress from perizia_metadata (updated by Inngest classify-batch)
  const classificationProgress = (
    (caseData.perizia_metadata as Record<string, unknown> | null)?.classificationProgress as {
      completed: number;
      total: number;
      errors: number;
      status: 'running' | 'done';
    } | undefined
  ) ?? null;

  // Extract PubMed references from perizia_metadata (saved after PubMed search step)
  const pubmedReferences = (
    (caseData.perizia_metadata as Record<string, unknown> | null)?.pubmedReferences as Array<{ query: string; category: 'diagnosis' | 'treatment' | 'causal_nexus'; articles: Array<{ pmid: string; title: string; authors: string; journal: string; year: string; doi?: string }> }> | undefined
  ) ?? [];

  const autoStep = isAnonymizeOnly
    ? computeAnonymizeAutoStep(localDocuments)
    : (isExtractionOnly || isExpensesOnly)
      ? computeExtractionAutoStep(processingStage, hasProcessingDocs, hasEvents)
      : computeAutoStep(processingStage, hasProcessingDocs, hasReport, hasEvents);
  const [activeStep, setActiveStep] = useState(autoStep);
  const userNavigatedRef = useRef(false);
  const prevAutoStepRef = useRef(autoStep);
  // Set by PeriziaMetadataForm while it has unsaved edits (anamnesi, quesiti...).
  // Ref (not state): read inside the auto-advance effect without re-triggering it.
  const periziaFormDirtyRef = useRef(false);

  const handleSetStep = useCallback((step: number) => {
    userNavigatedRef.current = true;
    setActiveStep(step);
  }, []);

  const handlePeriziaDirtyChange = useCallback((dirty: boolean) => {
    periziaFormDirtyRef.current = dirty;
  }, []);

  // Auto-advance only on meaningful state transitions.
  // Uses refs to avoid stale closure and unnecessary re-runs.
  useEffect(() => {
    const prev = prevAutoStepRef.current;
    prevAutoStepRef.current = autoStep;

    // NEVER auto-navigate while the perizia form has unsaved changes: switching
    // step unmounts the form and would silently discard the perito's work
    // (scorecard 2026-06-10 fix 1.2). Manual navigation stays possible.
    if (periziaFormDirtyRef.current) return;

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

  const isClassifying = classificationProgress?.status === 'running';
  const needsPolling = processingStage !== 'errore' && (hasProcessingDocs || processingStage === 'generazione_report' || processingStage === 'elaborazione' || isClassifying);
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
          subtitle: isAnonymizeOnly
            ? (step.number === 1
                ? (localDocuments.length === 0 ? 'Carica documenti' : `${localDocuments.length} ${localDocuments.length === 1 ? 'documento' : 'documenti'}`)
                : 'Pronto')
            : (isExtractionOnly || isExpensesOnly)
            ? (step.number === 1
                ? (localDocuments.length === 0 ? 'Carica documenti' : `${localDocuments.length} ${localDocuments.length === 1 ? 'documento' : 'documenti'}`)
                : step.number === 2
                ? (hasProcessingDocs || processingStage === 'elaborazione'
                    ? (processingProgress?.phase === 'extraction'
                        ? `Estrazione da ${processingProgress.ocrCompleted ?? '?'} doc...`
                        : processingProgress?.phase === 'ocr'
                          ? 'Lettura documenti...'
                          : 'In elaborazione...')
                    : processingStage === 'errore' ? 'Errore'
                    : processingStage === 'completato' ? 'Completata' : 'Pronto')
                : hasEvents ? `${events.length} eventi estratti` : processingStage === 'completato' ? 'Nessun evento trovato' : 'In attesa')
            : (step.number === 1 ? (localDocuments.length === 0 ? 'Carica documenti' : `${localDocuments.length} ${localDocuments.length === 1 ? 'documento' : 'documenti'}`)
            : step.number === 2 ? (caseData.perizia_metadata ? 'Compilato' : 'Da compilare')
            : step.number === 3 ? (
                hasProcessingDocs || processingStage === 'elaborazione'
                ? (processingProgress?.phase === 'extraction'
                    ? `Estrazione da ${processingProgress.ocrCompleted ?? '?'} doc...`
                    : processingProgress?.phase === 'ocr'
                      ? 'Lettura documenti...'
                      : 'In elaborazione...')
                : processingStage === 'errore' ? 'Errore'
                : processingStage === 'completato' ? 'Completata' : 'Pronto')
            : processingStage === 'generazione_report'
                ? (generationProgress
                    ? `Sezione ${generationProgress.currentSection}/${generationProgress.totalSections}`
                    : 'Generazione in corso...')
                : hasReport ? 'Report pronto' : 'In attesa'),
          hint: activeStep === step.number ? step.hint : undefined,
        }))}
        activeStep={activeStep}
        autoStep={autoStep}
        onSetStep={handleSetStep}
      />

      {/* Step content - aria-live for screen readers */}
      <div aria-live="polite">
      {isAnonymizeOnly ? (
        <>
          {/* === Anonymize-only: 2-step wizard === */}

          {/* STEP 1: Documenti */}
          {activeStep === 1 && (
            <div key="step-1" className="animate-step-in">
              <DocumentsSection
                caseId={caseId}
                documents={localDocuments}
                processingLabels={processingLabels}
                hasUploadedDocs={hasUploadedDocs}
                classificationProgress={classificationProgress}
                onProceedToNext={() => handleSetStep(2)}
              />
            </div>
          )}

          {/* STEP 2: Anonimizza */}
          {activeStep === 2 && (
            <div key="step-2" className="animate-step-in">
              <AnonymizeStep
                caseId={caseId}
                documents={localDocuments}
                processingStage={processingStage}
              />
            </div>
          )}
        </>
      ) : isExpensesOnly ? (
        <>
          {/* === Expenses-only: 3-step wizard === */}

          {/* STEP 1: Documenti */}
          {activeStep === 1 && (
            <div key="step-1" className="animate-step-in">
              <DocumentsSection
                caseId={caseId}
                documents={localDocuments}
                processingLabels={processingLabels}
                hasUploadedDocs={hasUploadedDocs}
                classificationProgress={classificationProgress}
                onProceedToNext={() => handleSetStep(2)}
              />
            </div>
          )}

          {/* STEP 2: Elaborazione */}
          {activeStep === 2 && (
            <div key="step-2" className="animate-step-in">
              <ProcessingSection
                caseId={caseId}
                documents={localDocuments}
                hasProcessingDocs={hasProcessingDocs}
                hasUploadedDocs={hasUploadedDocs}
                processingStage={processingStage}
                lastError={(caseData.perizia_metadata as Record<string, unknown> | null)?.lastError as string | undefined}
                pipelineMode={pipelineMode}
                initialExcludedSections={reportSectionExclusions}
              />
            </div>
          )}

          {/* STEP 3: Spese + Cronistoria */}
          {activeStep === 3 && (
            <div key="step-3" className="animate-step-in space-y-6">
              {/* Expense table from LLM extraction */}
              {(() => {
                const expenseExtraction = (caseData.perizia_metadata as Record<string, unknown> | null)?.expenseExtraction as { items: Array<Record<string, unknown>>; totalAmount: number | null } | undefined;
                if (expenseExtraction?.items && expenseExtraction.items.length > 0) {
                  return (
                    <ExpenseTable
                      items={expenseExtraction.items as unknown as import('@/services/expenses/expense-extractor').ExtractedExpenseItem[]}
                      totalAmount={expenseExtraction.totalAmount}
                      caseId={caseId}
                    />
                  );
                }
                return null;
              })()}

              {/* Events timeline below */}
              <ReportStep
                caseId={caseId}
                report={null}
                events={events}
                anomalies={[]}
                missingDocs={[]}
                documents={localDocuments}
                documentPages={documentPages}
                eventImages={eventImages}
                processingStage={processingStage}
                onNavigateToStep={handleSetStep}
                generationProgress={generationProgress}
                pubmedReferences={[]}
                pipelineWarnings={pipelineWarnings}
              />
            </div>
          )}
        </>
      ) : isExtractionOnly ? (
        <>
          {/* === Extraction-only: 3-step wizard === */}

          {/* STEP 1: Documenti */}
          {activeStep === 1 && (
            <div key="step-1" className="animate-step-in">
              <DocumentsSection
                caseId={caseId}
                documents={localDocuments}
                processingLabels={processingLabels}
                hasUploadedDocs={hasUploadedDocs}
                classificationProgress={classificationProgress}
                onProceedToNext={() => handleSetStep(2)}
              />
            </div>
          )}

          {/* STEP 2: Elaborazione */}
          {activeStep === 2 && (
            <div key="step-2" className="animate-step-in">
              <ProcessingSection
                caseId={caseId}
                documents={localDocuments}
                hasProcessingDocs={hasProcessingDocs}
                hasUploadedDocs={hasUploadedDocs}
                processingStage={processingStage}
                lastError={(caseData.perizia_metadata as Record<string, unknown> | null)?.lastError as string | undefined}
                pipelineMode={pipelineMode}
                initialExcludedSections={reportSectionExclusions}
              />
            </div>
          )}

          {/* STEP 3: Cronistoria (eventi) */}
          {activeStep === 3 && (
            <div key="step-3" className="animate-step-in">
              <ReportStep
                caseId={caseId}
                report={null}
                events={events}
                anomalies={[]}
                missingDocs={[]}
                documents={localDocuments}
                documentPages={documentPages}
                eventImages={eventImages}
                processingStage={processingStage}
                onNavigateToStep={handleSetStep}
                generationProgress={generationProgress}
                pubmedReferences={[]}
                pipelineWarnings={pipelineWarnings}
              />
            </div>
          )}
        </>
      ) : (
        <>
          {/* === Full pipeline: 4-step wizard === */}
          {/* No separate anomaly review step — anomalies shown inside report */}

          {/* STEP 1: Documenti */}
          {activeStep === 1 && (
            <div key="step-1" className="animate-step-in">
              <DocumentsSection
                caseId={caseId}
                documents={localDocuments}
                processingLabels={processingLabels}
                hasUploadedDocs={hasUploadedDocs}
                classificationProgress={classificationProgress}
                onProceedToNext={() => handleSetStep(2)}
              />
            </div>
          )}

          {/* STEP 2: Info Perizia */}
          {activeStep === 2 && (
            <div key="step-2" className="animate-step-in">
              <PeriziaMetadataForm
                caseId={caseId}
                caseData={caseData}
                onSaved={() => router.refresh()}
                onProceedToNext={() => handleSetStep(3)}
                onDirtyChange={handlePeriziaDirtyChange}
              />
            </div>
          )}

          {/* STEP 3: Elaborazione */}
          {activeStep === 3 && (
            <div key="step-3" className="animate-step-in">
              <ProcessingSection
                caseId={caseId}
                documents={localDocuments}
                hasProcessingDocs={hasProcessingDocs}
                hasUploadedDocs={hasUploadedDocs}
                processingStage={processingStage}
                lastError={(caseData.perizia_metadata as Record<string, unknown> | null)?.lastError as string | undefined}
                pipelineMode={pipelineMode}
                initialExcludedSections={reportSectionExclusions}
              />
            </div>
          )}

          {/* STEP 4: Report (includes anomalies) */}
          {activeStep === 4 && (
            <div key="step-4" className="animate-step-in">
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
                generationProgress={generationProgress}
                pubmedReferences={pubmedReferences}
                pipelineWarnings={pipelineWarnings}
              />
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
