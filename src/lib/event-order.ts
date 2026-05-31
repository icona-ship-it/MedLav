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
}

/** Normalized date key: '' for undated/sentinel, else the ISO string. */
function dateKey(e: OrderableEvent): string {
  const d = e.event_date;
  if (!d || d === SENTINEL_DATE) return '';
  return d;
}

export function compareEventsChrono(a: OrderableEvent, b: OrderableEvent): number {
  const ak = dateKey(a);
  const bk = dateKey(b);
  // Undated → bottom
  if (ak === '' && bk !== '') return 1;
  if (ak !== '' && bk === '') return -1;
  if (ak !== bk) return ak < bk ? -1 : 1; // ISO strings sort lexicographically = chronologically
  return (a.order_number ?? 0) - (b.order_number ?? 0);
}

/** Return a new array sorted chronologically (undated last). Pure (no mutation). */
export function sortEventsChrono<T extends OrderableEvent>(events: readonly T[]): T[] {
  return [...events].sort(compareEventsChrono);
}
