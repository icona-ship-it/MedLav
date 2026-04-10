'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getSystemStats,
  getRecentCases,
  getStuckCases,
  forceResetCase,
  getAverageRating,
  getRecentCosts,
} from './actions';

type SystemStats = Awaited<ReturnType<typeof getSystemStats>>;
type RecentCase = Awaited<ReturnType<typeof getRecentCases>>[number];
type StuckCase = Awaited<ReturnType<typeof getStuckCases>>[number];
type RatingStats = Awaited<ReturnType<typeof getAverageRating>>;
type CostStats = Awaited<ReturnType<typeof getRecentCosts>>;

const stageLabels: Record<string, string> = {
  idle: 'Pronto',
  elaborazione: 'In elaborazione',
  generazione_report: 'Generazione report',
  completato: 'Completato',
  errore: 'Errore',
};

const stageBadgeColors: Record<string, string> = {
  idle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  elaborazione: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  generazione_report: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  completato: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  errore: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [cases, setCases] = useState<RecentCase[]>([]);
  const [stuckCases, setStuckCases] = useState<StuckCase[]>([]);
  const [ratingStats, setRatingStats] = useState<RatingStats>({ avg: null, count: 0 });
  const [costs, setCosts] = useState<CostStats>({ totalCostUSD: 0, avgCostPerCase: 0, casesWithCostData: 0 });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [resettingId, setResettingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, c, stuck, r, co] = await Promise.all([
        getSystemStats(),
        getRecentCases(),
        getStuckCases(),
        getAverageRating(),
        getRecentCosts(),
      ]);
      setStats(s);
      setCases(c);
      setStuckCases(stuck);
      setRatingStats(r);
      setCosts(co);
      setLastRefresh(new Date());
    } catch {
      // Auth may have expired
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleResetCase(caseId: string) {
    setResettingId(caseId);
    await forceResetCase(caseId);
    setResettingId(null);
    refresh();
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Caricamento dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Auto-refresh 10s | {lastRefresh.toLocaleTimeString('it-IT')}
          </span>
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label="Utenti" value={stats.totalUsers} />
          <StatCard label="Casi" value={stats.totalCases} />
          <StatCard label="Documenti" value={stats.totalDocuments} />
          <StatCard label="Eventi" value={stats.totalEvents} />
          <StatCard
            label="Rating medio"
            value={ratingStats.avg !== null ? ratingStats.avg.toFixed(1) : '—'}
            detail={ratingStats.count > 0 ? `${ratingStats.count} valutazioni` : undefined}
          />
        </div>
      )}

      {/* Costi API */}
      {costs.casesWithCostData > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard label="Costo API (30gg)" value={`$${costs.totalCostUSD.toFixed(2)}`} />
          <StatCard label="Costo medio/caso" value={`$${costs.avgCostPerCase.toFixed(2)}`} />
          <StatCard label="Casi con dati costo" value={costs.casesWithCostData.toString()} />
        </div>
      )}

      {/* Stuck Cases Alert */}
      {stuckCases.length > 0 && (
        <section className="rounded-lg border-2 border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-950/20 p-4">
          <h2 className="text-lg font-semibold text-orange-700 dark:text-orange-400 mb-3">
            {stuckCases.length} {stuckCases.length === 1 ? 'caso bloccato' : 'casi bloccati'}
          </h2>
          <div className="space-y-2">
            {stuckCases.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md bg-white dark:bg-gray-900 border px-4 py-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-medium">{c.code}</span>
                  <span className="text-xs text-muted-foreground">{c.patientInitials ?? ''}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${stageBadgeColors[c.processingStage] ?? 'bg-gray-100'}`}>
                    {stageLabels[c.processingStage] ?? c.processingStage}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleResetCase(c.id)}
                  disabled={resettingId === c.id}
                  className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {resettingId === c.id ? 'Reset...' : 'Forza reset'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Cases */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Ultimi 20 casi</h2>
          <Link href="/admin/processing" className="text-sm text-primary hover:underline">
            Monitor pipeline &rarr;
          </Link>
        </div>
        {cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun caso.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Caso</th>
                  <th className="px-4 py-2 text-left font-medium">Paziente</th>
                  <th className="px-4 py-2 text-left font-medium">Stato</th>
                  <th className="px-4 py-2 text-left font-medium">Documenti</th>
                  <th className="px-4 py-2 text-left font-medium">Utente</th>
                  <th className="px-4 py-2 text-left font-medium">Aggiornato</th>
                  <th className="px-4 py-2 text-left font-medium">Errore</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cases.map((c) => (
                  <tr key={c.id} className={c.processingStage === 'errore' ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                    <td className="px-4 py-2 font-mono text-xs font-medium">{c.code}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.patientInitials ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${stageBadgeColors[c.processingStage] ?? 'bg-gray-100'}`}>
                        {stageLabels[c.processingStage] ?? c.processingStage}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">{c.documentCount}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-32">
                      {c.userName ?? c.userEmail}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.updatedAgo}</td>
                    <td className="px-4 py-2 text-xs text-red-600 dark:text-red-400 truncate max-w-48">
                      {c.lastError ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Links */}
      <div className="flex gap-4 text-sm">
        <Link href="/admin/analytics" className="text-primary hover:underline">Analytics completi &rarr;</Link>
        <Link href="/admin/audit" className="text-primary hover:underline">Audit log &rarr;</Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString('it-IT') : value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
