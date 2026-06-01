/**
 * Deterministic, pure renderers for the FACTUAL blocks of the report
 * (expense table, chronological index). The medico-legal principle: the perito
 * must never have to CORRECT a fact — facts are printed from the validated
 * data, never narrated by the LLM. These return Markdown pipe tables (rendered
 * natively by the HTML/DOCX export) and '' when there is nothing to show.
 *
 * Pure + client-safe: no I/O, no LLM. Reuses analyzeExpenses (amount/category
 * extraction) and sortEventsChrono (the single chronological comparator).
 */
import { formatDate } from '@/lib/format';
import { NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { sortEventsChrono } from '@/lib/event-order';
import { analyzeExpenses } from '@/services/expenses/expense-analyzer';

/** Minimal event shape needed to render the deterministic tables. Compatible
 * with the DB row (snake_case) and easily mapped from ConsolidatedEvent. */
export interface DeterministicTableEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
  facility?: string | null;
  doctor?: string | null;
  source_type?: string | null;
  order_number?: number | null;
}

const SENTINEL_DATE = '1900-01-01';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Display a date, or '—' for missing/sentinel/non-ISO (never leak 01/01/1900). */
function displayDate(d: string | null | undefined): string {
  if (!d || d === SENTINEL_DATE || !ISO_DATE_RE.test(d)) return '—';
  return formatDate(d);
}

/** Escape pipes so a cell can never break the Markdown table columns. */
function cell(value: string | null | undefined): string {
  const v = (value ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
  return v || '—';
}

/** Italian euro formatting, deterministic. */
function formatEuro(amount: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
}

/** 'spesa_medica' → 'Spesa medica' (light prettify for the type column). */
function prettifyType(eventType: string): string {
  const s = (eventType ?? '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

/**
 * Render the medical-expense table from the case events. Only `spesa_medica`
 * events are listed (the documented expenses); amounts are extracted by the
 * same logic as the expense-analysis module. Date '—' for undated/sentinel,
 * Importo '—' when no amount could be parsed (insert it at the source).
 * Returns '' when there are no expense events.
 */
export function formatExpenseTable(events: DeterministicTableEvent[]): string {
  const expenses = events.filter((e) => e.event_type === 'spesa_medica');
  if (expenses.length === 0) return '';

  const { items, totalAmount } = analyzeExpenses(
    expenses.map((e) => ({
      event_type: e.event_type,
      title: e.title ?? '',
      description: e.description ?? '',
      event_date: e.event_date ?? '',
      facility: e.facility ?? null,
      source_type: e.source_type ?? 'altro',
    })),
  );
  if (items.length === 0) return '';

  const rows = items.map((it) =>
    `| ${displayDate(it.date)} | ${cell(it.description)} | ${cell(it.facility)} | ${it.amount !== null ? formatEuro(it.amount) : '—'} |`,
  );
  const someMissing = items.some((it) => it.amount === null);
  const totalCell = totalAmount !== null ? `**${formatEuro(totalAmount)}**` : '—';
  const totalNote = someMissing ? ' *(alcuni importi non rilevati — inserirli alla fonte)*' : '';

  return [
    '| Data | Descrizione | Struttura | Importo |',
    '|---|---|---|---|',
    ...rows,
    `| **Totale** | | | ${totalCell}${totalNote} |`,
  ].join('\n');
}

/**
 * Render the chronological index of clinical events (date + type + author +
 * title) as a factual anchor. Non-clinical events (expenses, administrative
 * docs) are excluded; undated events sort to the bottom with '—'. Sorted by the
 * single shared comparator (sortEventsChrono). Returns '' when empty.
 */
export function formatChronologyIndex(events: DeterministicTableEvent[]): string {
  const clinical = events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type));
  if (clinical.length === 0) return '';

  const rows = sortEventsChrono(clinical).map((e) =>
    `| ${displayDate(e.event_date)} | ${prettifyType(e.event_type)} | ${cell(e.facility ?? e.doctor)} | ${cell(e.title)} |`,
  );

  return [
    '| Data | Tipo | Autore/Struttura | Titolo |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}
