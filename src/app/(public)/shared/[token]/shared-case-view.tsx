'use client';

import { useState } from 'react';
import { AlertTriangle, FileWarning, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MarkdownPreview } from '@/components/markdown-preview';
import { caseTypeLabels, anomalyTypeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/format';

interface SharedCaseViewProps {
  caseData: {
    id: string;
    code: string;
    case_type: string;
    case_role: string;
    patient_initials: string | null;
    status: string;
  };
  events: Array<{
    id: string;
    order_number: number;
    event_date: string;
    event_type: string;
    title: string;
    description: string;
    diagnosis: string | null;
    doctor: string | null;
    facility: string | null;
  }>;
  anomalies: Array<{
    id: string;
    anomaly_type: string;
    severity: string;
    description: string;
    suggestion: string | null;
  }>;
  missingDocs: Array<{
    id: string;
    document_name: string;
    reason: string;
  }>;
  report: {
    id: string;
    version: number;
    report_status: string;
    synthesis: string | null;
  } | null;
}

const roleLabels: Record<string, string> = {
  ctu: 'CTU',
  ctp: 'CTP',
  stragiudiziale: 'Stragiudiziale',
};

function severityVariant(severity: string): 'destructive' | 'warning' | 'secondary' {
  switch (severity) {
    case 'critica': case 'alta': return 'destructive';
    case 'media': return 'warning';
    default: return 'secondary';
  }
}

export function SharedCaseView({ caseData, events, anomalies, missingDocs, report }: SharedCaseViewProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{caseData.code}</h1>
            <Badge variant="secondary">{roleLabels[caseData.case_role] ?? caseData.case_role}</Badge>
            <Badge variant="outline">{caseTypeLabels[caseData.case_type] ?? caseData.case_type}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Paziente: {caseData.patient_initials || 'N/D'}
          </p>
        </div>

        {/* Content tabs */}
        <Tabs defaultValue="report">
          <TabsList>
            <TabsTrigger value="report">Report</TabsTrigger>
            <TabsTrigger value="events">Eventi ({events.length})</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalie ({anomalies.length})</TabsTrigger>
            <TabsTrigger value="missing">Doc. Mancanti ({missingDocs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="report">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Report Medico-Legale</CardTitle>
                  {report && <Badge variant="secondary">v{report.version}</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                {report?.synthesis ? (
                  <MarkdownPreview content={report.synthesis} />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nessun report disponibile.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>Timeline Eventi</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nessun evento.</p>
                ) : (
                  <div className="space-y-3">
                    {events.map((event) => (
                      <SharedEventCard key={event.id} event={event} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
                  <p className="py-8 text-center text-sm text-muted-foreground">Nessuna anomalia.</p>
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
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground border-t pt-4">
          Generato con MedLav &mdash; Caso condiviso in sola lettura
        </div>
      </div>
    </div>
  );
}

function SharedEventCard({ event }: { event: SharedCaseViewProps['events'][number] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              {event.order_number}.
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(event.event_date)}
                {event.facility && ` — ${event.facility}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">{event.event_type}</Badge>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 py-2 ml-8 space-y-1 text-sm">
          <p>{event.description}</p>
          {event.diagnosis && <p className="text-muted-foreground">Diagnosi: {event.diagnosis}</p>}
          {event.doctor && <p className="text-muted-foreground">Medico: {event.doctor}</p>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
