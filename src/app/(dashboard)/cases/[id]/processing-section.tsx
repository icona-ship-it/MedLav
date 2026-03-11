'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Loader2, XCircle,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ProcessingProgress } from '@/components/processing-progress';
import { PeriziaMetadataForm } from './perizia-form';
import type { CaseData, Document } from './types';

// --- Types ---

interface ProcessingSectionProps {
  caseId: string;
  caseData: CaseData;
  documents: Document[];
  hasProcessingDocs: boolean;
  hasUploadedDocs: boolean;
}

// --- Component ---

export function ProcessingSection({
  caseId,
  caseData,
  documents,
  hasProcessingDocs,
  hasUploadedDocs,
}: ProcessingSectionProps) {
  const router = useRouter();
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const hasPeriziaMetadata = !!(caseData.perizia_metadata && Object.keys(caseData.perizia_metadata).length > 0);
  const [periziaOpen, setPeriziaOpen] = useState(!hasPeriziaMetadata);

  const handleStartProcessing = useCallback(async () => {
    setIsStartingProcessing(true);
    setProcessingError(null);
    try {
      const response = await fetch('/api/processing/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div className="space-y-4">
      {/* Perizia form (collapsible, before processing) */}
      {!hasProcessingDocs && (
        <Collapsible open={periziaOpen} onOpenChange={setPeriziaOpen}>
          <Card>
            <CardHeader className="pb-3">
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between text-left">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Dati Perizia</CardTitle>
                    <span className="text-xs text-muted-foreground">(opzionale, migliora il report)</span>
                    {hasPeriziaMetadata && (
                      <Badge variant="success" className="text-xs">Compilato</Badge>
                    )}
                  </div>
                  {periziaOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <PeriziaMetadataForm caseId={caseId} caseData={caseData} onSaved={() => router.refresh()} />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Card>
        <CardContent className="pt-6">
          {hasProcessingDocs ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Elaborazione in corso</p>
                <Button variant="destructive" size="sm" onClick={handleCancel} disabled={isCancelling}>
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
              <div className="flex items-center justify-between">
                <div>
                  {hasUploadedDocs ? (
                    <p className="text-sm text-muted-foreground">
                      {documents.filter((d) => d.processing_status === 'caricato').length} documenti pronti per l&apos;elaborazione.
                    </p>
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
                <Button onClick={handleStartProcessing} disabled={isStartingProcessing || !hasUploadedDocs}>
                  {isStartingProcessing ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Avvio...</>
                  ) : (
                    <><Play className="mr-2 h-4 w-4" />Avvia Elaborazione</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground italic">
                L&apos;analisi richiede in genere 2-5 minuti per documento.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
