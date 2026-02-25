'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Image, FileSpreadsheet, File, Play,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  FileWarning, Plus, Trash2, Save, X, Pencil, Filter,
  Download,
} from 'lucide-react';
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
import { updateEvent, deleteEvent, addManualEvent, updateReportStatus } from '../../actions';

// --- Types ---

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
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
  confidence: number;
  requires_verification: boolean;
  reliability_notes: string | null;
  expert_notes: string | null;
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
  documents: Document[];
  events: EventRow[];
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  report: ReportRow | null;
  processingLabels: Record<string, string>;
}

// --- Constants ---

const POLL_INTERVAL_MS = 3000;

const EVENT_TYPES = [
  { value: 'visita', label: 'Visita' },
  { value: 'esame', label: 'Esame' },
  { value: 'diagnosi', label: 'Diagnosi' },
  { value: 'intervento', label: 'Intervento' },
  { value: 'terapia', label: 'Terapia' },
  { value: 'ricovero', label: 'Ricovero' },
  { value: 'follow-up', label: 'Follow-up' },
  { value: 'referto', label: 'Referto' },
  { value: 'prescrizione', label: 'Prescrizione' },
  { value: 'consenso', label: 'Consenso' },
  { value: 'complicanza', label: 'Complicanza' },
  { value: 'altro', label: 'Altro' },
];

const SOURCE_TYPES = [
  { value: 'cartella_clinica', label: 'Cartella Clinica' },
  { value: 'referto_controllo', label: 'Referto Controllo' },
  { value: 'esame_strumentale', label: 'Esame Strumentale' },
  { value: 'esame_ematochimico', label: 'Esami Ematochimici' },
  { value: 'altro', label: 'Altro' },
];

const sourceLabels: Record<string, string> = {
  cartella_clinica: 'Fonte A',
  referto_controllo: 'Fonte B',
  esame_strumentale: 'Fonte C',
  esame_ematochimico: 'Fonte D',
  altro: 'Altro',
};

const anomalyTypeLabels: Record<string, string> = {
  ritardo_diagnostico: 'Ritardo Diagnostico',
  gap_post_chirurgico: 'Gap Post-Chirurgico',
  gap_documentale: 'Gap Documentale',
  complicanza_non_gestita: 'Complicanza Non Gestita',
  consenso_non_documentato: 'Consenso Non Documentato',
  diagnosi_contraddittoria: 'Diagnosi Contraddittoria',
  terapia_senza_followup: 'Terapia Senza Follow-up',
};

// --- Helpers ---

function getFileIcon(type: string) {
  if (type.startsWith('image/') || type.includes('image')) return Image;
  if (type.includes('pdf')) return FileText;
  if (type.includes('sheet') || type.includes('excel')) return FileSpreadsheet;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

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

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-600';
  if (confidence >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

// --- Main Component ---

export function CaseDetailClient({
  caseId,
  documents: initialDocuments,
  events,
  anomalies,
  missingDocs,
  report,
  processingLabels,
}: CaseDetailClientProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Event interaction state
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ type: string; id: string; title: string; excerpt: string; date: string | null }> | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterVerification, setFilterVerification] = useState<string>('all');

  const hasProcessingDocs = initialDocuments.some(
    (d) => ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(d.processing_status),
  );
  const hasUploadedDocs = initialDocuments.some((d) => d.processing_status === 'caricato');
  const hasResults = events.length > 0 || anomalies.length > 0 || report;

  // Filter events
  const filteredEvents = events.filter((e) => {
    if (filterType !== 'all' && e.event_type !== filterType) return false;
    if (filterVerification === 'yes' && !e.requires_verification) return false;
    if (filterVerification === 'no' && e.requires_verification) return false;
    return true;
  });

  // Poll for processing updates
  useEffect(() => {
    if (!hasProcessingDocs && !isProcessing) return;
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasProcessingDocs, isProcessing, router]);

  useEffect(() => {
    if (isProcessing && !hasProcessingDocs) setIsProcessing(false);
  }, [hasProcessingDocs, isProcessing]);

  const handleStartProcessing = useCallback(async () => {
    setIsProcessing(true);
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
        setIsProcessing(false);
        return;
      }
      router.refresh();
    } catch {
      setProcessingError('Errore di rete. Verifica la connessione.');
      setIsProcessing(false);
    }
  }, [caseId, router]);

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
        alert(result.error ?? 'Errore rigenerazione');
      }
      router.refresh();
    } catch {
      alert('Errore di rete.');
    } finally {
      setIsRegenerating(false);
    }
  }, [caseId, router]);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/search?q=${encodeURIComponent(q.trim())}`);
      const result = await response.json() as { success: boolean; data?: { results: Array<{ type: string; id: string; title: string; excerpt: string; date: string | null }> } };
      if (result.success && result.data) {
        setSearchResults(result.data.results);
      }
    } catch { /* ignore */ } finally {
      setIsSearching(false);
    }
  }, [caseId]);

  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Upload + Documents Row */}
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
                  return (
                    <div key={doc.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</p>
                        </div>
                      </div>
                      <Badge variant={processingVariant(doc.processing_status)}>
                        {processingLabels[doc.processing_status] ?? doc.processing_status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Processing Action */}
      {(hasUploadedDocs || hasProcessingDocs) && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                {hasProcessingDocs ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Elaborazione in corso... La pagina si aggiorna automaticamente.
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {initialDocuments.filter((d) => d.processing_status === 'caricato').length} documenti pronti per l&apos;elaborazione.
                  </p>
                )}
                {processingError && <p className="mt-1 text-sm text-destructive">{processingError}</p>}
              </div>
              <Button onClick={handleStartProcessing} disabled={isProcessing || hasProcessingDocs || !hasUploadedDocs}>
                {isProcessing || hasProcessingDocs ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Elaborazione...</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" />Avvia Elaborazione</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      {hasResults && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Cerca nel caso (documenti, eventi, diagnosi)..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                {isSearching && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
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
          </CardContent>
        </Card>
      )}

      {/* Export Buttons */}
      {hasResults && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Esporta Report</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/cases/${caseId}/export/html`} download>
                    <Download className="mr-1 h-3 w-3" />HTML
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/cases/${caseId}/export/csv`} download>
                    <Download className="mr-1 h-3 w-3" />CSV
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/cases/${caseId}/export/docx`} download>
                    <Download className="mr-1 h-3 w-3" />DOCX
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Tabs */}
      {hasResults && (
        <Tabs defaultValue="events" className="space-y-4">
          <TabsList>
            <TabsTrigger value="events">Cronologia ({events.length})</TabsTrigger>
            <TabsTrigger value="synthesis">Sintesi</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalie ({anomalies.length})</TabsTrigger>
            <TabsTrigger value="missing">Doc. Mancanti ({missingDocs.length})</TabsTrigger>
          </TabsList>

          {/* === EVENTS TAB === */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Cronologia Eventi Clinici</CardTitle>
                    <CardDescription>
                      {filteredEvents.length} di {events.length} eventi
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Filters */}
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-[150px]">
                        <Filter className="mr-2 h-3 w-3" />
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i tipi</SelectItem>
                        {EVENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterVerification} onValueChange={setFilterVerification}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Verifica" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti</SelectItem>
                        <SelectItem value="yes">Da verificare</SelectItem>
                        <SelectItem value="no">Verificati</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* Add event button */}
                    <AddEventDialog
                      caseId={caseId}
                      open={addEventOpen}
                      onOpenChange={setAddEventOpen}
                      onSuccess={() => { setAddEventOpen(false); router.refresh(); }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredEvents.map((event) => (
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
                    />
                  ))}
                  {filteredEvents.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nessun evento corrisponde ai filtri selezionati.
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
                  <CardTitle>Sintesi Medico-Legale</CardTitle>
                  {report && (
                    <div className="flex items-center gap-2">
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
                    </div>
                  )}
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
      )}
    </div>
  );
}

// --- Event Card Component ---

function EventCard({
  event, caseId, isExpanded, isEditing, onToggle, onStartEdit, onCancelEdit, onSaved, onDeleted,
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
      await updateEvent({
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
      onSaved();
    });
  };

  const handleDelete = () => {
    if (!confirm('Eliminare questo evento? (soft delete — recuperabile)')) return;
    startTransition(async () => {
      await deleteEvent({ eventId: event.id, caseId });
      onDeleted();
    });
  };

  return (
    <div className="rounded-md border p-3">
      {/* Header row - always visible */}
      <div className="flex items-start justify-between">
        <button type="button" className="flex flex-1 items-start text-left" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">#{event.order_number}</span>
              <span className="text-sm font-medium">
                {formatDate(event.event_date)}
                {event.date_precision !== 'giorno' && (
                  <span className="text-xs text-muted-foreground ml-1">[{event.date_precision}]</span>
                )}
              </span>
              <Badge variant="outline" className="text-xs">{event.event_type}</Badge>
              <Badge variant="secondary" className="text-xs">{sourceLabels[event.source_type] ?? event.source_type}</Badge>
              {event.requires_verification && <Badge variant="warning" className="text-xs">Da verificare</Badge>}
              <span className={`text-xs ${confidenceColor(event.confidence)}`}>{event.confidence}%</span>
            </div>
            <p className="mt-1 text-sm font-medium">{event.title}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 ml-2">
          {!isEditing && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit} title="Modifica">
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
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
          {event.reliability_notes && <p className="text-sm text-muted-foreground italic">{event.reliability_notes}</p>}
          {event.expert_notes && (
            <div className="rounded bg-muted p-2">
              <p className="text-sm"><span className="font-medium">Note perito:</span> {event.expert_notes}</p>
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
      await addManualEvent({
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
