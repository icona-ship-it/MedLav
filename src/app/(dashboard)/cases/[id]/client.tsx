'use client';

import { useState, useEffect, useCallback, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Play, Loader2, AlertTriangle,
  FileWarning, Trash2, Pencil,
  XCircle, ArrowLeft, Archive, RotateCcw,
  CheckCircle2, Search, FileText, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { FileUpload } from '@/components/file-upload';
import { ProcessingProgress } from '@/components/processing-progress';
import { CompletenessIndicator } from '@/components/completeness-indicator';
import {
  deleteDocument, deleteCase, updateCaseStatus,
} from '../../actions';
import {
  caseTypeLabels, anomalyTypeLabels,
} from '@/lib/constants';
import { formatDate, formatFileSize, getFileIcon } from '@/lib/format';
import { EditCaseDialog } from './edit-case-dialog';
import { EventsTab } from './events-tab';
import { ReportTab } from './report-tab';
import { PeriziaMetadataForm } from './perizia-form';
import type {
  CaseData, Document, EventRow, AnomalyRow, MissingDocRow, ReportRow,
} from './types';

// --- Types ---

interface CaseDetailClientProps {
  caseId: string;
  caseData: CaseData;
  documents: Document[];
  events: EventRow[];
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  report: ReportRow | null;
  processingLabels: Record<string, string>;
  eventImages: Record<string, string[]>;
}

// --- Constants ---

const POLL_INTERVAL_MS = 5000;

const WIZARD_STEPS = [
  { number: 1, label: 'Documenti' },
  { number: 2, label: 'Elaborazione' },
  { number: 3, label: 'Risultati' },
] as const;

// --- Helpers ---

function processingVariant(status: string): 'secondary' | 'warning' | 'success' | 'destructive' {
  switch (status) {
    case 'completato': return 'success';
    case 'errore': return 'destructive';
    case 'caricato': return 'secondary';
    default: return 'warning';
  }
}

function severityVariant(severity: string): 'destructive' | 'warning' | 'secondary' {
  switch (severity) {
    case 'critica': case 'alta': return 'destructive';
    case 'media': return 'warning';
    default: return 'secondary';
  }
}

function isDocProcessing(status: string): boolean {
  return ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(status);
}

function computeAutoStep(hasResults: boolean, hasProcessingDocs: boolean): number {
  if (hasResults && !hasProcessingDocs) return 3;
  if (hasProcessingDocs) return 2;
  return 1;
}

// --- Main Component ---

export function CaseDetailClient({
  caseId,
  caseData,
  documents: initialDocuments,
  events,
  anomalies,
  missingDocs,
  report,
  processingLabels,
  eventImages,
}: CaseDetailClientProps) {
  const router = useRouter();
  const [isStartingProcessing, setIsStartingProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [editCaseOpen, setEditCaseOpen] = useState(false);
  const [deleteCaseOpen, setDeleteCaseOpen] = useState(false);
  const [isDeletingCase, startDeleteCase] = useTransition();
  const [isArchiving, startArchiving] = useTransition();
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ type: string; id: string; title: string; excerpt: string; date: string | null }> | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Wizard step
  const hasProcessingDocs = initialDocuments.some((d) => isDocProcessing(d.processing_status));
  const hasUploadedDocs = initialDocuments.some((d) => d.processing_status === 'caricato');
  const hasResults = events.length > 0 || anomalies.length > 0 || !!report;

  const autoStep = computeAutoStep(hasResults, hasProcessingDocs);
  const [activeStep, setActiveStep] = useState(autoStep);

  useEffect(() => {
    setActiveStep(computeAutoStep(hasResults, hasProcessingDocs));
  }, [hasResults, hasProcessingDocs]);

  const isArchived = caseData.status === 'archiviato';

  useEffect(() => {
    if (!hasProcessingDocs) return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasProcessingDocs, router]);

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

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch('/api/processing/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        toast.error(result.error ?? 'Errore rigenerazione');
      }
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsRegenerating(false);
    }
  }, [caseId, router]);

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

  // Debounced search
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.trim().length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const response = await fetch(
          `/api/cases/${caseId}/search?q=${encodeURIComponent(q.trim())}`,
          { signal: controller.signal },
        );
        const result = await response.json() as { success: boolean; data?: { results: Array<{ type: string; id: string; title: string; excerpt: string; date: string | null }> } };
        if (result.success && result.data) {
          setSearchResults(result.data.results);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [caseId]);

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

  const handleDeleteCase = useCallback(() => {
    startDeleteCase(async () => {
      const result = await deleteCase(caseId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push('/');
    });
  }, [caseId, router]);

  const handleArchiveToggle = useCallback(() => {
    startArchiving(async () => {
      const newStatus = isArchived ? 'bozza' : 'archiviato';
      const result = await updateCaseStatus({ caseId, newStatus });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isArchived ? 'Caso ripristinato' : 'Caso archiviato');
      router.refresh();
    });
  }, [caseId, isArchived, router]);

  // Completeness data
  const pm = caseData.perizia_metadata;
  const hasTribunale = !!(pm?.tribunale || pm?.rgNumber);
  const hasQuesiti = !!(pm?.quesiti && pm.quesiti.some((q) => q.trim().length > 0));
  const hasEsameObiettivo = !!(pm?.esameObiettivo && pm.esameObiettivo.trim().length > 0);
  const hasParti = !!(pm?.parteRicorrente || pm?.parteResistente);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Torna alla dashboard">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                {caseData.code}
              </h1>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditCaseOpen(true)} title="Modifica caso" aria-label="Modifica caso">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-muted-foreground">
              {caseData.patient_initials || 'N/D'} &mdash;{' '}
              {caseTypeLabels[caseData.case_type] ?? caseData.case_type}
              {caseData.practice_reference && ` \u2014 ${caseData.practice_reference}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasResults && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(!searchOpen)}
              title="Cerca nel caso"
              aria-label="Cerca nel caso"
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchiveToggle}
            disabled={isArchiving}
          >
            {isArchiving ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : isArchived ? (
              <RotateCcw className="mr-1 h-3 w-3" />
            ) : (
              <Archive className="mr-1 h-3 w-3" />
            )}
            {isArchived ? 'Ripristina' : 'Archivia'}
          </Button>
          <Dialog open={deleteCaseOpen} onOpenChange={setDeleteCaseOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={hasProcessingDocs}>
                <Trash2 className="mr-1 h-3 w-3" />Elimina caso
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Eliminare il caso {caseData.code}?</DialogTitle>
                <DialogDescription>
                  Tutti i documenti, eventi e report verranno eliminati definitivamente. Questa azione non è reversibile.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteCaseOpen(false)}>Annulla</Button>
                <Button variant="destructive" onClick={handleDeleteCase} disabled={isDeletingCase}>
                  {isDeletingCase ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                  Elimina definitivamente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Completeness indicator - visible when results exist */}
      {hasResults && (
        <CompletenessIndicator
          eventCount={events.length}
          hasReport={!!report?.synthesis}
          hasTribunale={hasTribunale}
          hasQuesiti={hasQuesiti}
          hasEsameObiettivo={hasEsameObiettivo}
          hasParti={hasParti}
        />
      )}

      {/* Edit Case Dialog */}
      <EditCaseDialog
        caseData={caseData}
        open={editCaseOpen}
        onOpenChange={setEditCaseOpen}
        onSaved={() => { setEditCaseOpen(false); router.refresh(); }}
      />

      {/* Inline Search */}
      {searchOpen && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Cerca nel caso (documenti, eventi, diagnosi)..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              aria-label="Cerca nel caso"
              autoFocus
            />
            {isSearching && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            <Button variant="ghost" size="icon" onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults(null); }} aria-label="Chiudi ricerca">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {searchResults && searchResults.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {searchResults.map((r) => (
                <div key={`${r.type}-${r.id}`} className="rounded border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.type === 'event' ? 'outline' : 'secondary'} className="text-xs">
                      {r.type === 'event' ? 'Evento' : 'Documento'}
                    </Badge>
                    <span className="font-medium">{r.title}</span>
                    {r.date && <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.excerpt}</p>
                </div>
              ))}
            </div>
          )}
          {searchResults && searchResults.length === 0 && searchQuery.length >= 2 && (
            <p className="text-sm text-muted-foreground">Nessun risultato per &quot;{searchQuery}&quot;</p>
          )}
        </div>
      )}

      {/* Wizard Step Bar */}
      <nav aria-label="Passaggi caso" className="flex items-center gap-2">
        {WIZARD_STEPS.map((step, index) => {
          const isActive = activeStep === step.number;
          const isCompleted = autoStep > step.number;
          return (
            <div key={step.number} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => setActiveStep(step.number)}
                className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : isCompleted
                      ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/10'
                      : 'border-muted hover:border-muted-foreground/30'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : step.number}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${
                    isActive ? 'text-primary' : isCompleted ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'
                  }`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    {step.number === 1 && `${initialDocuments.length} documenti`}
                    {step.number === 2 && (hasProcessingDocs ? 'In corso...' : 'Pronto')}
                    {step.number === 3 && (hasResults ? `${events.length} eventi` : 'In attesa')}
                  </p>
                </div>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <div className={`mx-2 h-0.5 w-4 shrink-0 rounded ${
                  autoStep > step.number ? 'bg-green-500' : 'bg-muted'
                }`} />
              )}
            </div>
          );
        })}
      </nav>

      {/* === STEP 1: Documenti === */}
      {activeStep === 1 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Carica Documentazione</CardTitle>
              <CardDescription>Aggiungi documenti clinici al caso</CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload caseId={caseId} onUploadComplete={() => router.refresh()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documenti Caricati</CardTitle>
              <CardDescription>
                {initialDocuments.length} {initialDocuments.length === 1 ? 'documento' : 'documenti'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {initialDocuments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessun documento caricato.
                </p>
              ) : (
                <div className="space-y-2">
                  {initialDocuments.map((doc) => {
                    const Icon = getFileIcon(doc.file_type);
                    const canDelete = !isDocProcessing(doc.processing_status);
                    return (
                      <div key={doc.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <Badge variant={processingVariant(doc.processing_status)}>
                              {processingLabels[doc.processing_status] ?? doc.processing_status}
                            </Badge>
                            {doc.processing_status === 'errore' && doc.processing_error && (
                              <p className="mt-1 text-xs text-destructive max-w-[200px]">{doc.processing_error}</p>
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
              )}
            </CardContent>
          </Card>

          {hasUploadedDocs && (
            <div className="lg:col-span-2">
              <Button className="w-full" size="lg" onClick={() => setActiveStep(2)}>
                <Play className="mr-2 h-4 w-4" />
                Procedi all&apos;elaborazione (Passaggio 2)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* === STEP 2: Elaborazione === */}
      {activeStep === 2 && (
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
                  documents={initialDocuments.filter((d) => !['caricato'].includes(d.processing_status))}
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
                        {initialDocuments.filter((d) => d.processing_status === 'caricato').length} documenti pronti per l&apos;elaborazione.
                      </p>
                    ) : initialDocuments.length === 0 ? (
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
      )}

      {/* === STEP 3: Risultati === */}
      {activeStep === 3 && hasProcessingDocs && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Elaborazione in corso... I risultati saranno disponibili al completamento di tutti i documenti.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {activeStep === 3 && !hasProcessingDocs && (
        <>
          {hasResults ? (
            <Tabs defaultValue="events" className="space-y-4">
              <TabsList>
                <TabsTrigger value="events">Eventi ({events.length})</TabsTrigger>
                <TabsTrigger value="synthesis">Report</TabsTrigger>
                <TabsTrigger value="anomalies">Anomalie ({anomalies.length})</TabsTrigger>
                <TabsTrigger value="missing">Doc. Mancanti ({missingDocs.length})</TabsTrigger>
                <TabsTrigger value="perizia">
                  <FileText className="mr-1 h-3 w-3" />Perizia
                </TabsTrigger>
              </TabsList>

              <TabsContent value="events">
                <EventsTab
                  caseId={caseId}
                  events={events}
                  eventImages={eventImages}
                  onImageClick={setPreviewImage}
                />
              </TabsContent>

              <TabsContent value="synthesis">
                <ReportTab
                  caseId={caseId}
                  report={report}
                  isRegenerating={isRegenerating}
                  onRegenerate={handleRegenerate}
                />
              </TabsContent>

              <TabsContent value="anomalies">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      Anomalie Rilevate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {anomalies.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">Nessuna anomalia rilevata.</p>
                    ) : (
                      <div className="space-y-3">
                        {anomalies.map((a) => (
                          <div key={a.id} className="rounded-md border p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={severityVariant(a.severity)}>{a.severity.toUpperCase()}</Badge>
                              <span className="text-sm font-medium">{anomalyTypeLabels[a.anomaly_type] ?? a.anomaly_type}</span>
                            </div>
                            <p className="text-sm">{a.description}</p>
                            {a.suggestion && (
                              <p className="mt-2 text-sm text-muted-foreground italic">{a.suggestion}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="missing">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileWarning className="h-5 w-5 text-destructive" />
                      Documentazione Mancante
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {missingDocs.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">Nessuna documentazione mancante.</p>
                    ) : (
                      <div className="space-y-3">
                        {missingDocs.map((d) => (
                          <div key={d.id} className="rounded-md border p-3">
                            <p className="text-sm font-medium">{d.document_name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{d.reason}</p>
                            {d.related_event && (
                              <p className="mt-1 text-xs text-muted-foreground">Evento correlato: {d.related_event}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="perizia">
                <PeriziaMetadataForm caseId={caseId} caseData={caseData} onSaved={() => router.refresh()} />
              </TabsContent>
            </Tabs>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nessun risultato disponibile. Carica i documenti e avvia l&apos;elaborazione.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Image Preview Dialog */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Immagine documento</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage}
                alt="Immagine documento medico"
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
