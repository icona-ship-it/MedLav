/**
 * Map consolidated events back onto their DB rows by STABLE IDENTITY (not by
 * array index) to assign order_number.
 *
 * Why: consolidateEvents() deduplicates within a document and aggregates
 * identical same-day events, so its output can be SHORTER and reordered relative
 * to the raw DB rows. The old positional mapping (existingRaw[orderNumber-1])
 * then addressed the wrong row and mis-assigned order_number.
 *
 * We match on the identity key (document_id, event_date, event_type, title) but
 * a key is NOT always unique: the consolidator deliberately keeps DISTINCT
 * same-day, same-type, same-title acts separate (A5/A6 hardening — conflicting
 * time-of-day). So per key we keep the ORDERED list of consolidated order
 * numbers and assign them POSITIONALLY to the raw rows of that key:
 * - true duplicates (1 consolidated event, N raw rows) → all rows share its one
 *   order_number (acceptable for ordering);
 * - genuinely-distinct same-key events (M consolidated, M raw rows) → each raw
 *   row gets its own order_number (no duplicate, no gap);
 * - a raw row with no matching key keeps its current order (no corruption).
 *
 * Pure function — no DB access.
 */

interface ConsolidatedEventIdentity {
  documentId: string;
  eventDate: string;
  eventType: string;
  title: string;
  orderNumber: number;
}

interface RawEventRow {
  id: string;
  document_id: string | null;
  event_date: string;
  event_type: string;
  title: string;
}

export interface OrderUpdate {
  id: string;
  order_number: number;
}

function eventKey(
  documentId: string,
  eventDate: string,
  eventType: string,
  title: string,
): string {
  return `${documentId}||${eventDate}||${eventType}||${(title ?? '').trim()}`;
}

export function buildOrderUpdates(
  allEvents: ConsolidatedEventIdentity[],
  existingRaw: RawEventRow[],
): OrderUpdate[] {
  // Per key, the ORDERED list of consolidated order numbers.
  const ordersByKey = new Map<string, number[]>();
  for (const e of allEvents) {
    const key = eventKey(e.documentId, e.eventDate, e.eventType, e.title);
    const list = ordersByKey.get(key);
    if (list) list.push(e.orderNumber);
    else ordersByKey.set(key, [e.orderNumber]);
  }

  // Consume orders positionally as raw rows of the same key are encountered;
  // once a key's distinct orders are exhausted, extra duplicate rows reuse the
  // last one.
  const cursorByKey = new Map<string, number>();
  const updates: OrderUpdate[] = [];
  for (const row of existingRaw) {
    const key = eventKey(row.document_id ?? '', row.event_date, row.event_type, row.title);
    const orders = ordersByKey.get(key);
    if (!orders || orders.length === 0) continue;
    const cursor = cursorByKey.get(key) ?? 0;
    const order = orders[Math.min(cursor, orders.length - 1)];
    cursorByKey.set(key, cursor + 1);
    updates.push({ id: row.id, order_number: order });
  }
  return updates;
}
