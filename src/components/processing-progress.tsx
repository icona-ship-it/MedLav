'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, Clock, Loader2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// --- Helpers ---

function getStepIndex(status: string): number {
  return STATUS_TO_STEP[status] ?? -1;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getEarliestQueueTime(documents: ProcessingDocument[]): Date | null {
  const processing = documents.filter(
    (d) => d.processing_status !== 'caricato' && d.processing_status !== 'completato' && d.processing_status !== 'errore',
  );
  if (processing.length === 0) return null;

  const dates = processing.map((d) => new Date(d.updated_at ?? d.created_at).getTime());
  return new Date(Math.min(...dates));
}

function isStale(documents: ProcessingDocument[]): boolean {
  const processing = documents.filter(
    (d) => !['caricato', 'completato', 'errore'].includes(d.processing_status),
  );
  if (processing.length === 0) return false;

  const now = Date.now();
  return processing.every((d) => {
    const updatedAt = d.updated_at ? new Date(d.updated_at).getTime() : new Date(d.created_at).getTime();
    return now - updatedAt > STALE_THRESHOLD_MS;
  });
}

// --- Components ---

function StepIcon({ state }: { state: 'completed' | 'active' | 'pending' | 'error' }) {
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
  const processing = documents.filter(
    (d) => !['caricato', 'completato', 'errore'].includes(d.processing_status),
  );

  if (processing.length === 0) {
    const allCompleted = documents.every((d) => d.processing_status === 'completato');
    return allCompleted ? 4 : -1;
  }

  return Math.min(...processing.map((d) => getStepIndex(d.processing_status)));
}

function hasErrorDocuments(documents: ProcessingDocument[]): boolean {
  return documents.some((d) => d.processing_status === 'errore');
}

export function ProcessingProgress({ documents }: ProcessingProgressProps) {
  const [elapsed, setElapsed] = useState(0);
  const stale = isStale(documents);
  const overallStep = getOverallStepIndex(documents);
  const hasErrors = hasErrorDocuments(documents);

  // Memoize startTime as a timestamp number to avoid re-creating Date on every render
  const startTimeMs = useMemo(() => {
    const d = getEarliestQueueTime(documents);
    return d ? d.getTime() : null;
  }, [documents]);

  // Elapsed timer
  useEffect(() => {
    if (startTimeMs === null) return;
    const update = () => setElapsed(Date.now() - startTimeMs);
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTimeMs]);

  return (
    <div className="space-y-5" aria-live="polite">
      {/* Global stepper */}
      <div className="flex items-center justify-between">
        {PROCESSING_STEPS.map((step, index) => {
          const stepIdx = index;
          let state: 'completed' | 'active' | 'pending' | 'error' = 'pending';

          if (overallStep > stepIdx) {
            state = 'completed';
          } else if (overallStep === stepIdx) {
            state = hasErrors && stepIdx === overallStep ? 'error' : 'active';
          }

          // If all completed
          if (overallStep === 4 && stepIdx <= 4) {
            state = 'completed';
          }

          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <StepIcon state={state} />
                <span className={`text-xs font-medium ${
                  state === 'completed' ? 'text-green-600 dark:text-green-400'
                    : state === 'active' ? 'text-primary'
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

      {/* Status bar: elapsed + stale warning */}
      <div className="flex items-center justify-between text-sm">
        {startTimeMs !== null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Tempo trascorso: {formatElapsed(elapsed)}</span>
          </div>
        )}
        {stale && (
          <Badge variant="warning" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Potenzialmente bloccato
          </Badge>
        )}
      </div>

      {/* Per-document status */}
      <div className="space-y-1.5">
        {documents.map((doc) => {
          const docStep = getStepIndex(doc.processing_status);
          const isError = doc.processing_status === 'errore';
          const isComplete = doc.processing_status === 'completato';

          return (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span className="truncate font-medium">{doc.file_name}</span>
              <div className="ml-2 flex items-center gap-2">
                {isError ? (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {doc.processing_error ?? 'Errore'}
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
