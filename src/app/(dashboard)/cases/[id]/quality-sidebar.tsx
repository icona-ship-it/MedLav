'use client';

import {
  AlertTriangle, FileQuestion, FileText, Eye, AlertCircle,
  CheckCircle2, XCircle, Loader2, Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { isTruncated } from '@/lib/report-utils';
import type { ReportRow, EventRow, AnomalyRow, MissingDocRow, Document } from './types';
import type { DocumentPage } from '../../actions';

// --- Types ---

interface QualitySidebarProps {
  report: ReportRow;
  events: EventRow[];
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  documents: Document[];
  documentPages: DocumentPage[];
  onSwitchToAnomalies?: () => void;
  onOpenOcr?: () => void;
}

// --- Helpers ---

const PROCESSING_STATUSES = new Set(['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso']);

function computeOcrConfidence(pages: DocumentPage[]): number | null {
  const withConfidence = pages.filter((p) => p.ocr_confidence !== null);
  if (withConfidence.length === 0) return null;
  const sum = withConfidence.reduce((acc, p) => acc + (p.ocr_confidence ?? 0), 0);
  return Math.round(sum / withConfidence.length);
}

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-600 dark:text-green-400';
  if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

interface DocCoverage {
  doc: Document;
  eventCount: number;
  status: 'ok' | 'warning' | 'error' | 'processing';
}

function computeCoverage(documents: Document[], events: EventRow[]): DocCoverage[] {
  const eventsByDoc = new Map<string, number>();
  for (const event of events) {
    if (event.document_id) {
      eventsByDoc.set(event.document_id, (eventsByDoc.get(event.document_id) ?? 0) + 1);
    }
  }

  return documents.map((doc) => {
    const eventCount = eventsByDoc.get(doc.id) ?? 0;
    let status: DocCoverage['status'];

    if (doc.processing_status === 'errore') {
      status = 'error';
    } else if (PROCESSING_STATUSES.has(doc.processing_status) || doc.processing_status === 'caricato') {
      status = 'processing';
    } else if (doc.processing_status === 'completato' && eventCount === 0) {
      status = 'warning';
    } else if (eventCount > 0) {
      status = 'ok';
    } else {
      status = 'warning';
    }

    return { doc, eventCount, status };
  });
}

const STATUS_ICON = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  processing: Loader2,
} as const;

const STATUS_COLOR = {
  ok: 'text-green-600',
  warning: 'text-yellow-600',
  error: 'text-red-600',
  processing: 'text-blue-500',
} as const;

// --- Incomplete data check ---

function getDocsWithoutEvents(documents: Document[], events: EventRow[]): Document[] {
  const docIds = new Set(events.map((e) => e.document_id).filter(Boolean));
  return documents.filter(
    (d) => d.processing_status === 'completato' && !docIds.has(d.id),
  );
}

// --- Component ---

export function QualitySidebar({
  report,
  events,
  anomalies,
  missingDocs,
  documents,
  documentPages,
  onSwitchToAnomalies,
  onOpenOcr,
}: QualitySidebarProps) {
  const highSeverity = anomalies.filter((a) => a.severity === 'critica' || a.severity === 'alta');
  const isSynthesisTruncated = report.synthesis ? isTruncated(report.synthesis) : false;
  const incompleteDataDocs = getDocsWithoutEvents(documents, events);
  const ocrConfidence = computeOcrConfidence(documentPages);
  const coverage = computeCoverage(documents, events);
  const okCount = coverage.filter((c) => c.status === 'ok').length;

  const alertCount = highSeverity.length
    + missingDocs.length
    + (isSynthesisTruncated ? 1 : 0)
    + (incompleteDataDocs.length > 0 ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* === Segnalazioni === */}
      <Collapsible defaultOpen={alertCount > 0}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Segnalazioni
          </span>
          {alertCount > 0 ? (
            <Badge variant="destructive" className="text-xs">
              {alertCount}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              OK
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pt-3 space-y-2">
          {alertCount === 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-green-500" />
              Nessuna segnalazione rilevante.
            </p>
          )}

          {isSynthesisTruncated && (
            <div className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Report potenzialmente troncato. Prova a rigenerarlo.</span>
            </div>
          )}

          {highSeverity.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">
                  {highSeverity.length} {highSeverity.length === 1 ? 'anomalia' : 'anomalie'} da verificare
                </span>
                {onSwitchToAnomalies && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 ml-1 text-xs"
                    onClick={onSwitchToAnomalies}
                  >
                    Vedi dettagli
                  </Button>
                )}
              </div>
            </div>
          )}

          {missingDocs.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-400">
              <FileQuestion className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {missingDocs.length} doc. {missingDocs.length === 1 ? 'mancante' : 'mancanti'}
              </span>
            </div>
          )}

          {incompleteDataDocs.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {incompleteDataDocs.length} {incompleteDataDocs.length === 1 ? 'documento senza' : 'documenti senza'} eventi estratti
              </span>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* === Copertura Documenti === */}
      {documents.length > 0 && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Copertura Documenti
            </span>
            <span className="text-xs text-muted-foreground">
              {okCount}/{documents.length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pt-3">
            <div className="space-y-1">
              {coverage.map((c) => {
                const Icon = STATUS_ICON[c.status];
                return (
                  <div
                    key={c.doc.id}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className={`h-3 w-3 shrink-0 ${STATUS_COLOR[c.status]}${c.status === 'processing' ? ' animate-spin' : ''}`} />
                      <span className="truncate">{c.doc.file_name}</span>
                    </div>
                    <span className="shrink-0 text-muted-foreground ml-2">
                      {c.status === 'error'
                        ? 'Errore'
                        : c.status === 'processing'
                          ? 'In elab.'
                          : c.eventCount === 0
                            ? '0 eventi'
                            : `${c.eventCount} ev.`}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* === Metriche === */}
      <div className="rounded-lg border px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Metriche
        </p>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Eventi
            </span>
            <span className="font-medium">{events.length}</span>
          </div>

          {ocrConfidence !== null && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Qualità OCR
              </span>
              <span className={`font-medium ${confidenceColor(ocrConfidence)}`}>
                {ocrConfidence}%
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Versione</span>
            <span className="font-medium">v{report.version}</span>
          </div>
        </div>
      </div>

      {/* === Avanzate === */}
      {onOpenOcr && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-muted-foreground"
          onClick={onOpenOcr}
        >
          <Settings2 className="mr-1.5 h-3.5 w-3.5" />
          Avanzate: visualizza OCR
        </Button>
      )}
    </div>
  );
}

/**
 * Count of actionable alerts for mobile badge.
 */
export function computeAlertCount(
  report: ReportRow,
  anomalies: AnomalyRow[],
  missingDocs: MissingDocRow[],
  documents: Document[],
  events: EventRow[],
): number {
  const highSeverity = anomalies.filter((a) => a.severity === 'critica' || a.severity === 'alta');
  const isSynthesisTruncated = report.synthesis ? isTruncated(report.synthesis) : false;
  const incompleteDataDocs = getDocsWithoutEvents(documents, events);

  return highSeverity.length
    + missingDocs.length
    + (isSynthesisTruncated ? 1 : 0)
    + (incompleteDataDocs.length > 0 ? 1 : 0);
}
