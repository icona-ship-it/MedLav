import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getAnalyticsData } from './actions';

const caseTypeLabels: Record<string, string> = {
  ortopedica: 'Ortopedica',
  oncologica: 'Oncologica',
  ostetrica: 'Ostetrica',
  anestesiologica: 'Anestesiologica',
  infezione_nosocomiale: 'Infezione Nosocomiale',
  errore_diagnostico: 'Errore Diagnostico',
  rc_auto: 'RC Auto',
  previdenziale: 'Previdenziale',
  infortuni: 'Infortuni',
  generica: 'Generica',
};

const roleLabels: Record<string, string> = {
  ctu: 'CTU',
  ctp: 'CTP',
  stragiudiziale: 'Stragiudiziale',
};

export default async function AnalyticsPage() {
  const data = await getAnalyticsData();

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-bold">Analytics</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Utenti attivi (7gg)"
          value={data.activeUsersLast7Days.toString()}
        />
        <StatCard
          label="Tasso successo pipeline"
          value={`${data.pipelineSuccessRate.rate.toFixed(1)}%`}
          detail={`${data.pipelineSuccessRate.completed}/${data.pipelineSuccessRate.total}`}
        />
        <StatCard
          label="Tempo medio elaborazione"
          value={data.avgProcessingTimeMinutes !== null ? `${data.avgProcessingTimeMinutes.toFixed(1)} min` : 'N/D'}
        />
        <StatCard
          label="Rating medio report"
          value={data.avgRating !== null ? `${data.avgRating.toFixed(1)}/5` : 'N/D'}
          detail={data.ratingCount > 0 ? `${data.ratingCount} valutazioni` : undefined}
        />
      </div>

      {/* Cases per day */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Casi creati (ultimi 30 giorni)</h2>
        {data.casesLast30Days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun caso negli ultimi 30 giorni.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Data</th>
                  <th className="px-4 py-2 text-left font-medium">Casi creati</th>
                  <th className="px-4 py-2 text-left font-medium">Grafico</th>
                </tr>
              </thead>
              <tbody>
                {data.casesLast30Days.map((day) => {
                  const maxCount = Math.max(...data.casesLast30Days.map((d) => d.count));
                  const pct = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                  return (
                    <tr key={day.date}>
                      <td className="px-4 py-2 font-mono text-xs">{day.date}</td>
                      <td className="px-4 py-2">{day.count}</td>
                      <td className="px-4 py-2">
                        <div className="h-4 rounded bg-primary/20" style={{ width: `${Math.max(pct, 4)}%` }}>
                          <div className="h-full rounded bg-primary" style={{ width: '100%' }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cases by type */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Distribuzione per tipologia</h2>
          {data.casesByType.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun dato.</p>
          ) : (
            <div className="space-y-2">
              {data.casesByType.map((item) => (
                <div key={item.type} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{caseTypeLabels[item.type] ?? item.type}</span>
                  <span className="font-mono text-sm font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cases by role */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Distribuzione per ruolo</h2>
          {data.casesByRole.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun dato.</p>
          ) : (
            <div className="space-y-2">
              {data.casesByRole.map((item) => (
                <div key={item.role} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{roleLabels[item.role] ?? item.role}</span>
                  <span className="font-mono text-sm font-medium">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Top errors */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Top 5 errori</h2>
        {data.topErrors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun errore registrato.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Errore</th>
                  <th className="px-4 py-2 text-left font-medium">Occorrenze</th>
                </tr>
              </thead>
              <tbody>
                {data.topErrors.map((err, i) => (
                  <tr key={i}>
                    <td className="max-w-lg truncate px-4 py-2 text-red-600 dark:text-red-400">
                      {err.error}
                    </td>
                    <td className="px-4 py-2 font-mono">{err.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
