'use client';

import { Activity } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { calculateITTITP } from '@/services/calculations/medico-legal-calc';
import type { EventRow } from './types';

/**
 * A2 (Lavini): read-only summary table of graduated temporary disability
 * (ITT 100% / ITP 75% / 50% / 25%) computed from the case timeline. These are
 * PROPOSED values — the perito verifies and adjusts them in the report.
 */
export function IttItpSummary({ events, incidentDate }: { events: EventRow[]; incidentDate?: string | null }) {
  const segments = calculateITTITP(
    events.map((e) => ({
      event_date: e.event_date,
      event_type: e.event_type,
      title: e.title,
      description: e.description,
      date_precision: e.date_precision, // F-P2: le date anno-only non ancorano l'ITP
    })),
    incidentDate,
  );

  if (segments.length === 0) return null;

  const totalDays = segments.reduce((sum, s) => sum + s.days, 0);
  const hasEstimate = segments.some((s) => s.estimated);

  return (
    <div className="mb-4 rounded-lg border border-info/30 bg-info/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Activity className="h-4 w-4 text-info" aria-hidden="true" />
        Invalidità temporanea (proposta)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium">Periodo</th>
              <th className="py-1 pr-3 font-medium">Dal</th>
              <th className="py-1 pr-3 font-medium">Al</th>
              <th className="py-1 pr-3 font-medium text-right">Giorni</th>
              <th className="py-1 font-medium text-right">Invalidità</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.label} className="border-t border-border/50">
                <td className="py-1 pr-3">
                  {s.label}
                  {s.estimated && <span className="ml-1 text-xs text-muted-foreground">(stima)</span>}
                </td>
                <td className="py-1 pr-3 tabular-nums">{s.startDate ? formatDate(s.startDate) : '—'}</td>
                <td className="py-1 pr-3 tabular-nums">{s.endDate ? formatDate(s.endDate) : '—'}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{s.days}</td>
                <td className="py-1 text-right tabular-nums">{s.percentage}%</td>
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <td className="py-1 pr-3" colSpan={3}>Totale giorni</td>
              <td className="py-1 pr-3 text-right tabular-nums">{totalDays}</td>
              <td className="py-1" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Valori indicativi calcolati dalla cronistoria{hasEstimate ? ' (alcuni periodi sono stime in assenza di fasi riabilitative documentate)' : ''}.
        Il perito verifica e corregge le percentuali nel report.
      </p>
    </div>
  );
}
