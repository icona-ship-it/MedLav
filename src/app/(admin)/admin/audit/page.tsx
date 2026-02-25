'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAuditLogs } from '../actions';

type AuditLogEntry = Awaited<ReturnType<typeof getAuditLogs>>['logs'][number];

function formatTimestamp(isoDate: string): string {
  return new Date(isoDate).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const result = await getAuditLogs(pageNum);
      setLogs(result.logs);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch {
      // Admin auth may have expired
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(page);
  }, [page, fetchLogs]);

  const filteredLogs = actionFilter
    ? logs.filter((log) => log.action.includes(actionFilter))
    : logs;

  // Collect unique actions for filter
  const uniqueActions = [...new Set(logs.map((log) => log.action))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString('it-IT')} eventi totali
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          <option value="">Tutte le azioni</option>
          {uniqueActions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">Nessun log trovato.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                <th className="px-4 py-3 text-left font-medium">Utente</th>
                <th className="px-4 py-3 text-left font-medium">Azione</th>
                <th className="px-4 py-3 text-left font-medium">Entita</th>
                <th className="px-4 py-3 text-left font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {formatTimestamp(log.created_at)}
                  </td>
                  <td className="px-4 py-3 text-xs">{log.userEmail}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {log.entity_type}
                    {log.entity_id ? (
                      <span className="ml-1 font-mono text-muted-foreground">
                        {log.entity_id.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-64 truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                    {log.metadata ? JSON.stringify(log.metadata) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Precedente
          </button>
          <span className="text-sm text-muted-foreground">
            Pagina {page} di {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Successiva
          </button>
        </div>
      )}
    </div>
  );
}
