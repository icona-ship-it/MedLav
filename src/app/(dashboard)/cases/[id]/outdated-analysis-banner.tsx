'use client';

/**
 * Avviso "analisi di una versione precedente" (ciclo di consegna 2026-09-04).
 * Ogni feedback dei medici è arrivato su un caso già elaborato: senza questo
 * segnale il medico riapre il vecchio output e conclude che il fix non c'è.
 * Mostrato SOLO quando l'analisi è completata ed è stata avviata prima della
 * build corrente; mai su casi in corso o senza timestamp (fail-safe).
 */

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PIPELINE_CHANGED_AT, isAnalysisOlderThanBuild } from '@/lib/build-info';

interface OutdatedAnalysisBannerProps {
  processingStage: string;
  processingStartedAt?: string | null;
  /** Porta al passaggio Elaborazione, dove sta "Riavvia analisi". */
  onGoToProcessing: () => void;
}

function formatItalianDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function OutdatedAnalysisBanner({ processingStage, processingStartedAt, onGoToProcessing }: OutdatedAnalysisBannerProps) {
  if (processingStage !== 'completato') return null;
  if (!isAnalysisOlderThanBuild(processingStartedAt)) return null;
  const changed = formatItalianDate(PIPELINE_CHANGED_AT);

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        Questa analisi è stata eseguita con una versione precedente dell&apos;app
        {changed ? ` (aggiornata il ${changed})` : ''}: i dati che vedi non includono le ultime novità.
        Per applicarle riavvia l&apos;analisi (costa crediti come una nuova elaborazione).
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onGoToProcessing} className="shrink-0">
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Vai a Riavvia analisi
      </Button>
    </div>
  );
}
