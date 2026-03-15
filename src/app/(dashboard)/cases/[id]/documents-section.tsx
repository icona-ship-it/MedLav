'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Trash2, RotateCcw, Loader2, CheckCircle2, Upload, FileText, ImageIcon, TestTube, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileUpload } from '@/components/file-upload';
import { deleteDocument, retryDocument } from '../../actions';
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

  const uploadedCount = documents.filter((d) => d.processing_status === 'caricato').length;

  return (
    <div className="space-y-4">
      {/* Upload area */}
      {documents.length === 0 ? (
        /* Empty state — guided first experience */
        <Card className="border-2 border-dashed border-primary/30">
          <CardContent className="pt-8 pb-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Carica la documentazione clinica</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Trascina i file qui o clicca per selezionarli
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-left w-full max-w-sm">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                  <span>Cartelle cliniche</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Stethoscope className="h-4 w-4 shrink-0 text-green-500" />
                  <span>Referti medici</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TestTube className="h-4 w-4 shrink-0 text-purple-500" />
                  <span>Esami di laboratorio</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-4 w-4 shrink-0 text-orange-500" />
                  <span>Immagini diagnostiche</span>
                </div>
              </div>
              <div className="w-full max-w-md mt-2">
                <FileUpload caseId={caseId} onUploadComplete={() => router.refresh()} />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Carica Documentazione</CardTitle>
          </CardHeader>
          <CardContent>
            <FileUpload caseId={caseId} onUploadComplete={() => router.refresh()} />
          </CardContent>
        </Card>
      )}

      {/* Documents list — show all (capped at 20) */}
      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Documenti Caricati</span>
              <Badge variant="secondary">{documents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documents.slice(0, 20).map((doc) => {
                const Icon = getFileIcon(doc.file_type);
                const canDelete = !isDocProcessing(doc.processing_status);
                const isUploaded = doc.processing_status === 'caricato';
                const isComplete = doc.processing_status === 'completato';
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                      isComplete ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{doc.file_name}</p>
                          {doc.document_type && doc.document_type !== 'altro' && (
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                              {documentTypeLabels[doc.document_type] ?? doc.document_type}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        {!isUploaded && !isComplete && (
                          <Badge variant={processingVariant(doc.processing_status)}>
                            {processingLabels[doc.processing_status] ?? doc.processing_status}
                          </Badge>
                        )}
                        {isUploaded && (
                          <Badge variant="secondary">Pronto</Badge>
                        )}
                        {doc.processing_status === 'errore' && doc.processing_error && (
                          <p className="mt-1 text-xs text-destructive max-w-[200px]">{doc.processing_error}</p>
                        )}
                        {doc.processing_status === 'errore' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-6 px-2 text-xs"
                            onClick={() => handleRetryDocument(doc.id)}
                            disabled={retryingDocId === doc.id}
                          >
                            {retryingDocId === doc.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-1 h-3 w-3" />
                            )}
                            Riprova
                          </Button>
                        )}
                      </div>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget({ id: doc.id, name: doc.file_name })}
                          disabled={isDeletingDoc}
                          title="Elimina documento"
                          aria-label={`Elimina documento ${doc.file_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {documents.length > 20 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  ...e altri {documents.length - 20} documenti
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sticky footer — "Prosegui" always visible at bottom */}
      {hasUploadedDocs && (
        <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t px-4 py-3 mt-6 -mx-4">
          <Button
            size="lg"
            className="w-full text-base py-6 bg-green-600 hover:bg-green-700 text-white"
            onClick={onProceedToNext}
          >
            Ho caricato tutto — Prosegui
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-1">
            {uploadedCount} {uploadedCount === 1 ? 'documento pronto' : 'documenti pronti'}
          </p>
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
