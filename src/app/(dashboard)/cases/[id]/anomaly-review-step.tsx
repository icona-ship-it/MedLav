'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, AlertTriangle, Loader2, ChevronDown, ChevronRight, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { csrfHeaders } from '@/lib/csrf-client';
import { AnomaliesSection, MissingDocsSection } from './anomalies-section';
import { QualitySummaryCard } from './quality-summary-card';
import type { AnomalyRow, MissingDocRow, EventRow, Document } from './types';
import type { DocumentPage } from '../../actions';

// --- Types ---

interface AnomalyReviewStepProps {
  caseId: string;
  anomalies: AnomalyRow[];
  missingDocs: MissingDocRow[];
  events: EventRow[];
  documents: Document[];
  documentPages: DocumentPage[];
  onAnomaliesChanged: (updatedAnomalies: AnomalyRow[]) => void;
}

// --- Helpers ---

function isReviewed(status: string | null): boolean {
  return status === 'user_dismissed' || status === 'llm_resolved' || status === 'user_confirmed';
}

// --- Component ---

export function AnomalyReviewStep({
  caseId,
  anomalies,
  missingDocs,
  events,
  documents,
  documentPages,
  onAnomaliesChanged,
}: AnomalyReviewStepProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const activeAnomalies = useMemo(
    () => anomalies.filter((a) => a.status !== 'user_dismissed'),
    [anomalies],
  );

  const reviewedCount = useMemo(
    () => anomalies.filter((a) => isReviewed(a.status)).length,
    [anomalies],
  );

  const totalIssues = anomalies.length + missingDocs.length;
  const hasNoIssues = totalIssues === 0;
  const progressPercent = totalIssues > 0 ? Math.round((reviewedCount / totalIssues) * 100) : 100;

  const handleConfirmReview = useCallback(async () => {
    setIsConfirming(true);
    try {
      const response = await fetch('/api/processing/confirm-anomaly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        toast.error(result.error ?? 'Errore nella conferma');
        return;
      }
      toast.success('Revisione confermata. Generazione report in corso...');
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
    } finally {
      setIsConfirming(false);
    }
  }, [caseId, router]);

  // Zero anomalies state
  if (hasNoIssues) {
    return (
      <div className="space-y-4">
        <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/10">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 py-6">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-green-700 dark:text-green-400">
                  Nessuna anomalia rilevata
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  L&apos;analisi non ha evidenziato problemi. Puoi procedere alla generazione del report.
                </p>
              </div>
              <Button
                size="lg"
                className="mt-2 text-base py-6 px-8"
                onClick={handleConfirmReview}
                disabled={isConfirming}
              >
                {isConfirming ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Play className="mr-2 h-5 w-5" />
                )}
                Genera Report
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quality Summary */}
      <QualitySummaryCard
        events={events}
        anomalies={activeAnomalies}
        missingDocs={missingDocs}
        documentPages={documentPages}
      />

      {/* Progress */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {reviewedCount} di {totalIssues} revisionate
            </span>
            <span className="text-xs text-muted-foreground">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Puoi archiviare le anomalie non rilevanti. Quelle non archiviate saranno incluse nel report come segnalazioni.
          </p>
        </CardContent>
      </Card>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <AnomaliesSection
          anomalies={anomalies}
          events={events}
          documents={documents}
          caseId={caseId}
          onChanged={(dismissedId) => {
            if (dismissedId) {
              const updated = anomalies.filter((a) => a.id !== dismissedId);
              onAnomaliesChanged(updated);
            }
            router.refresh();
          }}
        />
      )}

      {/* Missing docs */}
      {missingDocs.length > 0 && (
        <MissingDocsSection
          missingDocs={missingDocs}
          caseId={caseId}
          onUploadComplete={() => router.refresh()}
        />
      )}

      {/* Timeline preview (collapsible) */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer py-3" onClick={() => setShowTimeline(!showTimeline)}>
            <CardTitle className="flex items-center gap-2 text-sm">
              {showTimeline ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Anteprima Timeline ({events.length} eventi)
            </CardTitle>
          </CardHeader>
          {showTimeline && (
            <CardContent className="pt-0">
              <div className="max-h-64 overflow-y-auto space-y-1">
                {events.slice(0, 30).map((event) => (
                  <div key={event.id} className="flex items-baseline gap-2 text-xs py-0.5">
                    <span className="text-muted-foreground shrink-0 w-20">{event.event_date}</span>
                    <span className="font-medium">{event.title}</span>
                  </div>
                ))}
                {events.length > 30 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    ...e altri {events.length - 30} eventi
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Generate Report button */}
      <div className="flex justify-center pt-2">
        <Button
          size="lg"
          className="text-base py-6 px-8 w-full sm:w-auto"
          onClick={handleConfirmReview}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Play className="mr-2 h-5 w-5" />
          )}
          Genera Report
        </Button>
      </div>

      {/* Hint */}
      <p className="text-center text-xs text-muted-foreground">
        Non è necessario revisionare ogni anomalia. Le anomalie non archiviate saranno segnalate nel report.
      </p>
    </div>
  );
}
