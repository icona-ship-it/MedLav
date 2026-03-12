'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Trash2, RotateCcw, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  return ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
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

  const handleDeleteDocument = useCallback((docId: string, fileName: string) => {
    toast(`Eliminare "${fileName}"?`, {
      action: {
        label: 'Elimina',
        onClick: () => {
          setIsDeletingDoc(true);
          deleteDocument({ documentId: docId, caseId })
            .then((result) => {
              if (result.error) {
                toast.error(result.error);
              } else {
                toast.success('Documento eliminato');
                router.refresh();
              }
            })
            .catch(() => {
              toast.error('Errore durante l\'eliminazione del documento');
            })
            .finally(() => {
              setIsDeletingDoc(false);
            });
        },
      },
      cancel: { label: 'Annulla', onClick: () => {} },
    });
  }, [caseId, router]);

  const uploadedCount = documents.filter((d) => d.processing_status === 'caricato').length;

  return (
    <div className="space-y-4">
      {/* Prosegui button — at top, always visible when docs uploaded */}
      {hasUploadedDocs && (
        <Button
          size="lg"
          className="w-full text-base py-6 bg-green-600 hover:bg-green-700 text-white"
          onClick={onProceedToNext}
        >
          Prosegui con {uploadedCount} {uploadedCount === 1 ? 'documento' : 'documenti'}
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      )}

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle>Carica Documentazione</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUpload caseId={caseId} onUploadComplete={() => router.refresh()} />
        </CardContent>
      </Card>

      {/* Documents list — single column */}
      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Documenti Caricati</span>
              <Badge variant="secondary">{documents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`space-y-2 ${documents.length > 6 ? 'max-h-[400px] overflow-y-auto pr-1' : ''}`}>
              {documents.map((doc) => {
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
                          onClick={() => handleDeleteDocument(doc.id, doc.file_name)}
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
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
