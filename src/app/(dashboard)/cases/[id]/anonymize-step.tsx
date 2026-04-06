'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Copy, Download, FileText, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { csrfHeaders } from '@/lib/csrf-client';
import { toUserMessage } from '@/lib/user-error-messages';
import { anonymizeCaseDocuments } from '../../anonymize-actions';
import type { Document } from './types';

// --- Types ---

interface AnonymizeStepProps {
  caseId: string;
  documents: Document[];
  processingStage?: string;
}

// --- Component ---

export function AnonymizeStep({ caseId, documents, processingStage }: AnonymizeStepProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isStartingOcr, setIsStartingOcr] = useState(false);
  const [anonymizedText, setAnonymizedText] = useState<string | null>(null);
  const [replacementCount, setReplacementCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ocrReadyDocs = documents.filter(
    (d) => d.processing_status === 'completato',
  );
  const hasOcrDocs = ocrReadyDocs.length > 0;
  const allDocsReady = documents.length > 0 && ocrReadyDocs.length === documents.length;
  const isProcessing = processingStage === 'elaborazione';
  const pendingDocs = documents.filter(
    (d) => d.processing_status === 'caricato',
  );
  const needsOcr = pendingDocs.length > 0 && !isProcessing;

  const handleStartOcr = useCallback(async () => {
    setIsStartingOcr(true);
    setError(null);
    try {
      const res = await fetch('/api/processing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) {
        toast.success('Elaborazione OCR avviata');
        router.refresh();
      } else {
        const msg = toUserMessage(data.error ?? 'Errore avvio OCR');
        setError(msg);
        toast.error(msg);
      }
    } catch {
      setError('Errore di rete durante l\'avvio dell\'OCR');
      toast.error('Errore di rete');
    } finally {
      setIsStartingOcr(false);
    }
  }, [caseId, router]);

  const handleAnonymize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await anonymizeCaseDocuments(caseId);
      if (result.success && result.anonymizedText) {
        setAnonymizedText(result.anonymizedText);
        setReplacementCount(result.replacementCount ?? 0);
        toast.success(`Anonimizzazione completata: ${result.replacementCount ?? 0} sostituzioni`);
      } else {
        setError(result.error ?? 'Errore durante l\'anonimizzazione');
        toast.error(result.error ?? 'Errore durante l\'anonimizzazione');
      }
    } catch {
      setError('Errore imprevisto durante l\'anonimizzazione');
      toast.error('Errore imprevisto durante l\'anonimizzazione');
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  const handleCopy = useCallback(async () => {
    if (!anonymizedText) return;
    await navigator.clipboard.writeText(anonymizedText);
    toast.success('Testo anonimizzato copiato negli appunti');
  }, [anonymizedText]);

  const handleDownload = useCallback(() => {
    if (!anonymizedText) return;
    const blob = new Blob([anonymizedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `documenti-anonimizzati-${caseId.slice(0, 8)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Documento anonimizzato scaricato');
  }, [anonymizedText, caseId]);

  return (
    <div className="space-y-4">
      {/* Document list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Anonimizzazione documenti
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Rileva e sostituisce automaticamente i dati personali (nomi, codici fiscali, date, indirizzi, ecc.)
            nel testo OCR dei documenti caricati.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Document summary */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Documenti caricati:</p>
            <div className="space-y-1.5">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="text-sm flex-1 truncate">{doc.file_name}</span>
                  <Badge
                    variant={
                      doc.processing_status === 'completato'
                        ? 'default'
                        : doc.processing_status === 'caricato'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {doc.processing_status === 'completato'
                      ? 'OCR pronto'
                      : doc.processing_status === 'caricato'
                        ? 'In attesa OCR'
                        : doc.processing_status === 'ocr_in_corso' || doc.processing_status === 'in_coda'
                          ? 'OCR in corso...'
                          : doc.processing_status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* OCR needed warning */}
          {needsOcr && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {pendingDocs.length} {pendingDocs.length === 1 ? 'documento richiede' : 'documenti richiedono'} l&apos;elaborazione
              OCR prima di poter procedere con l&apos;anonimizzazione.
            </div>
          )}

          {/* Processing in progress */}
          {isProcessing && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              Elaborazione OCR in corso... La pagina si aggiornera automaticamente.
            </div>
          )}

          {documents.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun documento caricato. Torna al passaggio precedente per caricare i documenti.
            </p>
          )}

          {/* Action buttons */}
          {documents.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {/* OCR button — shown when docs need processing */}
              {needsOcr && (
                <Button
                  variant="secondary"
                  onClick={handleStartOcr}
                  disabled={isStartingOcr}
                >
                  {isStartingOcr ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      Avvio OCR...
                    </>
                  ) : (
                    <>
                      <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      Avvia OCR documenti
                    </>
                  )}
                </Button>
              )}

              {/* Anonymize button */}
              <Button
                onClick={handleAnonymize}
                disabled={isLoading || !hasOcrDocs || isProcessing}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                    Anonimizzazione in corso...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {allDocsReady ? 'Anonimizza tutti i documenti' : hasOcrDocs ? `Anonimizza ${ocrReadyDocs.length} documenti pronti` : 'Anonimizza'}
                  </>
                )}
              </Button>

              {anonymizedText && (
                <>
                  <Button variant="outline" onClick={handleCopy}>
                    <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Copia testo
                  </Button>
                  <Button variant="outline" onClick={handleDownload}>
                    <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Scarica .txt
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anonymized text preview */}
      {anonymizedText && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Testo anonimizzato
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {replacementCount} {replacementCount === 1 ? 'sostituzione effettuata' : 'sostituzioni effettuate'}
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/20 p-4 max-h-[60vh] overflow-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                {anonymizedText}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
