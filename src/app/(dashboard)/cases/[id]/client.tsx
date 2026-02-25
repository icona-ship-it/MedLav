'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Image, FileSpreadsheet, File, Play,
  Loader2, AlertTriangle, CheckCircle2, FileWarning,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/file-upload';

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

const POLL_INTERVAL_MS = 3000;

const processingVariant = (status: string): 'secondary' | 'warning' | 'success' | 'destructive' | 'outline' => {
  switch (status) {
    case 'completato': return 'success';
    case 'errore': return 'destructive';
    case 'caricato': return 'secondary';
    default: return 'warning';
  }
};

const severityVariant = (severity: string): 'destructive' | 'warning' | 'secondary' | 'outline' => {
  switch (severity) {
    case 'critica': return 'destructive';
    case 'alta': return 'destructive';
    case 'media': return 'warning';
    default: return 'secondary';
  }
};

const sourceLabels: Record<string, string> = {
  cartella_clinica: 'Fonte A - Cartella Clinica',
  referto_controllo: 'Fonte B - Referto Controllo',
  esame_strumentale: 'Fonte C - Esame Strumentale',
  esame_ematochimico: 'Fonte D - Esami Ematochimici',
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
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Check if any documents are currently being processed
  const hasProcessingDocs = initialDocuments.some(
    (d) => ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'].includes(d.processing_status),
  );

  const hasUploadedDocs = initialDocuments.some((d) => d.processing_status === 'caricato');
  const hasResults = events.length > 0 || anomalies.length > 0 || report;

  // Poll for processing updates
  useEffect(() => {
    if (!hasProcessingDocs && !isProcessing) return;

    const interval = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hasProcessingDocs, isProcessing, router]);

  // Reset processing state when documents complete
  useEffect(() => {
    if (isProcessing && !hasProcessingDocs) {
      setIsProcessing(false);
    }
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

      // Refresh to show updated statuses
      router.refresh();
    } catch {
      setProcessingError('Errore di rete. Verifica la connessione.');
      setIsProcessing(false);
    }
  }, [caseId, router]);

  const toggleEvent = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Upload + Documents Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle>Carica Documentazione</CardTitle>
            <CardDescription>
              Aggiungi documenti clinici al caso
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload
              caseId={caseId}
              onUploadComplete={() => router.refresh()}
            />
          </CardContent>
        </Card>

        {/* Documents List */}
        <Card>
          <CardHeader>
            <CardTitle>Documenti Caricati</CardTitle>
            <CardDescription>
              {initialDocuments.length} {initialDocuments.length === 1 ? 'documento' : 'documenti'} nel caso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {initialDocuments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nessun documento caricato. Usa il pannello a sinistra per aggiungere file.
              </p>
            ) : (
              <div className="space-y-2">
                {initialDocuments.map((doc) => {
                  const Icon = getFileIcon(doc.file_type);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(doc.file_size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.processing_error && (
                          <span className="text-xs text-destructive" title={doc.processing_error}>
                            Errore
                          </span>
                        )}
                        <Badge variant={processingVariant(doc.processing_status)}>
                          {processingLabels[doc.processing_status] ?? doc.processing_status}
                        </Badge>
                      </div>
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
                {processingError && (
                  <p className="mt-1 text-sm text-destructive">{processingError}</p>
                )}
              </div>
              <Button
                onClick={handleStartProcessing}
                disabled={isProcessing || hasProcessingDocs || !hasUploadedDocs}
              >
                {isProcessing || hasProcessingDocs ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Elaborazione...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Avvia Elaborazione
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Section */}
      {hasResults && (
        <>
          {/* Synthesis */}
          {report?.synthesis && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Sintesi Medico-Legale</CardTitle>
                  <Badge variant="secondary">
                    v{report.version} - {report.report_status === 'bozza' ? 'Bozza' : report.report_status === 'in_revisione' ? 'In Revisione' : 'Definitivo'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                  {report.synthesis}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Events Timeline */}
          {events.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cronologia Eventi Clinici</CardTitle>
                <CardDescription>
                  {events.length} eventi estratti in ordine cronologico
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {events.map((event) => {
                    const isExpanded = expandedEvents.has(event.id);
                    const confidenceColor = event.confidence >= 80
                      ? 'text-green-600' : event.confidence >= 50
                        ? 'text-yellow-600' : 'text-red-600';

                    return (
                      <div
                        key={event.id}
                        className="rounded-md border p-3"
                      >
                        <button
                          type="button"
                          className="flex w-full items-start justify-between text-left"
                          onClick={() => toggleEvent(event.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono text-muted-foreground">
                                #{event.order_number}
                              </span>
                              <span className="text-sm font-medium">
                                {formatDate(event.event_date)}
                                {event.date_precision !== 'giorno' && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    [{event.date_precision}]
                                  </span>
                                )}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {event.event_type}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {sourceLabels[event.source_type] ?? event.source_type}
                              </Badge>
                              {event.requires_verification && (
                                <Badge variant="warning" className="text-xs">
                                  Da verificare
                                </Badge>
                              )}
                              <span className={`text-xs ${confidenceColor}`}>
                                {event.confidence}%
                              </span>
                            </div>
                            <p className="mt-1 text-sm font-medium">{event.title}</p>
                          </div>
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          }
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-2 border-t pt-3">
                            <p className="text-sm whitespace-pre-wrap">{event.description}</p>
                            {event.diagnosis && (
                              <p className="text-sm">
                                <span className="font-medium">Diagnosi:</span> {event.diagnosis}
                              </p>
                            )}
                            {event.doctor && (
                              <p className="text-sm">
                                <span className="font-medium">Medico:</span> {event.doctor}
                              </p>
                            )}
                            {event.facility && (
                              <p className="text-sm">
                                <span className="font-medium">Struttura:</span> {event.facility}
                              </p>
                            )}
                            {event.reliability_notes && (
                              <p className="text-sm text-muted-foreground italic">
                                {event.reliability_notes}
                              </p>
                            )}
                            {event.expert_notes && (
                              <div className="rounded bg-muted p-2">
                                <p className="text-sm">
                                  <span className="font-medium">Note perito:</span> {event.expert_notes}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Anomalie Rilevate
                </CardTitle>
                <CardDescription>
                  {anomalies.length} anomalie identificate nella documentazione
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {anomalies.map((anomaly) => (
                    <div key={anomaly.id} className="rounded-md border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={severityVariant(anomaly.severity)}>
                          {anomaly.severity.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">
                          {anomalyTypeLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type}
                        </span>
                      </div>
                      <p className="text-sm">{anomaly.description}</p>
                      {anomaly.suggestion && (
                        <p className="mt-2 text-sm text-muted-foreground italic">
                          {anomaly.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Missing Documents */}
          {missingDocs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileWarning className="h-5 w-5 text-destructive" />
                  Documentazione Mancante
                </CardTitle>
                <CardDescription>
                  {missingDocs.length} documenti attesi ma non trovati
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {missingDocs.map((doc) => (
                    <div key={doc.id} className="rounded-md border p-3">
                      <p className="text-sm font-medium">{doc.document_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{doc.reason}</p>
                      {doc.related_event && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Evento correlato: {doc.related_event}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
