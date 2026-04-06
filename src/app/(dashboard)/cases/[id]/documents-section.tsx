'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Trash2, RotateCcw, Loader2, CheckCircle2, FileText, ImageIcon, TestTube, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileUpload } from '@/components/file-upload';
import { deleteDocument, retryDocument } from '../../actions';
import { toUserMessage } from '@/lib/user-error-messages';
import { formatFileSize, getFileIcon } from '@/lib/format';
import { documentTypeLabels } from '@/lib/constants';
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
  return ['in_coda', 'ocr_in_corso', 'classificazione_completata', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
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

  const completedCount = documents.filter((d) => d.processing_status === 'completato').length;
  const processingCount = documents.filter((d) => isDocProcessing(d.processing_status)).length;
  const errorCount = documents.filter((d) => d.processing_status === 'errore').length;
  const readyCount = documents.filter((d) => d.processing_status === 'caricato').length;

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

      {/* Documents list — hidden during upload to avoid visual repetition */}
      {documents.length > 0 && !isUploading && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-center">
                {documents.length} {documents.length === 1 ? 'documento' : 'documenti'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {documents.slice(0, 30).map((doc) => {
                const Icon = getFileIcon(doc.file_type);
                const canDelete = !isDocProcessing(doc.processing_status);
                const isUploaded = doc.processing_status === 'caricato';
                const isComplete = doc.processing_status === 'completato';
                const isError = doc.processing_status === 'errore';
                return (
                  <div
                    key={doc.id}
                    className={`rounded-lg border p-3 space-y-2 ${
                      isComplete ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' :
                      isError ? 'border-destructive/30 bg-destructive/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={doc.file_name}>{doc.file_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                          {doc.document_type && doc.document_type !== 'altro' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {documentTypeLabels[doc.document_type] ?? doc.document_type}
                            </Badge>
                          )}
                        </div>
                      </div>
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
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget({ id: doc.id, name: doc.file_name })}
                            disabled={isDeletingDoc}
                            aria-label={`Elimina ${doc.file_name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isError && doc.processing_error && (
                      <p className="text-xs text-destructive">{toUserMessage(doc.processing_error)}</p>
                    )}
                  </div>
                );
              })}
              {documents.length > 30 && (
                <p className="text-xs text-muted-foreground text-center py-1 col-span-2">
                  ...e altri {documents.length - 30} documenti
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proceed button — sticky footer, always visible when docs uploaded */}
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
