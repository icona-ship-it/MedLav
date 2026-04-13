'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Trash2, RotateCcw, Loader2, CheckCircle2, FileText,
  ImageIcon, TestTube, Stethoscope, MoreVertical, Sparkles, SplitSquareHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileUpload } from '@/components/file-upload';
import { deleteDocument, retryDocument, updateDocumentType } from '../../actions';
import { toUserMessage } from '@/lib/user-error-messages';
import { formatFileSize, getFileIcon } from '@/lib/format';
import { DOCUMENT_TYPES } from '@/lib/constants';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';
import { csrfHeaders } from '@/lib/csrf-client';
import type { Document } from './types';

// --- Types ---

interface DocumentsSectionProps {
  caseId: string;
  documents: Document[];
  processingLabels: Record<string, string>;
  hasUploadedDocs: boolean;
  onProceedToNext: () => void;
}

// --- Helpers ---

function processingVariant(status: string): 'secondary' | 'warning' | 'success' | 'destructive' {
  switch (status) {
    case 'completato': return 'success';
    case 'errore': return 'destructive';
    case 'caricato': return 'secondary';
    default: return 'warning';
  }
}

function isDocProcessing(status: string): boolean {
  return ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
}

function isPdf(fileType: string): boolean {
  return fileType === 'application/pdf';
}

// --- Component ---

export function DocumentsSection({
  caseId,
  documents,
  processingLabels,
  hasUploadedDocs,
  onProceedToNext,
}: DocumentsSectionProps) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [classifyingDocId, setClassifyingDocId] = useState<string | null>(null);
  const [classifyingAll, setClassifyingAll] = useState(false);
  const [splittingDocId, setSplittingDocId] = useState<string | null>(null);

  const handleRetryDocument = useCallback(async (docId: string) => {
    setRetryingDocId(docId);
    try {
      const result = await retryDocument({ documentId: docId, caseId });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Documento rimesso in coda');
        router.refresh();
      }
    } catch {
      toast.error('Errore durante il retry');
    } finally {
      setRetryingDocId(null);
    }
  }, [caseId, router]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeletingDoc(true);
    try {
      const result = await deleteDocument({ documentId: deleteTarget.id, caseId });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Documento eliminato');
        router.refresh();
      }
    } catch {
      toast.error('Errore durante l\'eliminazione del documento');
    } finally {
      setIsDeletingDoc(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, caseId, router]);

  const handleTypeChange = useCallback(async (docId: string, newType: string) => {
    const result = await updateDocumentType({ documentId: docId, caseId, documentType: newType });
    if (result.error) {
      toast.error(result.error);
    }
    // No success toast — instant feedback via dropdown change
  }, [caseId]);

  const handleClassifyDocument = useCallback(async (docId: string) => {
    setClassifyingDocId(docId);
    try {
      const res = await fetch('/api/processing/classify-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ documentId: docId, caseId }),
      });
      const data = await res.json() as { success: boolean; data?: { documentType: string; confidence: number }; error?: string };
      if (!data.success) {
        toast.error(data.error ?? 'Errore nella categorizzazione');
      } else {
        toast.success(`Categorizzato come: ${data.data?.documentType ?? 'sconosciuto'}`);
        router.refresh();
      }
    } catch {
      toast.error('Errore nella categorizzazione AI');
    } finally {
      setClassifyingDocId(null);
    }
  }, [caseId, router]);

  const handleSplitDocument = useCallback(async (docId: string) => {
    setSplittingDocId(docId);
    try {
      const res = await fetch('/api/processing/split-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ documentId: docId, caseId }),
      });
      const data = await res.json() as { success: boolean; data?: { resultingDocs: number; creditsCharged: number }; error?: string };
      if (!data.success) {
        toast.error(data.error ?? 'Errore nella divisione');
      } else {
        toast.success(`PDF diviso in ${data.data?.resultingDocs ?? '?'} documenti`);
        router.refresh();
      }
    } catch {
      toast.error('Errore nella divisione del PDF');
    } finally {
      setSplittingDocId(null);
    }
  }, [caseId, router]);

  const handleClassifyAll = useCallback(async () => {
    const docsToClassify = documents.filter((d) => d.processing_status === 'caricato');
    if (docsToClassify.length === 0) return;

    setClassifyingAll(true);

    // Process in batches of 3 to avoid rate limiting
    const BATCH_SIZE = 3;
    let successCount = 0;
    let errCount = 0;

    for (let i = 0; i < docsToClassify.length; i += BATCH_SIZE) {
      const batch = docsToClassify.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((doc) =>
          fetch('/api/processing/classify-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
            body: JSON.stringify({ documentId: doc.id, caseId }),
          }).then((res) => res.json() as Promise<{ success: boolean }>),
        ),
      );

      successCount += results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;
      errCount += batch.length - results.filter(
        (r) => r.status === 'fulfilled' && r.value.success,
      ).length;
    }

    if (errCount === 0) {
      toast.success(`${successCount} documenti categorizzati`);
    } else {
      toast.warning(`${successCount} categorizzati, ${errCount} con errori`);
    }

    setClassifyingAll(false);
    router.refresh();
  }, [documents, caseId, router]);

  const completedCount = documents.filter((d) => d.processing_status === 'completato').length;
  const processingCount = documents.filter((d) => isDocProcessing(d.processing_status)).length;
  const errorCount = documents.filter((d) => d.processing_status === 'errore').length;
  const readyCount = documents.filter((d) => d.processing_status === 'caricato').length;
  const uploadedDocs = documents.filter((d) => d.processing_status === 'caricato');

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">
              {documents.length === 0 ? 'Carica la documentazione clinica' : 'Aggiungi altri documenti'}
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, immagini (JPG, PNG, TIFF), documenti Word ed Excel
            </p>
          </div>

          <FileUpload caseId={caseId} onUploadStart={() => setIsUploading(true)} onUploadComplete={() => { setIsUploading(false); router.refresh(); }} />

          {documents.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border px-2.5 py-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span>Cartelle cliniche</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border px-2.5 py-2">
                <Stethoscope className="h-3.5 w-3.5 shrink-0 text-green-500" />
                <span>Referti medici</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border px-2.5 py-2">
                <TestTube className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                <span>Esami laboratorio</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border px-2.5 py-2">
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                <span>Immagini diagnostiche</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents list with inline type selection + AI actions */}
      {documents.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Header with counts + batch AI classify */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {documents.length} {documents.length === 1 ? 'documento' : 'documenti'}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {completedCount > 0 && (
                    <Badge variant="success" className="text-xs">
                      {completedCount} {completedCount === 1 ? 'completato' : 'completati'}
                    </Badge>
                  )}
                  {processingCount > 0 && (
                    <Badge variant="warning" className="text-xs">
                      {processingCount} in elaborazione
                    </Badge>
                  )}
                  {readyCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {readyCount} {readyCount === 1 ? 'pronto' : 'pronti'}
                    </Badge>
                  )}
                  {errorCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {errorCount} con {errorCount === 1 ? 'errore' : 'errori'}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Batch classify button */}
              {uploadedDocs.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClassifyAll}
                  disabled={classifyingAll || classifyingDocId !== null}
                  className="shrink-0"
                >
                  {classifyingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5">
                    {classifyingAll ? 'Categorizzazione...' : `Categorizza tutti con AI`}
                  </span>
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                    {uploadedDocs.length * CREDIT_COSTS.categorizzazione} cr
                  </Badge>
                </Button>
              )}
            </div>

            {/* Document cards with inline type + actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {documents.map((doc) => {
                const Icon = getFileIcon(doc.file_type);
                const canDelete = !isDocProcessing(doc.processing_status);
                const isUploaded = doc.processing_status === 'caricato';
                const isComplete = doc.processing_status === 'completato';
                const isError = doc.processing_status === 'errore';
                const isClassifying = classifyingDocId === doc.id;
                return (
                  <div
                    key={doc.id}
                    className={`rounded-lg border p-3 space-y-2 ${
                      isComplete ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' :
                      isError ? 'border-destructive/30 bg-destructive/5' : ''
                    }`}
                  >
                    {/* Row 1: Icon + name + size + status + menu */}
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={doc.file_name}>{doc.file_name}</p>
                        <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                      </div>

                      {/* Status badges */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isUploaded && <Badge variant="secondary" className="text-xs">Pronto</Badge>}
                        {!isUploaded && !isComplete && !isError && (
                          <Badge variant={processingVariant(doc.processing_status)} className="text-xs">
                            {processingLabels[doc.processing_status] ?? doc.processing_status}
                          </Badge>
                        )}
                        {isError && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive"
                            onClick={() => handleRetryDocument(doc.id)}
                            disabled={retryingDocId === doc.id}
                          >
                            {retryingDocId === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                            <span className="ml-1">Riprova</span>
                          </Button>
                        )}
                      </div>

                      {/* Actions menu */}
                      {canDelete && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isUploaded && (
                              <DropdownMenuItem
                                onClick={() => handleClassifyDocument(doc.id)}
                                disabled={isClassifying || classifyingAll}
                              >
                                {isClassifying ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5 mr-2" />
                                )}
                                Categorizza con AI
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {CREDIT_COSTS.categorizzazione} cr
                                </span>
                              </DropdownMenuItem>
                            )}
                            {isUploaded && isPdf(doc.file_type) && (
                              <DropdownMenuItem
                                onClick={() => handleSplitDocument(doc.id)}
                                disabled={splittingDocId === doc.id}
                              >
                                {splittingDocId === doc.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                                ) : (
                                  <SplitSquareHorizontal className="h-3.5 w-3.5 mr-2" />
                                )}
                                {splittingDocId === doc.id ? 'Divisione in corso...' : 'Dividi PDF'}
                                <span className="ml-auto text-xs text-muted-foreground">
                                  {CREDIT_COSTS.split_pdf} cr/parte
                                </span>
                              </DropdownMenuItem>
                            )}
                            {isUploaded && <DropdownMenuSeparator />}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget({ id: doc.id, name: doc.file_name })}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Elimina
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Row 2: Inline type dropdown (only for uploaded/ready docs) */}
                    {(isUploaded || isComplete) && (
                      <Select
                        value={doc.document_type ?? 'altro'}
                        onValueChange={(value) => handleTypeChange(doc.id, value)}
                      >
                        <SelectTrigger className="w-full h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((dt) => (
                            <SelectItem key={dt.value} value={dt.value}>
                              {dt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Error message */}
                    {isError && doc.processing_error && (
                      <p className="text-xs text-destructive">{toUserMessage(doc.processing_error)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proceed button — sticky footer */}
      {hasUploadedDocs && !isUploading && (
        <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t px-4 py-3 mt-6 -mx-4">
          <Button
            size="lg"
            className="w-full text-base py-6"
            variant="default"
            onClick={onProceedToNext}
          >
            Ho caricato tutti i documenti — Prosegui
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare &quot;{deleteTarget?.name}&quot;. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingDoc}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeletingDoc}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingDoc ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
