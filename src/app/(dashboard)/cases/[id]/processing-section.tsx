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
// Classification review removed — now handled by Document Organizer (Pro) or skipped
import { csrfHeaders } from '@/lib/csrf-client';
import { toUserMessage } from '@/lib/user-error-messages';
import type { Document } from './types';

// --- Types ---

interface ProcessingSectionProps {
  caseId: string;
  documents: Document[];
  hasProcessingDocs: boolean;
  hasUploadedDocs: boolean;
  processingStage?: string;
  lastError?: string;
}

// --- Pipeline steps preview ---

const PIPELINE_STEPS = [
  { icon: FileSearch, label: 'Lettura documenti', desc: 'Acquisizione testo dai documenti caricati' },
  { icon: BrainCircuit, label: 'Analisi clinica', desc: 'Estrazione eventi e dati clinici' },
  { icon: ShieldCheck, label: 'Verifica completezza', desc: 'Controllo anomalie e coerenza documentale' },
  { icon: FileText, label: 'Generazione report', desc: 'Report medico-legale strutturato' },
];

// --- Component ---

export function ProcessingSection({
  caseId,
  documents,
  hasProcessingDocs,
  hasUploadedDocs,
  processingStage,
  lastError,
}: ProcessingSectionProps) {
  const router = useRouter();
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const processingStartRef = useRef<number | null>(null);

  // Count failed documents (excluding warning-only)
  const failedDocs = documents.filter((d) => {
    if (d.processing_status !== 'errore') return false;
    const err = (d.processing_error ?? '').toLowerCase();
    return !err.includes('nessun evento');
  });

  const uploadedCount = documents.filter((d) => d.processing_status === 'caricato').length;

  // Track processing start time
  useEffect(() => {
    if (hasProcessingDocs) {
      if (!processingStartRef.current) {
        processingStartRef.current = Date.now();
      }
    } else {
      processingStartRef.current = null;
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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          {hasProcessingDocs ? (
            <div className="space-y-4">
              {/* Big progress indicator */}
              {(() => {
                const processingDocs = documents.filter((d) => !['caricato'].includes(d.processing_status));
                const completedCount = processingDocs.filter((d) => d.processing_status === 'completato' || d.processing_status === 'errore').length;
                const totalCount = processingDocs.length;
                const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                return (
                  <div className="space-y-3">
                    <p className="text-base font-semibold text-center">
                      Elaborazione in corso — {completedCount}/{totalCount} documenti
                    </p>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              <ProcessingProgress
                documents={documents.filter((d) => !['caricato'].includes(d.processing_status))}
              />

              <p className="text-sm text-muted-foreground text-center">
                L&apos;elaborazione continua in background. La pagina si aggiorna automaticamente.
              </p>

              {/* Reassurance message — always visible during processing */}
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/80 dark:border-green-800 dark:bg-green-950/30 p-3">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-400">
                  L&apos;analisi continua anche se chiudi questa pagina. Riceverai un&apos;email al completamento.
                </p>
              </div>

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
                  {/* Error/warning banners — shown first so user sees them immediately */}
                  {processingError && <p className="text-sm text-destructive text-center">{processingError}</p>}

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
                        Tempo stimato: ~{Math.max(2, documents.length * 2)} minuti per {documents.length} {documents.length === 1 ? 'documento' : 'documenti'}
                      </Badge>
                    </div>
                  </div>

                  {/* Sticky action bar */}
                  <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t px-4 py-3 mt-6 -mx-4">
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
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Puoi avviare fino a 5 elaborazioni contemporaneamente.
                    </p>
                  </div>
                </>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nessun documento caricato. Torna al passaggio 1 per caricare i documenti.
                </p>
              ) : failedDocs.length > 0 || processingStage === 'errore' ? (
                <div className="space-y-3">
                  {/* Pipeline-level error message */}
                  {processingStage === 'errore' && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-destructive">Elaborazione non riuscita</p>
                          <p className="text-sm text-muted-foreground">
                            {lastError ? toUserMessage(lastError) : 'Si è verificato un errore durante l\'elaborazione. Riprova.'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Se il problema persiste, prova a rimuovere eventuali documenti corrotti o protetti da password e riavvia l&apos;analisi.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Failed documents detail */}
                  {failedDocs.length > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-destructive">{failedDocs.length} {failedDocs.length === 1 ? 'documento non elaborato' : 'documenti non elaborati'}</span>
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
                          <><RotateCcw className="mr-1 h-3 w-3" />Riprova</>
                        )}
                      </Button>
                    </div>
                  )}
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
