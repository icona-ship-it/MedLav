'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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

export interface ClassificationProgress {
  completed: number;
  total: number;
  errors: number;
  status: 'running' | 'done';
  startedAt?: string;
  completedAt?: string;
}

/**
 * Format an estimated-time-remaining for the classification progress bar.
 * Returns null if we can't estimate yet (just started, nothing completed).
 */
function formatEta(progress: ClassificationProgress, nowMs: number): string | null {
  if (!progress.startedAt || progress.completed <= 0 || progress.completed >= progress.total) {
    return null;
  }
  const startMs = new Date(progress.startedAt).getTime();
  if (Number.isNaN(startMs)) return null;
  const elapsedMs = nowMs - startMs;
  if (elapsedMs <= 0) return null;
  const perDocMs = elapsedMs / progress.completed;
  const remaining = progress.total - progress.completed;
  const etaMs = Math.max(0, Math.round(perDocMs * remaining));
  if (etaMs < 1000) return 'pochi secondi';
  const etaSec = Math.round(etaMs / 1000);
  if (etaSec < 60) return `~${etaSec} sec rimanenti`;
  const minutes = Math.floor(etaSec / 60);
  const seconds = etaSec % 60;
  if (minutes >= 10) return `~${minutes} min rimanenti`;
  return `~${minutes} min ${seconds.toString().padStart(2, '0')} sec rimanenti`;
}

interface DocumentsSectionProps {
  caseId: string;
  documents: Document[];
  processingLabels: Record<string, string>;
  hasUploadedDocs: boolean;
  onProceedToNext: () => void;
  classificationProgress?: ClassificationProgress | null;
  /** Notifies the parent that "Categorizza tutti" was dispatched, so polling
   * starts immediately (the server takes seconds to write the first progress). */
  onClassificationStarted?: () => void;
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
  classificationProgress,
  onClassificationStarted,
}: DocumentsSectionProps) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [classifyingDocId, setClassifyingDocId] = useState<string | null>(null);
  const [classifyingAll, setClassifyingAll] = useState(false);
  const [splittingDocId, setSplittingDocId] = useState<string | null>(null);
  // True between the "Categorizza tutti" dispatch and the FIRST server-side
  // progress write: the user must see feedback INSTANTLY, not after ~10s.
  const [classifyStarting, setClassifyStarting] = useState(false);
  useEffect(() => {
    if (classificationProgress?.status === 'running' || classificationProgress?.status === 'done') {
      setClassifyStarting(false);
    }
  }, [classificationProgress?.status]);

  // Ticker for live-updating ETA between polls
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (classificationProgress?.status !== 'running') return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [classificationProgress?.status]);

  // Auto-refresh once when classification completes, so the page reflects the final state
  // (classified types, counts, toast). Guard with a ref so we refresh only on transition.
  const wasRunningRef = useRef(false);
  useEffect(() => {
    const isRunning = classificationProgress?.status === 'running';
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = isRunning;
    if (wasRunning && classificationProgress?.status === 'done') {
      const errors = classificationProgress.errors ?? 0;
      const ok = classificationProgress.completed - errors;
      if (errors === 0) {
        toast.success(`Categorizzazione completata: ${ok} documenti`);
      } else {
        toast.warning(`Categorizzazione completata: ${ok} riusciti, ${errors} con errori`);
      }
      router.refresh();
    }
  }, [classificationProgress?.status, classificationProgress?.completed, classificationProgress?.errors, router]);

  const eta = classificationProgress && classificationProgress.status === 'running'
    ? formatEta(classificationProgress, nowTick)
    : null;

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
        toast.success(`Categorizzato come: ${DOCUMENT_TYPES.find((t) => t.value === data.data?.documentType)?.label ?? data.data?.documentType ?? 'sconosciuto'}`);
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

    try {
      const res = await fetch('/api/processing/classify-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          caseId,
          documentIds: docsToClassify.map((d) => d.id),
        }),
      });
      const data = await res.json() as { success: boolean; error?: string };

      if (!data.success) {
        toast.error(data.error ?? 'Errore nell\'avvio della categorizzazione');
        setClassifyingAll(false);
        return;
      }

      toast.success('Categorizzazione AI avviata in background');
      // Instant local feedback + kick the parent's polling: the server takes
      // a few seconds to write the first classificationProgress, and without
      // the kickoff the polling condition would never turn on.
      setClassifyStarting(true);
      onClassificationStarted?.();
      router.refresh();
    } catch {
      toast.error('Errore nell\'avvio della categorizzazione');
    }

    setClassifyingAll(false);
  }, [documents, caseId, router, onClassificationStarted]);

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

              {/* Batch classify button / progress */}
              {uploadedDocs.length > 0 && !classifyingAll && classificationProgress?.status !== 'running' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClassifyAll}
                  disabled={classifyingDocId !== null}
                  className="shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Categorizza tutti con AI</span>
                  <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                    {uploadedDocs.length * CREDIT_COSTS.categorizzazione} crediti
                  </Badge>
                </Button>
              )}
            </div>

            {/* Instant feedback between dispatch and the first server progress
                write — without this the user stares at a static page for ~10s */}
            {classifyStarting && classificationProgress?.status !== 'running' && (
              <div className="rounded-lg border bg-primary/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span className="text-sm font-medium">Categorizzazione AI in avvio…</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-1/12 rounded-full bg-primary animate-pulse" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Tra pochi secondi vedrai l&apos;avanzamento documento per documento.
                </p>
              </div>
            )}

            {/* Classify progress bar (from Inngest via perizia_metadata) */}
            {classificationProgress && classificationProgress.status === 'running' && (
              <div className="rounded-lg border bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    <span className="text-sm font-medium">
                      Categorizzazione AI: {classificationProgress.completed} di {classificationProgress.total}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ({Math.round((classificationProgress.completed / classificationProgress.total) * 100)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {eta && (
                      <span className="text-muted-foreground tabular-nums">{eta}</span>
                    )}
                    {classificationProgress.errors > 0 && (
                      <span className="text-destructive">
                        {classificationProgress.errors} {classificationProgress.errors === 1 ? 'errore' : 'errori'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.round((classificationProgress.completed / classificationProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Analisi in corso — puoi chiudere questa pagina, la categorizzazione continua in background.
                </p>
              </div>
            )}
            {classificationProgress && classificationProgress.status === 'done' && (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-800 dark:text-green-200">
                Categorizzazione completata: {classificationProgress.completed - classificationProgress.errors} di {classificationProgress.total} documenti categorizzati
                {classificationProgress.errors > 0 && `, ${classificationProgress.errors} con errori`}
              </div>
            )}

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
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Azioni documento" aria-label="Azioni documento">
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
                                  {CREDIT_COSTS.categorizzazione} crediti
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
                                  {CREDIT_COSTS.split_pdf} crediti/parte
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
                      <>
                      <p className="text-xs font-medium text-foreground mt-2">Categoria del documento — scegli o usa l&apos;AI</p>
                      <Select
                        value={doc.document_type ?? 'altro'}
                        onValueChange={(value) => handleTypeChange(doc.id, value)}
                      >
                        <SelectTrigger className="w-full h-10 text-sm" aria-label="Categoria del documento">
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
                      </>
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
