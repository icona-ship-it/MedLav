import Link from 'next/link';
import {
  getSystemStats,
  getProcessingDocuments,
  getRecentErrors,
  getRecentCompletions,
  getAverageRating,
} from './actions';

const statusLabels: Record<string, string> = {
  in_coda: 'In coda',
  ocr_in_corso: 'OCR in corso',
  estrazione_in_corso: 'Estrazione in corso',
  validazione_in_corso: 'Validazione in corso',
  completato: 'Completato',
  errore: 'Errore',
  caricato: 'Caricato',
};

export default async function AdminDashboardPage() {
  const [stats, processing, errors, completions, ratingStats] = await Promise.all([
    getSystemStats(),
    getProcessingDocuments(),
    getRecentErrors(),
    getRecentCompletions(),
    getAverageRating(),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard Admin</h1>

      {/* Stats overview */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Utenti" value={stats.totalUsers} />
        <StatCard label="Casi" value={stats.totalCases} />
        <StatCard label="Documenti" value={stats.totalDocuments} />
        <StatCard label="Eventi estratti" value={stats.totalEvents} />
        <StatCard
          label="Rating medio report"
          value={ratingStats.avg !== null ? Number(ratingStats.avg.toFixed(1)) : 0}
          suffix={ratingStats.count > 0 ? `(${ratingStats.count} valutazioni)` : 'N/D'}
        />
      </div>

      {/* Link to analytics */}
      <div>
        <Link href="/admin/analytics" className="text-sm text-primary hover:underline">
          Vedi analytics completi &rarr;
        </Link>
      </div>

      {/* Processing in corso */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Elaborazioni in corso ({processing.length})
        </h2>
        {processing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna elaborazione attiva.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Caso</th>
                  <th className="px-4 py-2 text-left font-medium">File</th>
                  <th className="px-4 py-2 text-left font-medium">Stato</th>
                  <th className="px-4 py-2 text-left font-medium">Ultimo aggiornamento</th>
                  <th className="px-4 py-2 text-left font-medium">Tempo trascorso</th>
                </tr>
              </thead>
              <tbody>
                {processing.map((doc) => (
                  <tr key={doc.id} className={doc.isStuck ? 'bg-orange-50 dark:bg-orange-950/20' : ''}>
                    <td className="px-4 py-2 font-mono text-xs">{doc.caseCode}</td>
                    <td className="max-w-48 truncate px-4 py-2">{doc.file_name}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        {statusLabels[doc.processing_status] ?? doc.processing_status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{doc.lastUpdateAgo}</td>
                    <td className="px-4 py-2">
                      {doc.isStuck ? (
                        <span className="font-medium text-orange-600 dark:text-orange-400">
                          {doc.elapsedLabel}
                        </span>
                      ) : (
                        doc.elapsedLabel
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Errori recenti */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Errori recenti ({errors.length})
        </h2>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun errore recente.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Caso</th>
                  <th className="px-4 py-2 text-left font-medium">File</th>
                  <th className="px-4 py-2 text-left font-medium">Errore</th>
                  <th className="px-4 py-2 text-left font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-4 py-2 font-mono text-xs">{doc.caseCode}</td>
                    <td className="max-w-48 truncate px-4 py-2">{doc.file_name}</td>
                    <td className="max-w-72 truncate px-4 py-2 text-red-600 dark:text-red-400">
                      {doc.processing_error ?? 'Errore sconosciuto'}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{doc.updatedAgo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Completamenti recenti */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Ultime completate</h2>
        {completions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna elaborazione completata.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Caso</th>
                  <th className="px-4 py-2 text-left font-medium">File</th>
                  <th className="px-4 py-2 text-left font-medium">Durata</th>
                  <th className="px-4 py-2 text-left font-medium">Completato</th>
                </tr>
              </thead>
              <tbody>
                {completions.map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-4 py-2 font-mono text-xs">{doc.caseCode}</td>
                    <td className="max-w-48 truncate px-4 py-2">{doc.file_name}</td>
                    <td className="px-4 py-2">{doc.durationLabel}</td>
                    <td className="px-4 py-2 text-muted-foreground">{doc.completedAgo}</td>
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

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value.toLocaleString('it-IT')}</p>
      {suffix && <p className="text-xs text-muted-foreground">{suffix}</p>}
    </div>
  );
}
