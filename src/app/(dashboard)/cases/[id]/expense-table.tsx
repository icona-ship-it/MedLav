'use client';

import { useState } from 'react';
import type { ExtractedExpenseItem } from '@/services/expenses/expense-extractor';

interface ExpenseTableProps {
  items: ExtractedExpenseItem[];
  totalAmount: number | null;
  caseId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  farmaci: 'Farmaci',
  visite_specialistiche: 'Visite specialistiche',
  esami_diagnostici: 'Esami diagnostici',
  interventi: 'Interventi chirurgici',
  riabilitazione: 'Riabilitazione',
  ausili_protesi: 'Ausili e protesi',
  trasporti: 'Trasporti sanitari',
  altro: 'Altro',
};

function formatCurrency(amount: number): string {
  return `€ ${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  // Handle YYYY-MM-DD format
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function ExpenseTable({ items, totalAmount, caseId }: ExpenseTableProps) {
  const [filter, setFilter] = useState<string>('all');

  const categories = [...new Set(items.map((i) => i.category))].sort();
  const filteredItems = filter === 'all' ? items : items.filter((i) => i.category === filter);

  // Le voci escluse dal totale (es. acconto già assorbito nella fattura a
  // saldo) restano visibili con la motivazione ma non si sommano.
  const filteredTotal = filteredItems.reduce((sum, item) => {
    return item.amount !== null && !item.excludedFromTotal ? sum + item.amount : sum;
  }, 0);
  const hasAnyAmount = filteredItems.some((i) => i.amount !== null && !i.excludedFromTotal);

  return (
    <div className="space-y-4">
      {/* Header with export */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Analisi Spese Mediche</h3>
          <p className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? 'voce' : 'voci'} estratte
            {totalAmount !== null && ` — Totale: ${formatCurrency(totalAmount)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/cases/${caseId}/export/csv?type=expenses`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Esporta CSV
          </a>
        </div>
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
            }`}
          >
            Tutte ({items.length})
          </button>
          {categories.map((cat) => {
            const count = items.filter((i) => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  filter === cat ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-3 py-2 text-left font-medium">N.</th>
              <th className="px-3 py-2 text-left font-medium">Data</th>
              <th className="px-3 py-2 text-left font-medium">Descrizione</th>
              <th className="px-3 py-2 text-right font-medium">Importo</th>
              <th className="px-3 py-2 text-left font-medium">N. Ricevuta</th>
              <th className="px-3 py-2 text-left font-medium">Tipo Farmaco</th>
              <th className="px-3 py-2 text-left font-medium">Categoria</th>
              <th className="px-3 py-2 text-left font-medium">Diagnosi</th>
              <th className="px-3 py-2 text-left font-medium">Note</th>
              <th className="px-3 py-2 text-left font-medium">Interpretazione</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, idx) => (
              <tr key={idx} className={`border-b last:border-b-0 hover:bg-muted/30 ${item.excludedFromTotal ? 'opacity-70' : ''}`}>
                <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                <td className="px-3 py-2 max-w-[250px]">
                  {item.description}
                  {item.excludedFromTotal && (
                    <span className="block text-xs text-amber-700 dark:text-amber-400 italic mt-0.5">
                      Non sommata al totale{item.exclusionReason ? ` — ${item.exclusionReason}` : ''}
                    </span>
                  )}
                </td>
                <td className={`px-3 py-2 text-right whitespace-nowrap font-mono ${item.excludedFromTotal ? 'line-through text-muted-foreground' : ''}`}>
                  {item.amount !== null ? formatCurrency(item.amount) : '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                  {item.receiptNumber ?? '—'}
                </td>
                <td className="px-3 py-2">
                  {item.drugType ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-muted">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs max-w-[200px]">
                  {item.linkedDiagnosis ?? '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs max-w-[150px]">
                  {item.notes ?? '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs max-w-[250px]">
                  {item.interpretation ?? '—'}
                </td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  Nessuna voce di spesa trovata.
                </td>
              </tr>
            )}
          </tbody>
          {hasAnyAmount && filteredItems.length > 0 && (
            <tfoot>
              <tr className="bg-muted/30 border-t-2 font-medium">
                <td colSpan={3} className="px-3 py-2 text-right">Totale{filter !== 'all' ? ` (${CATEGORY_LABELS[filter] ?? filter})` : ''}:</td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-mono">
                  {formatCurrency(filteredTotal)}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
        <p className="text-xs text-amber-800 dark:text-amber-200">
          <strong>Nota:</strong> La valutazione di congruità delle spese è riservata al medico legale.
          I dati estratti sono indicativi e vanno verificati con i documenti originali.
        </p>
      </div>
    </div>
  );
}
