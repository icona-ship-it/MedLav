'use client';

import { CheckCircle2, AlertTriangle, XCircle, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { documentTypeLabels } from '@/lib/constants';
import type { Document, EventRow } from './types';

interface DocumentCoverageCardProps {
  documents: Document[];
  events: EventRow[];
}

interface DocCoverage {
  doc: Document;
  eventCount: number;
  status: 'ok' | 'warning' | 'error' | 'processing';
}

const PROCESSING_STATUSES = new Set(['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso']);

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

export function DocumentCoverageCard({ documents, events }: DocumentCoverageCardProps) {
  if (documents.length === 0) return null;

  const coverage = computeCoverage(documents, events);
  const okCount = coverage.filter((c) => c.status === 'ok').length;
  const warningCount = coverage.filter((c) => c.status === 'warning').length;
  const errorCount = coverage.filter((c) => c.status === 'error').length;
  const processingCount = coverage.filter((c) => c.status === 'processing').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Copertura Documenti
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            {okCount > 0 && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3 w-3" /> {okCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-600">
                <AlertTriangle className="h-3 w-3" /> {warningCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <XCircle className="h-3 w-3" /> {errorCount}
              </span>
            )}
            {processingCount > 0 && (
              <span className="flex items-center gap-1 text-blue-500">
                <Loader2 className="h-3 w-3 animate-spin" /> {processingCount}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {okCount}/{documents.length} documenti con eventi estratti
          {warningCount > 0 && `, ${warningCount} senza eventi`}
          {errorCount > 0 && `, ${errorCount} con errori`}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {coverage.map((c) => {
            const Icon = STATUS_ICON[c.status];
            return (
              <div
                key={c.doc.id}
                className="flex items-center justify-between rounded px-2 py-1 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${STATUS_COLOR[c.status]}${c.status === 'processing' ? ' animate-spin' : ''}`} />
                  <span className="truncate">{c.doc.file_name}</span>
                  {c.doc.document_type && c.doc.document_type !== 'altro' && (
                    <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                      {documentTypeLabels[c.doc.document_type] ?? c.doc.document_type}
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground ml-2">
                  {c.status === 'error'
                    ? 'Errore'
                    : c.status === 'processing'
                      ? 'In elaborazione...'
                      : c.eventCount === 0
                        ? 'Nessun evento'
                        : `${c.eventCount} eventi`}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
