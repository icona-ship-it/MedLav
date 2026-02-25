'use client';

import { useState, useEffect, useCallback, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Play, Loader2, AlertTriangle, ChevronDown, ChevronUp,
  FileWarning, Plus, Trash2, Save, X, Pencil,
  Download, XCircle, ArrowLeft, Archive, RotateCcw,
  CheckCircle2, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileUpload } from '@/components/file-upload';
import { ProcessingProgress } from '@/components/processing-progress';
import {
  updateEvent, deleteEvent, addManualEvent, updateReportStatus,
  deleteDocument, deleteCase, updateCase, updateCaseStatus,
} from '../../actions';
import {
  CASE_TYPES, EVENT_TYPES, SOURCE_TYPES,
  caseTypeLabels, sourceLabels, anomalyTypeLabels,
} from '@/lib/constants';
import {
  formatDate, formatFileSize, getFileIcon,
  confidenceColor, confidenceLabel,
} from '@/lib/format';

// --- Types ---

interface CaseData {
  id: string;
  code: string;
  case_type: string;
  case_role: string;
  patient_initials: string | null;
  practice_reference: string | null;
  notes: string | null;
  status: string;
}

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  processing_status: string;
  processing_error: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  order_number: number;
  event_date: string;
  date_precision: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  document_id: string | null;
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
  confidence: number;
  requires_verification: boolean;
  reliability_notes: string | null;
  expert_notes: string | null;
  source_text: string | null;
  source_pages: string | null;
  extraction_pass: string | null;
}

interface AnomalyRow {
  id: string;
  anomaly_type: string;
  severity: string;
  description: string;
  involved_events: string | null;
  suggestion: string | null;
}

interface MissingDocRow {
  id: string;
  document_name: string;
  reason: string;
  related_event: string | null;
}

interface ReportRow {
  id: string;
  version: number;
  report_status: string;
  synthesis: string | null;
}

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

const CASE_ROLES_SHORT = [
  { value: 'ctu', label: 'CTU' },
  { value: 'ctp', label: 'CTP' },
  { value: 'stragiudiziale', label: 'Stragiudiziale' },
];

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
  if (hasResults) return 3;
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

  // Event interaction state
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Cancel state
  const [isCancelling, setIsCancelling] = useState(false);

  // Case action state
  const [editCaseOpen, setEditCaseOpen] = useState(false);
  const [deleteCaseOpen, setDeleteCaseOpen] = useState(false);
  const [isDeletingCase, startDeleteCase] = useTransition();
  const [isArchiving, startArchiving] = useTransition();
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ type: string; id: string; title: string; excerpt: string; date: string | null }> | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Wizard step
  const hasProcessingDocs = initialDocuments.some((d) => isDocProcessing(d.processing_status));
  const hasUploadedDocs = initialDocuments.some((d) => d.processing_status === 'caricato');
  const hasResults = events.length > 0 || anomalies.length > 0 || !!report;

  const autoStep = computeAutoStep(hasResults, hasProcessingDocs);
  const [activeStep, setActiveStep] = useState(autoStep);

  // Update active step when server data changes (e.g. processing finishes)
  useEffect(() => {
    setActiveStep(computeAutoStep(hasResults, hasProcessingDocs));
  }, [hasResults, hasProcessingDocs]);

  const isArchived = caseData.status === 'archiviato';

  // Poll for processing updates — depends only on hasProcessingDocs
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

  // Reset isStartingProcessing once server data confirms processing
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

  // Debounced search with AbortController
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

  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

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
          {/* Search toggle */}
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

      {/* Edit Case Dialog */}
      <EditCaseDialog
        caseData={caseData}
        open={editCaseOpen}
        onOpenChange={setEditCaseOpen}
        onSaved={() => { setEditCaseOpen(false); router.refresh(); }}
      />

      {/* Inline Search (expandable) */}
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
                          <Badge variant={processingVariant(doc.processing_status)}>
                            {processingLabels[doc.processing_status] ?? doc.processing_status}
                          </Badge>
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

          {/* Nudge to proceed to step 2 */}
          {hasUploadedDocs && (
            <div className="lg:col-span-2">
              <Button
                className="w-full"
                size="lg"
                onClick={() => setActiveStep(2)}
              >
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
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isCancelling}
                  >
                    {isCancelling ? (
                      <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Annullamento...</>
                    ) : (
                      <><XCircle className="mr-2 h-3 w-3" />Annulla elaborazione</>
                    )}
                  </Button>
                </div>
                <ProcessingProgress
                  documents={initialDocuments.filter(
                    (d) => !['caricato'].includes(d.processing_status),
                  )}
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
      {activeStep === 3 && (
        <>
          {hasResults ? (
            <Tabs defaultValue="events" className="space-y-4">
              <TabsList>
                <TabsTrigger value="events">Eventi ({events.length})</TabsTrigger>
                <TabsTrigger value="synthesis">Report</TabsTrigger>
                <TabsTrigger value="anomalies">Anomalie ({anomalies.length})</TabsTrigger>
                <TabsTrigger value="missing">Doc. Mancanti ({missingDocs.length})</TabsTrigger>
              </TabsList>

              {/* === EVENTS TAB === */}
              <TabsContent value="events">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Eventi Clinici</CardTitle>
                        <CardDescription>
                          {events.length} eventi estratti
                        </CardDescription>
                      </div>
                      <AddEventDialog
                        caseId={caseId}
                        open={addEventOpen}
                        onOpenChange={setAddEventOpen}
                        onSuccess={() => { setAddEventOpen(false); router.refresh(); }}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {events.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          caseId={caseId}
                          isExpanded={expandedEvents.has(event.id)}
                          isEditing={editingEventId === event.id}
                          onToggle={() => toggleEvent(event.id)}
                          onStartEdit={() => { setEditingEventId(event.id); setExpandedEvents((p) => new Set(p).add(event.id)); }}
                          onCancelEdit={() => setEditingEventId(null)}
                          onSaved={() => { setEditingEventId(null); router.refresh(); }}
                          onDeleted={() => router.refresh()}
                          eventImages={eventImages}
                          onImageClick={setPreviewImage}
                        />
                      ))}
                      {events.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          Nessun evento estratto. Avvia l&apos;elaborazione dei documenti.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* === SYNTHESIS TAB === */}
              <TabsContent value="synthesis">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Report Medico-Legale</CardTitle>
                      <div className="flex items-center gap-2">
                        {report && (
                          <>
                            <Badge variant="secondary">v{report.version}</Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRegenerate}
                              disabled={isRegenerating}
                            >
                              {isRegenerating
                                ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Rigenerazione...</>
                                : 'Rigenera Report'
                              }
                            </Button>
                            <ReportStatusButtons
                              caseId={caseId}
                              report={report}
                              onChanged={() => router.refresh()}
                            />
                          </>
                        )}
                        {/* Export buttons inline */}
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/api/cases/${caseId}/export/html`} download aria-label="Esporta in formato HTML">
                            <Download className="mr-1 h-3 w-3" aria-hidden="true" />HTML
                          </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/api/cases/${caseId}/export/csv`} download aria-label="Esporta in formato CSV">
                            <Download className="mr-1 h-3 w-3" aria-hidden="true" />CSV
                          </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/api/cases/${caseId}/export/docx`} download aria-label="Esporta in formato DOCX">
                            <Download className="mr-1 h-3 w-3" aria-hidden="true" />DOCX
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {report?.synthesis ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                        {report.synthesis}
                      </div>
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nessuna sintesi generata. Avvia l&apos;elaborazione dei documenti.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* === ANOMALIES TAB === */}
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

              {/* === MISSING DOCS TAB === */}
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

// --- Edit Case Dialog ---

function EditCaseDialogInner({
  caseData, onOpenChange, onSaved,
}: {
  caseData: CaseData;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    caseType: caseData.case_type,
    caseRole: caseData.case_role,
    patientInitials: caseData.patient_initials ?? '',
    practiceReference: caseData.practice_reference ?? '',
    notes: caseData.notes ?? '',
  });

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await updateCase({
        caseId: caseData.id,
        caseType: form.caseType as 'ortopedica' | 'oncologica' | 'ostetrica' | 'anestesiologica' | 'infezione_nosocomiale' | 'errore_diagnostico' | 'generica',
        caseRole: form.caseRole as 'ctu' | 'ctp' | 'stragiudiziale',
        patientInitials: form.patientInitials || null,
        practiceReference: form.practiceReference || null,
        notes: form.notes || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onSaved();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifica Caso {caseData.code}</DialogTitle>
        <DialogDescription>Modifica le informazioni del caso.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Tipologia caso</Label>
            <Select value={form.caseType} onValueChange={(v) => setForm({ ...form, caseType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo incarico</Label>
            <Select value={form.caseRole} onValueChange={(v) => setForm({ ...form, caseRole: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASE_ROLES_SHORT.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Iniziali paziente</Label>
            <Input
              value={form.patientInitials}
              onChange={(e) => setForm({ ...form, patientInitials: e.target.value })}
              maxLength={10}
              placeholder="es. M.R."
            />
          </div>
          <div>
            <Label>Riferimento pratica</Label>
            <Input
              value={form.practiceReference}
              onChange={(e) => setForm({ ...form, practiceReference: e.target.value })}
              placeholder="es. RG 1234/2024"
            />
          </div>
        </div>
        <div>
          <Label>Note</Label>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Note aggiuntive sul caso..."
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Salva
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Wrapper that remounts the inner form each time the dialog opens,
 * ensuring fresh state without useEffect + setState.
 */
function EditCaseDialog({
  caseData, open, onOpenChange, onSaved,
}: {
  caseData: CaseData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <EditCaseDialogInner
            caseData={caseData}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Event Card Component ---

function EventCard({
  event, caseId, isExpanded, isEditing, onToggle, onStartEdit, onCancelEdit, onSaved, onDeleted,
  eventImages, onImageClick,
}: {
  event: EventRow;
  caseId: string;
  isExpanded: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  eventImages: Record<string, string[]>;
  onImageClick: (url: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editForm, setEditForm] = useState({
    title: event.title,
    description: event.description,
    eventType: event.event_type,
    eventDate: event.event_date,
    diagnosis: event.diagnosis ?? '',
    doctor: event.doctor ?? '',
    facility: event.facility ?? '',
    expertNotes: event.expert_notes ?? '',
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateEvent({
        eventId: event.id,
        caseId,
        title: editForm.title,
        description: editForm.description,
        eventType: editForm.eventType,
        eventDate: editForm.eventDate,
        diagnosis: editForm.diagnosis || null,
        doctor: editForm.doctor || null,
        facility: editForm.facility || null,
        expertNotes: editForm.expertNotes || null,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      onSaved();
    });
  };

  const handleDelete = () => {
    toast('Eliminare questo evento?', {
      description: 'L\'evento potrà essere recuperato.',
      action: {
        label: 'Elimina',
        onClick: () => {
          startTransition(async () => {
            const result = await deleteEvent({ eventId: event.id, caseId });
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            onDeleted();
          });
        },
      },
      cancel: { label: 'Annulla', onClick: () => {} },
    });
  };

  const images = eventImages[event.id] ?? [];

  return (
    <div className="rounded-md border p-3">
      {/* Header row - always visible */}
      <div className="flex items-start justify-between">
        <button type="button" className="flex flex-1 items-start text-left" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {formatDate(event.event_date)}
              </span>
              <Badge variant="outline" className="text-xs">{EVENT_TYPES.find((t) => t.value === event.event_type)?.label ?? event.event_type}</Badge>
              {event.requires_verification && <Badge variant="warning" className="text-xs">Da verificare</Badge>}
            </div>
            <p className="mt-1 text-sm font-medium">{event.title}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 ml-2">
          {!isEditing && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit} title="Modifica" aria-label="Modifica evento">
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle} aria-label={isExpanded ? 'Chiudi dettagli' : 'Apri dettagli'} aria-expanded={isExpanded}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && !isEditing && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-sm whitespace-pre-wrap">{event.description}</p>
          {event.diagnosis && <p className="text-sm"><span className="font-medium">Diagnosi:</span> {event.diagnosis}</p>}
          {event.doctor && <p className="text-sm"><span className="font-medium">Medico:</span> {event.doctor}</p>}
          {event.facility && <p className="text-sm"><span className="font-medium">Struttura:</span> {event.facility}</p>}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Fonte: {sourceLabels[event.source_type] ?? event.source_type}</span>
            <span className={confidenceColor(event.confidence)}>{confidenceLabel(event.confidence)}</span>
          </div>
          {event.reliability_notes && <p className="text-sm text-muted-foreground italic">{event.reliability_notes}</p>}
          {event.expert_notes && (
            <div className="rounded bg-muted p-2">
              <p className="text-sm"><span className="font-medium">Note perito:</span> {event.expert_notes}</p>
            </div>
          )}
          {event.source_text && (
            <SourceTextSection sourceText={event.source_text} sourcePages={event.source_pages} />
          )}
          {images.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Immagini associate</p>
              <div className="flex flex-wrap gap-2">
                {images.map((url, idx) => (
                  <button
                    key={url}
                    type="button"
                    className="rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => onImageClick(url)}
                    aria-label={`Visualizza immagine ${idx + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Immagine ${idx + 1}`}
                      className="h-20 w-20 object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {isExpanded && isEditing && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titolo</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={editForm.eventDate} onChange={(e) => setEditForm({ ...editForm, eventDate: e.target.value })} />
            </div>
            <div>
              <Label>Tipo evento</Label>
              <Select value={editForm.eventType} onValueChange={(v) => setEditForm({ ...editForm, eventType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Diagnosi</Label>
              <Input value={editForm.diagnosis} onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })} />
            </div>
            <div>
              <Label>Medico</Label>
              <Input value={editForm.doctor} onChange={(e) => setEditForm({ ...editForm, doctor: e.target.value })} />
            </div>
            <div>
              <Label>Struttura</Label>
              <Input value={editForm.facility} onChange={(e) => setEditForm({ ...editForm, facility: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Descrizione</Label>
            <Textarea rows={4} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div>
            <Label>Note perito</Label>
            <Textarea rows={2} value={editForm.expertNotes} onChange={(e) => setEditForm({ ...editForm, expertNotes: e.target.value })} placeholder="Annotazioni del perito..." />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="mr-1 h-3 w-3" />Elimina
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onCancelEdit} disabled={isPending}>
                <X className="mr-1 h-3 w-3" />Annulla
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Salva
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Source Text Section (collapsible) ---

function SourceTextSection({ sourceText, sourcePages }: { sourceText: string; sourcePages: string | null }) {
  const [isOpen, setIsOpen] = useState(false);

  const parsedPages: number[] = sourcePages ? (() => {
    try { return JSON.parse(sourcePages) as number[]; } catch { return []; }
  })() : [];

  return (
    <div className="pt-2 border-t">
      <button
        type="button"
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Testo OCR originale
        {parsedPages.length > 0 && (
          <span className="text-xs text-muted-foreground ml-1">
            (pag. {parsedPages.join(', ')})
          </span>
        )}
      </button>
      {isOpen && (
        <pre className="mt-2 rounded bg-muted p-3 text-xs whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
          {sourceText}
        </pre>
      )}
    </div>
  );
}

// --- Add Event Dialog ---

function AddEventDialog({
  caseId, open, onOpenChange, onSuccess,
}: {
  caseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    eventDate: '',
    datePrecision: 'giorno',
    eventType: 'altro',
    title: '',
    description: '',
    sourceType: 'altro',
    diagnosis: '',
    doctor: '',
    facility: '',
  });

  const handleSubmit = () => {
    if (!form.eventDate || !form.title || !form.description) return;
    startTransition(async () => {
      const result = await addManualEvent({
        caseId,
        eventDate: form.eventDate,
        datePrecision: form.datePrecision,
        eventType: form.eventType,
        title: form.title,
        description: form.description,
        sourceType: form.sourceType,
        diagnosis: form.diagnosis || null,
        doctor: form.doctor || null,
        facility: form.facility || null,
      });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setForm({ eventDate: '', datePrecision: 'giorno', eventType: 'altro', title: '', description: '', sourceType: 'altro', diagnosis: '', doctor: '', facility: '' });
      onSuccess();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-3 w-3" />Aggiungi Evento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi Evento Manuale</DialogTitle>
          <DialogDescription>Aggiungi un evento non rilevato dal sistema.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
            </div>
            <div>
              <Label>Precisione data</Label>
              <Select value={form.datePrecision} onValueChange={(v) => setForm({ ...form, datePrecision: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="giorno">Giorno</SelectItem>
                  <SelectItem value="mese">Mese</SelectItem>
                  <SelectItem value="anno">Anno</SelectItem>
                  <SelectItem value="sconosciuta">Sconosciuta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo evento *</Label>
              <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fonte</Label>
              <Select value={form.sourceType} onValueChange={(v) => setForm({ ...form, sourceType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Titolo *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Breve descrizione dell'evento" />
          </div>
          <div>
            <Label>Descrizione *</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrizione completa..." />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Diagnosi</Label>
              <Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <div>
              <Label>Medico</Label>
              <Input value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} />
            </div>
            <div>
              <Label>Struttura</Label>
              <Input value={form.facility} onChange={(e) => setForm({ ...form, facility: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.eventDate || !form.title || !form.description}>
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Aggiungi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Report Status Buttons ---

function ReportStatusButtons({
  caseId, report, onChanged,
}: {
  caseId: string;
  report: ReportRow;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const currentStatus = report.report_status;

  const handleStatusChange = (newStatus: string) => {
    startTransition(async () => {
      await updateReportStatus({ caseId, reportId: report.id, newStatus });
      onChanged();
    });
  };

  return (
    <div className="flex items-center gap-1">
      {currentStatus === 'bozza' && (
        <Button variant="outline" size="sm" onClick={() => handleStatusChange('in_revisione')} disabled={isPending}>
          In Revisione
        </Button>
      )}
      {currentStatus === 'in_revisione' && (
        <>
          <Button variant="outline" size="sm" onClick={() => handleStatusChange('bozza')} disabled={isPending}>
            Bozza
          </Button>
          <Button size="sm" onClick={() => handleStatusChange('definitivo')} disabled={isPending}>
            Definitivo
          </Button>
        </>
      )}
      {currentStatus === 'definitivo' && (
        <Badge variant="success">Definitivo</Badge>
      )}
    </div>
  );
}
