'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Loader2, XCircle, RotateCcw, AlertTriangle,
  FileSearch, BrainCircuit, ShieldCheck, FileText, CheckCircle2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProcessingProgress } from '@/components/processing-progress';
import { ClassificationReview } from './classification-review';
import { csrfHeaders } from '@/lib/csrf-client';
import type { Document } from './types';

// --- Types ---

interface ProcessingSectionProps {
  caseId: string;
  documents: Document[];
  hasProcessingDocs: boolean;
  hasUploadedDocs: boolean;
}

// --- Pipeline steps preview ---

const PIPELINE_STEPS = [
  { icon: FileSearch, label: 'Lettura documenti', desc: 'OCR e riconoscimento testo' },
  { icon: BrainCircuit, label: 'Analisi contenuti', desc: 'Estrazione eventi e dati clinici' },
  { icon: ShieldCheck, label: 'Controllo qualità', desc: 'Verifica anomalie e coerenza' },
  { icon: FileText, label: 'Generazione report', desc: 'Report medico-legale strutturato' },
];

// --- Component ---

export function ProcessingSection({
  caseId,
  documents,
  hasProcessingDocs,
  hasUploadedDocs,
}: ProcessingSectionProps) {
  const router = useRouter();
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showReassurance, setShowReassurance] = useState(false);
  const processingStartRef = useRef<number | null>(null);

  // Count failed documents (excluding warning-only)
  const failedDocs = documents.filter((d) => {
    if (d.processing_status !== 'errore') return false;
    const err = (d.processing_error ?? '').toLowerCase();
    return !err.includes('nessun evento');
  });

  // Documents waiting for classification review
  const classificationDocs = documents.filter(
    (d) => d.processing_status === 'classificazione_completata',
  );
  const hasClassificationReview = classificationDocs.length > 0;

  const uploadedCount = documents.filter((d) => d.processing_status === 'caricato').length;

  // Reassurance timer — show message after 30s of processing
  useEffect(() => {
    if (hasProcessingDocs) {
      if (!processingStartRef.current) {
        processingStartRef.current = Date.now();
      }
      const timer = setTimeout(() => setShowReassurance(true), 30000);
      return () => clearTimeout(timer);
    } else {
      processingStartRef.current = null;
      setShowReassurance(false);
    }
  }, [hasProcessingDocs]);

  const handleStartProcessing = useCallback(async () => {
    setIsStartingProcessing(true);
    setProcessingError(null);
    try {
      const response = await fetch('/api/processing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        setProcessingError(result.error ?? 'Errore sconosciuto');
        setIsStartingProcessing(false);
        return;
      }
      router.refresh();
    } catch {
      setProcessingError('Errore di rete. Verifica la connessione.');
      setIsStartingProcessing(false);
    }
  }, [caseId, router]);

  useEffect(() => {
    if (isStartingProcessing && hasProcessingDocs) {
      setIsStartingProcessing(false);
    }
  }, [isStartingProcessing, hasProcessingDocs]);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    setShowCancelDialog(false);
    try {
      const response = await fetch('/api/processing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        toast.error(result.error ?? 'Errore durante l\'annullamento');
      }
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsCancelling(false);
    }
  }, [caseId, router]);

  const handleRetryFailed = useCallback(async () => {
    setIsRetrying(true);
    try {
      const response = await fetch('/api/processing/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string; data?: { retriedCount: number } };
      if (!result.success) {
        toast.error(result.error ?? 'Errore durante il retry');
      } else {
        toast.success(`${result.data?.retriedCount ?? 0} documenti rimessi in coda`);
      }
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsRetrying(false);
    }
  }, [caseId, router]);

  // Show classification review when pipeline is paused
  if (hasClassificationReview) {
    return (
      <div className="space-y-4">
        <ClassificationReview caseId={caseId} documents={classificationDocs} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          {hasProcessingDocs ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-center">Elaborazione in corso</p>

              <ProcessingProgress
                documents={documents.filter((d) => !['caricato'].includes(d.processing_status))}
              />

              <p className="text-sm text-muted-foreground text-center">
                L&apos;elaborazione continua in background. La pagina si aggiorna automaticamente.
              </p>

              {/* Reassurance message after 30s */}
              {showReassurance && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/80 dark:border-green-800 dark:bg-green-950/30 p-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  <p className="text-sm text-green-700 dark:text-green-400">
                    L&apos;analisi sta procedendo regolarmente. Non chiudere la pagina.
                  </p>
                </div>
              )}

              {/* Cancel link — at bottom, text-only, requires confirmation */}
              <div className="pt-2 border-t text-center">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive underline transition-colors"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={isCancelling}
                >
                  {isCancelling ? 'Annullamento in corso...' : 'Annulla elaborazione'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {hasUploadedDocs ? (
                <>
                  {/* Pipeline preview — visual stepper */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-center">
                      Cosa farà l&apos;analisi AI
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {PIPELINE_STEPS.map((step, i) => (
                        <div key={step.label} className="flex flex-col items-center gap-2 rounded-lg border border-muted p-3 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <step.icon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-medium">{i + 1}. {step.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{step.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Prominent time estimate + doc count */}
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                      <Badge variant="secondary" className="text-sm px-3 py-1">
                        {uploadedCount} {uploadedCount === 1 ? 'documento' : 'documenti'}
                      </Badge>
                      <Badge variant="outline" className="text-sm px-3 py-1">
                        <Clock className="mr-1.5 h-3.5 w-3.5" />
                        Tempo stimato: {Math.max(2, uploadedCount * 2)}-{Math.max(5, uploadedCount * 5)} min
                      </Badge>
                    </div>
                  </div>

                  {processingError && <p className="mt-1 text-sm text-destructive text-center">{processingError}</p>}

                  {/* Retry failed docs button */}
                  {failedDocs.length > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-destructive">{failedDocs.length} documenti non elaborati</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto shrink-0"
                        onClick={handleRetryFailed}
                        disabled={isRetrying}
                      >
                        {isRetrying ? (
                          <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Riprovo...</>
                        ) : (
                          <><RotateCcw className="mr-1 h-3 w-3" />Riprova documenti falliti</>
                        )}
                      </Button>
                    </div>
                  )}

                  <Button
                    size="lg"
                    className="w-full text-base py-6 bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleStartProcessing}
                    disabled={isStartingProcessing || !hasUploadedDocs}
                  >
                    {isStartingProcessing ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Avvio in corso...</>
                    ) : (
                      <><Play className="mr-2 h-5 w-5" />Avvia Elaborazione</>
                    )}
                  </Button>
                </>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nessun documento caricato. Torna al passaggio 1 per caricare i documenti.
                </p>
              ) : failedDocs.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="text-destructive">{failedDocs.length} documenti non elaborati</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto shrink-0"
                      onClick={handleRetryFailed}
                      disabled={isRetrying}
                    >
                      {isRetrying ? (
                        <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Riprovo...</>
                      ) : (
                        <><RotateCcw className="mr-1 h-3 w-3" />Riprova documenti falliti</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Tutti i documenti sono già stati elaborati.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare l&apos;elaborazione?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;elaborazione è in corso. Se annulli, i risultati parziali andranno persi e dovrai riavviare l&apos;analisi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua elaborazione</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <XCircle className="mr-1 h-4 w-4" />
              Annulla elaborazione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
