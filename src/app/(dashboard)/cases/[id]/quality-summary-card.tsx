'use client';

import {
  FileText, AlertTriangle, AlertCircle, FileQuestion, Eye,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EventRow, AnomalyRow, MissingDocRow } from './types';
import type { DocumentPage } from '../../actions';

// --- Types ---

interface QualitySummaryCardProps {
  events: EventRow[];
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  documentPages: DocumentPage[];
}

// --- Helpers ---

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

function severityCount(anomalies: AnomalyRow[], severity: string): number {
  return anomalies.filter((a) => a.severity === severity).length;
}

// --- Component ---

export function QualitySummaryCard({
  events,
  anomalies,
  missingDocs,
  documentPages,
}: QualitySummaryCardProps) {
  const ocrConfidence = computeOcrConfidence(documentPages);
  const criticalCount = severityCount(anomalies, 'critica');
  const highCount = severityCount(anomalies, 'alta');
  const mediumCount = severityCount(anomalies, 'media');

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {/* Events count */}
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{events.length}</span>
            <span className="text-muted-foreground">eventi</span>
          </div>

          {/* Anomalies by severity */}
          {anomalies.length > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Anomalie:</span>
              {criticalCount > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0">
                  {criticalCount} critiche
                </Badge>
              )}
              {highCount > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5 py-0 bg-orange-500">
                  {highCount} alte
                </Badge>
              )}
              {mediumCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {mediumCount} medie
                </Badge>
              )}
              {criticalCount === 0 && highCount === 0 && mediumCount === 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {anomalies.length} basse
                </Badge>
              )}
            </div>
          )}

          {/* Missing docs */}
          {missingDocs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <FileQuestion className="h-4 w-4 text-yellow-500" />
              <span className="font-medium text-yellow-600 dark:text-yellow-400">{missingDocs.length}</span>
              <span className="text-muted-foreground">doc. mancanti</span>
            </div>
          )}

          {/* OCR confidence */}
          {ocrConfidence !== null && (
            <div className="flex items-center gap-1.5">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">OCR:</span>
              <span className={`font-medium ${confidenceColor(ocrConfidence)}`}>
                {ocrConfidence}%
              </span>
            </div>
          )}

          {/* Clean state */}
          {anomalies.length === 0 && missingDocs.length === 0 && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400 font-medium">Nessuna anomalia</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
