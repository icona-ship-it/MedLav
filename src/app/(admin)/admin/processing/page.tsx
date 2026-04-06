'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { getProcessingDocuments, getStuckCases, forceResetCase, forceResetAllStuckCases } from '../actions';

const statusLabels: Record<string, string> = {
  in_coda: 'In coda',
  ocr_in_corso: 'OCR in corso',
  estrazione_in_corso: 'Estrazione in corso',
  validazione_in_corso: 'Validazione in corso',
};

const stageLabels: Record<string, string> = {
  elaborazione: 'Elaborazione',
  generazione_report: 'Generazione report',
  revisione_classificazione: 'Revisione classificazione',
  revisione_anomalie: 'Revisione anomalie',
};

type ProcessingDocument = Awaited<ReturnType<typeof getProcessingDocuments>>[number];
type StuckCase = Awaited<ReturnType<typeof getStuckCases>>[number];

function formatElapsed(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

export default function ProcessingPage() {
  const [documents, setDocuments] = useState<ProcessingDocument[]>([]);
  const [stuckCases, setStuckCases] = useState<StuckCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isResetting, startReset] = useTransition();
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [docs, stuck] = await Promise.all([
        getProcessingDocuments(),
        getStuckCases(),
      ]);
      setDocuments(docs);
      setStuckCases(stuck);
      setLastRefresh(new Date());
    } catch {
      // Admin auth may have expired
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Re-render timer every second for elapsed time display
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  function handleResetCase(caseId: string, code: string) {
    startReset(async () => {
      setResetMessage(null);
      const result = await forceResetCase(caseId);
      if (result.success) {
        setResetMessage(`Caso ${code} resettato con successo`);
        await refresh();
      } else {
        setResetMessage(`Errore: ${result.error}`);
      }
    });
  }

  function handleResetAll() {
    startReset(async () => {
      setResetMessage(null);
      const result = await forceResetAllStuckCases();
      if (result.success) {
        setResetMessage(`${result.count} casi resettati con successo`);
        await refresh();
      } else {
        setResetMessage('Errore durante il reset');
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Monitor Pipeline</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Auto-refresh ogni 5s | Ultimo: {lastRefresh.toLocaleTimeString('it-IT')}
          </span>
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        </div>
      </div>

      {/* Reset feedback */}
      {resetMessage && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300">
          {resetMessage}
        </div>
      )}

      {/* Stuck cases section */}
      {stuckCases.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-orange-700 dark:text-orange-400">
              Casi bloccati ({stuckCases.length})
            </h2>
            <button
              type="button"
              onClick={handleResetAll}
              disabled={isResetting}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {isResetting ? 'Reset in corso...' : 'Resetta tutti'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-md border border-orange-200 dark:border-orange-800">
            <table className="w-full text-sm">
              <thead className="border-b bg-orange-50/50 dark:bg-orange-950/20">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Caso</th>
                  <th className="px-4 py-3 text-left font-medium">Paziente</th>
                  <th className="px-4 py-3 text-left font-medium">Stato</th>
                  <th className="px-4 py-3 text-left font-medium">Bloccato da</th>
                  <th className="px-4 py-3 text-left font-medium">Azione</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stuckCases.map((c) => (
                  <tr key={c.id} className="bg-orange-50/30 dark:bg-orange-950/10">
                    <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.patientInitials || 'N/D'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        {stageLabels[c.processingStage] ?? c.processingStage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatElapsed(c.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleResetCase(c.id, c.code)}
                        disabled={isResetting}
                        className="rounded-md border border-orange-300 bg-white px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50 dark:bg-orange-950/20 dark:border-orange-700 dark:text-orange-400 transition-colors"
                      >
                        Forza reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Processing documents section */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Documenti in elaborazione</h2>

        {loading ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">Nessun documento in elaborazione.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Caso</th>
                  <th className="px-4 py-3 text-left font-medium">File</th>
                  <th className="px-4 py-3 text-left font-medium">Stato</th>
                  <th className="px-4 py-3 text-left font-medium">Dall&apos;ultimo update</th>
                  <th className="px-4 py-3 text-left font-medium">Tempo totale</th>
                  <th className="px-4 py-3 text-left font-medium">Segnalazione</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {documents.map((doc) => {
                  const elapsedMs = Date.now() - new Date(doc.updated_at).getTime();
                  const isStuck = elapsedMs > STUCK_THRESHOLD_MS;

                  return (
                    <tr
                      key={doc.id}
                      className={isStuck ? 'bg-orange-50 dark:bg-orange-950/20' : ''}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{doc.caseCode}</td>
                      <td className="max-w-48 truncate px-4 py-3">{doc.file_name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                          {statusLabels[doc.processing_status] ?? doc.processing_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatElapsed(doc.updated_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatElapsed(doc.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {isStuck ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            Potenzialmente bloccato
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        I documenti sono segnalati come &quot;potenzialmente bloccati&quot; se non ricevono aggiornamenti da oltre 30 minuti.
      </p>
    </div>
  );
}
