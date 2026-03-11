'use client';

import { AlertTriangle, FileWarning } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { anomalyTypeLabels } from '@/lib/constants';
import type { AnomalyRow, MissingDocRow } from './types';

// --- Types ---

interface AnomaliesSectionProps {
  anomalies: AnomalyRow[];
}

interface MissingDocsSectionProps {
  missingDocs: MissingDocRow[];
}

// --- Helpers ---

function severityVariant(severity: string): 'destructive' | 'warning' | 'secondary' {
  switch (severity) {
    case 'critica': case 'alta': return 'destructive';
    case 'media': return 'warning';
    default: return 'secondary';
  }
}

// --- Anomalies Component ---

export function AnomaliesSection({ anomalies }: AnomaliesSectionProps) {
  return (
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
  );
}

// --- Missing Docs Component ---

export function MissingDocsSection({ missingDocs }: MissingDocsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-destructive" />
          Documentazione Mancante
        </CardTitle>
        {missingDocs.length > 0 && (() => {
          const checklistItems = missingDocs.filter((d) => (d.document_name as string).startsWith('[CHECKLIST]'));
          const totalChecklist = missingDocs.filter((d) => (d.document_name as string).startsWith('[CHECKLIST]')).length;
          const standardItems = missingDocs.length - totalChecklist;
          return (
            <CardDescription>
              {standardItems > 0 && <span>{standardItems} documenti mancanti</span>}
              {standardItems > 0 && checklistItems.length > 0 && <span> · </span>}
              {checklistItems.length > 0 && <span>{checklistItems.length} item checklist</span>}
            </CardDescription>
          );
        })()}
      </CardHeader>
      <CardContent>
        {missingDocs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessuna documentazione mancante.</p>
        ) : (
          <div className="space-y-3">
            {missingDocs.map((d) => {
              const isChecklist = (d.document_name as string).startsWith('[CHECKLIST]');
              const displayName = isChecklist
                ? (d.document_name as string).replace('[CHECKLIST] ', '')
                : d.document_name;
              return (
                <div key={d.id} className={`rounded-md border p-3 ${isChecklist ? 'border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20' : ''}`}>
                  <div className="flex items-center gap-2">
                    {isChecklist && <Badge variant="outline" className="text-xs">Checklist</Badge>}
                    <p className="text-sm font-medium">{displayName}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{d.reason}</p>
                  {d.related_event && (
                    <p className="mt-1 text-xs text-muted-foreground">Evento correlato: {d.related_event}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
