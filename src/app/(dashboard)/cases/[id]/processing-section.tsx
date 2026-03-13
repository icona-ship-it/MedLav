'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Loader2, XCircle, RotateCcw, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={handleCancel} disabled={isCancelling}>
                  {isCancelling ? (
                    <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Annullamento...</>
                  ) : (
                    <><XCircle className="mr-2 h-3 w-3" />Annulla elaborazione</>
                  )}
                </Button>
              </div>
              <ProcessingProgress
                documents={documents.filter((d) => !['caricato'].includes(d.processing_status))}
              />
              <p className="text-sm text-muted-foreground">
                L&apos;elaborazione continua in background. La pagina si aggiorna automaticamente.
              </p>
              <p className="text-xs text-muted-foreground italic">
                L&apos;analisi richiede in genere 2-5 minuti per documento.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                {hasUploadedDocs ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {documents.filter((d) => d.processing_status === 'caricato').length} documenti pronti per l&apos;elaborazione.
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      Tutto pronto! Clicca per avviare l&apos;analisi AI dei tuoi documenti.
                    </p>
                  </>
                ) : documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessun documento caricato. Torna al passaggio 1 per caricare i documenti.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Tutti i documenti sono già stati elaborati.
                  </p>
                )}
                {processingError && <p className="mt-1 text-sm text-destructive">{processingError}</p>}
              </div>

              {/* Retry failed docs button */}
              {failedDocs.length > 0 && !hasUploadedDocs && (
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
              <p className="text-xs text-muted-foreground italic text-center">
                L&apos;analisi richiede in genere 2-5 minuti per documento.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
