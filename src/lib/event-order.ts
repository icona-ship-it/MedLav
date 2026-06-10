/**
 * Shared chronological ordering for clinical events shown in the cronistoria
 * (UI + exports). Single source of truth so every surface displays the timeline
 * in the same, correct order — independent of the persisted `order_number`,
 * which can be misaligned after dedup/aggregation or manual insertion.
 *
 * Rules (audit 2026-05-31, bug Lavini "ordine non cronologico"):
 *  - Undated events (sentinel '1900-01-01' or empty) sort to the BOTTOM. They
 *    have no chronological position; previously they floated to the TOP (sentinel
 *    date 1900 < any real date), corrupting the timeline.
 *  - Otherwise ascending by ISO date (event_date is stored YYYY-MM-DD).
 *  - Ties broken by order_number (stable, deterministic).
 */

const SENTINEL_DATE = '1900-01-01';

interface OrderableEvent {
  event_date?: string | null;
  order_number?: number | null;
  event_type?: string | null;
  title?: string | null;
}

/** Normalized date key: '' for undated/sentinel, else the ISO string. */
function dateKey(e: OrderableEvent): string {
  const d = e.event_date;
  if (!d || d === SENTINEL_DATE) return '';
  return d;
}

/**
 * Rank intra-giornata (benchmark gold passaniti 2026-06-10): l'evento di
 * ACCESSO/ammissione apre la giornata nella cronistoria — il perito sposta
 * sempre in testa l'accesso in PS rispetto agli esami della stessa data.
 * Rank 0 = ammissione, 1 = tutto il resto (l'ordine LegMed è già accettato).
 */
function intraDayRank(e: OrderableEvent): number {
  return e.event_type === 'ricovero' && /\b(accesso|giunge|accettazione)\b/i.test(e.title ?? '')
    ? 0
    : 1;
}

export function compareEventsChrono(a: OrderableEvent, b: OrderableEvent): number {
  const ak = dateKey(a);
  const bk = dateKey(b);
  // Undated → bottom
  if (ak === '' && bk !== '') return 1;
  if (ak !== '' && bk === '') return -1;
  if (ak !== bk) return ak < bk ? -1 : 1; // ISO strings sort lexicographically = chronologically
  const rankDiff = intraDayRank(a) - intraDayRank(b);
  if (rankDiff !== 0) return rankDiff;
  return (a.order_number ?? 0) - (b.order_number ?? 0);
}

/** Return a new array sorted chronologically (undated last). Pure (no mutation). */
export function sortEventsChrono<T extends OrderableEvent>(events: readonly T[]): T[] {
  return [...events].sort(compareEventsChrono);
}
