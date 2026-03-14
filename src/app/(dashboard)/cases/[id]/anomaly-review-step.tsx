'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, Loader2, ChevronDown, ChevronRight, Play, PauseCircle, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  processingStage: string;
  onAnomaliesChanged: (updatedAnomalies: AnomalyRow[]) => void;
}

// --- Helpers ---

/** An anomaly requires user action (confirm or dismiss) */
function needsUserAction(status: string | null): boolean {
  return status === 'detected' || status === 'llm_confirmed';
}

/** User has already acted on this anomaly */
function isUserActioned(status: string | null): boolean {
  return status === 'user_dismissed' || status === 'user_confirmed';
}

// --- Component ---

export function AnomalyReviewStep({
  caseId,
  anomalies,
  missingDocs,
  events,
  documents,
  documentPages,
  processingStage,
  onAnomaliesChanged,
}: AnomalyReviewStepProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const activeAnomalies = useMemo(
    () => anomalies.filter((a) => a.status !== 'user_dismissed'),
    [anomalies],
  );

  // Only count anomalies that require user action (not auto-resolved by AI)
  const userActionableCount = useMemo(
    () => anomalies.filter((a) => needsUserAction(a.status)).length,
    [anomalies],
  );

  const userActionedCount = useMemo(
    () => anomalies.filter((a) => isUserActioned(a.status)).length,
    [anomalies],
  );

  const totalActionable = userActionableCount + userActionedCount;
  const totalIssues = anomalies.length + missingDocs.length;
  const hasNoIssues = totalIssues === 0;
  const progressPercent = totalActionable > 0 ? Math.round((userActionedCount / totalActionable) * 100) : 100;

  // The pipeline is paused and waiting for user action
  const isPaused = processingStage === 'revisione_anomalie';

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
        {/* Paused banner */}
        {isPaused && (
          <div className="flex items-center gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-950/30">
            <PauseCircle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Elaborazione in pausa — in attesa della tua conferma
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Il report non verra generato finche non confermi.
              </p>
            </div>
          </div>
        )}

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
                className="mt-2 text-base py-6 px-8 bg-green-600 hover:bg-green-700 text-white shadow-md"
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
      {/* Paused banner — visually prominent */}
      {isPaused && (
        <div className="flex items-center gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-950/30">
          <PauseCircle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Elaborazione in pausa — in attesa della tua revisione
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              Rivedi le segnalazioni qui sotto, poi clicca &quot;Genera Report&quot; per continuare.
            </p>
          </div>
          <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 shrink-0">
            In pausa
          </Badge>
        </div>
      )}

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
              {userActionedCount} di {totalActionable} revisionate
            </span>
            <span className="text-xs text-muted-foreground">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Puoi confermare (includi nel report) o ignorare (escludi) le anomalie. Le anomalie risolte dall&apos;analisi automatica non richiedono azione.
          </p>
        </CardContent>
      </Card>

      {/* Workflow guide — always visible */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/30 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-blue-900 dark:text-blue-200">Come funziona la revisione</p>
            <p className="text-blue-800 dark:text-blue-300">
              Per ogni anomalia rilevata, hai due opzioni:
            </p>
            <ul className="space-y-1.5 text-blue-700 dark:text-blue-400">
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 mt-0.5 text-[10px] border-amber-500 text-amber-700 dark:text-amber-400">Segnala</Badge>
                <span>L&apos;anomalia e reale e rilevante — verra <strong>inclusa nel report</strong> finale.</span>
              </li>
              <li className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 mt-0.5 text-[10px] border-gray-400 text-gray-600 dark:text-gray-400">Escludi</Badge>
                <span>L&apos;anomalia non e rilevante — <strong>non apparira nel report</strong>.</span>
              </li>
            </ul>
            <p className="text-xs text-blue-600 dark:text-blue-500">
              Le anomalie con badge verde &quot;Risolta automaticamente&quot; non richiedono azione. Non e obbligatorio revisionare tutto: le anomalie non gestite verranno comunque segnalate nel report.
            </p>
          </div>
        </div>
      </div>

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

      {/* Generate Report button — prominent and always visible */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground text-center">
              Non e necessario revisionare ogni anomalia. Le anomalie non archiviate saranno segnalate nel report.
            </p>
            <Button
              size="lg"
              className="text-base py-6 px-12 bg-green-600 hover:bg-green-700 text-white shadow-md"
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
