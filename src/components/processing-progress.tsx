'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, Clock, Loader2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toUserMessage } from '@/lib/user-error-messages';

// --- Types ---

interface ProcessingDocument {
  id: string;
  file_name: string;
  processing_status: string;
  processing_error: string | null;
  created_at: string;
  updated_at?: string;
}

interface ProcessingProgressProps {
  documents: ProcessingDocument[];
}

// --- Constants ---

const PROCESSING_STEPS = [
  { key: 'in_coda', label: 'In attesa' },
  { key: 'ocr_in_corso', label: 'Lettura documenti' },
  { key: 'estrazione_in_corso', label: 'Analisi contenuto' },
  { key: 'validazione_in_corso', label: 'Controllo qualità' },
  { key: 'completato', label: 'Completato' },
] as const;

const STATUS_TO_STEP: Record<string, number> = {
  in_coda: 0,
  ocr_in_corso: 1,
  estrazione_in_corso: 2,
  validazione_in_corso: 3,
  completato: 4,
};

// Patterns that indicate a warning (not a hard error)
const WARNING_ERROR_PATTERNS = [
  'Nessun evento clinico',
  'non contenere dati clinici',
  'nessun evento strutturato individuato',
];

// --- Helpers ---

function getStepIndex(status: string): number {
  return STATUS_TO_STEP[status] ?? -1;
}

/** Weighted pipeline progress 0-100 across documents: each doc contributes its
 * current step / total steps. Far smoother than completed-docs-only counting,
 * which sits at 0% for minutes on large parallel cases and then jumps. */
export function computeWeightedProgress(statuses: readonly string[]): number {
  if (statuses.length === 0) return 0;
  const maxStep = STATUS_TO_STEP.completato;
  const sum = statuses.reduce((acc, s) => {
    // 'errore' counts as terminal (the pipeline moved past this doc)
    const step = s === 'errore' ? maxStep : Math.max(0, getStepIndex(s));
    return acc + step;
  }, 0);
  return Math.round((sum / (statuses.length * maxStep)) * 100);
}

/** Above this elapsed time, reassure the user instead of letting them think
 * the app is stuck (top of the promised "5-15 min" range). */
export const LONGER_THAN_EXPECTED_MS = 15 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function isWarningError(doc: ProcessingDocument): boolean {
  if (!doc.processing_error) return false;
  // Warning if status is 'errore' with a warning-pattern message,
  // OR status is 'completato' but has a processing_error (soft warning)
  if (doc.processing_status === 'errore') {
    return WARNING_ERROR_PATTERNS.some((p) => doc.processing_error!.includes(p));
  }
  if (doc.processing_status === 'completato') {
    return WARNING_ERROR_PATTERNS.some((p) => doc.processing_error!.includes(p));
  }
  return false;
}

function isHardError(doc: ProcessingDocument): boolean {
  return doc.processing_status === 'errore' && !isWarningError(doc);
}

function isStillProcessing(status: string): boolean {
  return !['caricato', 'completato', 'errore'].includes(status);
}

/**
 * Get the earliest timestamp from ALL docs that entered processing
 * (anything except 'caricato'). This gives a stable start time.
 */
function getProcessingStartTime(documents: ProcessingDocument[]): Date | null {
  const processed = documents.filter((d) => d.processing_status !== 'caricato');
  if (processed.length === 0) return null;
  const dates = processed.map((d) => new Date(d.created_at).getTime());
  return new Date(Math.min(...dates));
}

// --- Components ---

function StepIcon({ state }: { state: 'completed' | 'active' | 'pending' | 'error' | 'warning' }) {
  switch (state) {
    case 'completed':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
          <Check className="h-4 w-4" />
        </div>
      );
    case 'active':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      );
    case 'warning':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      );
    case 'error':
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
          <XCircle className="h-4 w-4" />
        </div>
      );
    default:
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/30 text-muted-foreground/30">
          <div className="h-2 w-2 rounded-full bg-current" />
        </div>
      );
  }
}

function getOverallStepIndex(documents: ProcessingDocument[]): number {
  const processing = documents.filter((d) => isStillProcessing(d.processing_status));

  if (processing.length === 0) {
    const hasCompleted = documents.some((d) => d.processing_status === 'completato');
    const allHardError = documents.every((d) => isHardError(d));
    if (allHardError) return -1;
    return hasCompleted ? 4 : -1;
  }

  return Math.min(...processing.map((d) => getStepIndex(d.processing_status)));
}

export function ProcessingProgress({ documents }: ProcessingProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const overallStep = getOverallStepIndex(documents);

  const someStillProcessing = documents.some((d) => isStillProcessing(d.processing_status));
  const hasHardErrors = documents.some((d) => isHardError(d));
  const hasWarningErrors = documents.some((d) => isWarningError(d));
  const allDone = !someStillProcessing;
  const allCompletedOk = allDone && documents.every(
    (d) => d.processing_status === 'completato' || isWarningError(d),
  );

  // Stable start time: earliest created_at of any doc that entered processing
  const startTimeMs = useMemo(() => {
    const d = getProcessingStartTime(documents);
    return d ? d.getTime() : null;
  }, [documents]);

  // Timer: runs while processing, stops when all done
  useEffect(() => {
    if (startTimeMs === null) return;
    if (allDone) return;
    const update = () => setElapsed(Date.now() - startTimeMs);
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTimeMs, allDone]);

  return (
    <div className="space-y-5" aria-live="polite" aria-atomic="true">
      {/* Global stepper */}
      <div className="flex items-center justify-between">
        {PROCESSING_STEPS.map((step, index) => {
          const stepIdx = index;
          let state: 'completed' | 'active' | 'pending' | 'error' | 'warning' = 'pending';

          if (overallStep === 4 && stepIdx <= 4) {
            // All done successfully
            state = 'completed';
          } else if (overallStep > stepIdx) {
            state = 'completed';
          } else if (overallStep === stepIdx) {
            if (someStillProcessing) {
              // Still processing — show warning (amber+loader) if some errors, else active
              state = hasHardErrors || hasWarningErrors ? 'warning' : 'active';
            } else {
              // All done but not all completed — real error
              state = allCompletedOk ? 'completed' : 'error';
            }
          }

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <StepIcon state={state} />
                <span className={`text-xs font-medium ${
                  state === 'completed' ? 'text-green-600 dark:text-green-400'
                    : state === 'active' ? 'text-primary'
                      : state === 'warning' ? 'text-amber-600 dark:text-amber-400'
                        : state === 'error' ? 'text-destructive'
                          : 'text-muted-foreground/50'
                }`}>
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {index < PROCESSING_STEPS.length - 1 && (
                <div className={`mx-1 h-0.5 flex-1 rounded ${
                  overallStep > index ? 'bg-green-500' : 'bg-muted-foreground/20'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Status bar: elapsed time */}
      {startTimeMs !== null && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Tempo trascorso: {formatElapsed(elapsed)}</span>
        </div>
      )}

      {/* Reassurance when the run exceeds the promised range: a silent long
          wait reads as "stuck" and invites a destructive cancel. */}
      {startTimeMs !== null && elapsed > LONGER_THAN_EXPECTED_MS && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          Sta richiedendo più tempo del solito: succede coi fascicoli molto grandi.
          L&apos;analisi prosegue sul server — puoi anche chiudere questa pagina e
          tornare più tardi. Non annullare.
        </div>
      )}

      {/* Per-document status */}
      <div className="space-y-1.5">
        {documents.map((doc) => {
          const docStep = getStepIndex(doc.processing_status);
          const isDocHardError = isHardError(doc);
          const isDocWarning = isWarningError(doc);
          const isComplete = doc.processing_status === 'completato';

          return (
            <div
              key={doc.id}
              className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                isDocWarning ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20' : ''
              }`}
            >
              <span className="truncate font-medium">{doc.file_name}</span>
              <div className="ml-2 flex items-center gap-2 shrink-0">
                {isDocHardError ? (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {doc.processing_error ? toUserMessage(doc.processing_error) : 'Errore'}
                  </Badge>
                ) : isDocWarning ? (
                  <Badge variant="warning" className="flex items-center gap-1 max-w-[500px]">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{doc.processing_error ? toUserMessage(doc.processing_error) : ''}</span>
                  </Badge>
                ) : isComplete ? (
                  <Badge variant="success" className="flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Completato
                  </Badge>
                ) : (
                  <Badge variant="warning" className="flex items-center gap-1">
                    {docStep >= 0 && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {PROCESSING_STEPS[docStep]?.label ?? doc.processing_status}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
