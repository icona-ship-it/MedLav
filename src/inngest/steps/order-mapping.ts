/**
 * Map consolidated events back onto their DB rows by STABLE IDENTITY (not by
 * array index) to assign order_number.
 *
 * Why: consolidateEvents() deduplicates within a document and aggregates
 * identical same-day events, so its output can be SHORTER and reordered relative
 * to the raw DB rows. The old positional mapping (existingRaw[orderNumber-1])
 * then addressed the wrong row and mis-assigned order_number. Matching on
 * (document_id, event_date, event_type, title) is robust to drops/aggregation:
 * every raw row that collapsed into a consolidated event receives that event's
 * order_number (duplicates/same-day rows share one order — acceptable for
 * ordering), and a row with no match keeps its current order (no corruption).
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
  const orderByKey = new Map<string, number>();
  for (const e of allEvents) {
    // First write wins: if duplicates collapsed, the earliest order_number holds.
    const key = eventKey(e.documentId, e.eventDate, e.eventType, e.title);
    if (!orderByKey.has(key)) orderByKey.set(key, e.orderNumber);
  }

  const updates: OrderUpdate[] = [];
  for (const row of existingRaw) {
    const key = eventKey(row.document_id ?? '', row.event_date, row.event_type, row.title);
    const order = orderByKey.get(key);
    if (order != null) updates.push({ id: row.id, order_number: order });
  }
  return updates;
}
