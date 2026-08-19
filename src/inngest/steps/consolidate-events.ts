import { createAdminClient } from '@/lib/supabase/admin';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { consolidateEvents, type DocumentEvents } from '@/services/consolidation/event-consolidator';
import { safeJsonParse } from '@/lib/format';
import type { ExtractionResult, ConsolidationStepResult } from './types';
import { buildOrderUpdates } from './order-mapping';
import { logger } from '@/lib/logger';
import { checkEventSourceConsistency } from '@/services/validation/event-source-consistency';

/**
 * RETE A — coerenza estratto ↔ fonte. Marca "da verificare" gli eventi il cui testo
 * strutturato contraddice il proprio `source_text` su un token che pesa (lateralità
 * invertita, opposto clinico). Deterministica e ad ALTA precisione (0 falsi positivi
 * misurati su 45 eventi reali). Non declassa mai: alza solo il flag + aggiunge una
 * nota leggibile → arriva nel pannello "Da controllare" col meccanismo esistente.
 * Idempotente: non riappende la stessa nota su reprocess/regen.
 */
async function flagInconsistentEvents(
  supabase: ReturnType<typeof createAdminClient>,
  rows: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
  const updates: Array<{ id: string; reliability_notes: string }> = [];
  for (const e of rows) {
    const res = checkEventSourceConsistency({
      title: (e.title ?? null) as string | null,
      description: (e.description ?? null) as string | null,
      source_text: (e.source_text ?? null) as string | null,
    });
    if (!res.flagged || !res.reason) continue;
    const prev = (e.reliability_notes ?? null) as string | null;
    if (prev && prev.includes(res.reason)) continue; // idempotenza
    updates.push({ id: e.id as string, reliability_notes: prev ? `${prev} | ${res.reason}` : res.reason });
  }
  if (updates.length === 0) return;
  const BATCH = 500;
  for (let i = 0; i < updates.length; i += BATCH) {
    await Promise.allSettled(
      updates.slice(i, i + BATCH).map((u) =>
        supabase.from('events')
          .update({ requires_verification: true, reliability_notes: u.reliability_notes })
          .eq('id', u.id),
      ),
    );
  }
  logger.info('pipeline', ` Rete A (coerenza estratto↔fonte): ${updates.length} eventi marcati da verificare`);
}

/**
 * Re-read all events from DB and re-apply consolidation logic (discrepancy detection,
 * confidence capping, chronological ordering) for downstream pipeline steps.
 *
 * Why re-consolidate? discrepancyNote and confidence caps are computed in-memory by
 * consolidateEvents() but NOT persisted to DB. Re-running is cheap (pure CPU, no LLM).
 */
export async function fetchAllEventsForCase(caseId: string): Promise<ConsolidatedEvent[]> {
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from('events')
    .select('*')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .order('event_date', { ascending: true })
    .order('event_type', { ascending: true })
    .order('created_at', { ascending: true })
    // Tiebreak DETERMINISTICO (review affidabilità 2026-07-04): gli insert bulk
    // condividono lo stesso created_at → senza id l'ordine dei pari può cambiare
    // tra due fetch e far slittare le finestre doc-sanitaria tra invocazioni.
    .order('id', { ascending: true });

  if (error) throw new Error(`Failed to fetch events for case ${caseId}: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  // Group by document and re-run consolidation to compute discrepancyNote + confidence caps
  const docEventsMap = new Map<string, DocumentEvents>();
  for (const e of rows) {
    const docId = (e.document_id ?? '') as string;
    if (!docEventsMap.has(docId)) {
      docEventsMap.set(docId, { documentId: docId, events: [] });
    }
    docEventsMap.get(docId)!.events.push({
      eventDate: e.event_date as string,
      datePrecision: e.date_precision as ConsolidatedEvent['datePrecision'],
      eventType: e.event_type as ConsolidatedEvent['eventType'],
      title: e.title as string,
      description: e.description as string,
      sourceType: e.source_type as ConsolidatedEvent['sourceType'],
      diagnosis: (e.diagnosis ?? null) as string | null,
      doctor: (e.doctor ?? null) as string | null,
      facility: (e.facility ?? null) as string | null,
      confidence: e.confidence as number,
      requiresVerification: e.requires_verification as boolean,
      reliabilityNotes: (e.reliability_notes ?? null) as string | null,
      sourceText: (e.source_text ?? '') as string,
      sourcePages: e.source_pages ? safeJsonParse<number[]>(e.source_pages as string, []) : [],
    });
  }

  return consolidateEvents([...docEventsMap.values()]);
}

/**
 * Step 4: Read all events from DB (already inserted by extraction steps),
 * renumber order, and prepare for analysis.
 */
export async function consolidateEventsStep(
  caseId: string,
  extractionResults: ExtractionResult[],
): Promise<ConsolidationStepResult> {
  const supabase = createAdminClient();

  // Events are already in DB — fetch, run cross-document dedup, and organize
  const expectedEvents = extractionResults.length > 0;
  const { data: existingRaw } = await supabase
    .from('events')
    .select('*')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .order('event_date', { ascending: true })
    .order('event_type', { ascending: true })
    .order('created_at', { ascending: true })
    // Tiebreak DETERMINISTICO (review affidabilità 2026-07-04): gli insert bulk
    // condividono lo stesso created_at → senza id l'ordine dei pari può cambiare
    // tra due fetch e far slittare le finestre doc-sanitaria tra invocazioni.
    .order('id', { ascending: true });

  // RETE A: marca "da verificare" gli eventi che contraddicono la propria fonte.
  await flagInconsistentEvents(supabase, existingRaw ?? []);

  // Group events by document for cross-document deduplication
  const docEventsMap = new Map<string, DocumentEvents>();
  for (const e of existingRaw ?? []) {
    const docId = (e.document_id ?? '') as string;
    if (!docEventsMap.has(docId)) {
      docEventsMap.set(docId, { documentId: docId, events: [] });
    }
    docEventsMap.get(docId)!.events.push({
      eventDate: e.event_date as string,
      datePrecision: e.date_precision as ConsolidatedEvent['datePrecision'],
      eventType: e.event_type as ConsolidatedEvent['eventType'],
      title: e.title as string,
      description: e.description as string,
      sourceType: e.source_type as ConsolidatedEvent['sourceType'],
      diagnosis: (e.diagnosis ?? null) as string | null,
      doctor: (e.doctor ?? null) as string | null,
      facility: (e.facility ?? null) as string | null,
      confidence: e.confidence as number,
      requiresVerification: e.requires_verification as boolean,
      reliabilityNotes: (e.reliability_notes ?? null) as string | null,
      sourceText: (e.source_text ?? '') as string,
      sourcePages: e.source_pages ? safeJsonParse<number[]>(e.source_pages as string, []) : [],
    });
  }

  // Run cross-document consolidation (marks discrepancies, detects duplicates)
  const allEvents: ConsolidatedEvent[] = docEventsMap.size > 0
    ? consolidateEvents([...docEventsMap.values()])
    : [];

  // Update order numbers in DB (batched for scalability). Map consolidated
  // events back to raw rows by STABLE IDENTITY — consolidateEvents() dedups and
  // aggregates, so a positional (index) mapping would mis-assign order_number.
  const BATCH_SIZE = 500;
  const orderUpdates = buildOrderUpdates(
    allEvents.map((event) => ({
      documentId: event.documentId,
      eventDate: event.eventDate,
      eventType: event.eventType,
      title: event.title,
      orderNumber: event.orderNumber,
    })),
    (existingRaw ?? []).map((e) => ({
      id: e.id as string,
      document_id: (e.document_id ?? null) as string | null,
      event_date: e.event_date as string,
      event_type: e.event_type as string,
      title: e.title as string,
    })),
  );

  for (let i = 0; i < orderUpdates.length; i += BATCH_SIZE) {
    const batch = orderUpdates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((u) =>
        supabase.from('events').update({ order_number: u.order_number }).eq('id', u.id),
      ),
    );
    const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
    if (failures.length > batch.length * 0.1) {
      throw new Error(`Too many order_number update failures: ${failures.length}/${batch.length}`);
    }
    if (failures.length > 0) {
      logger.warn('pipeline', `${failures.length} order_number updates failed in batch (non-critical)`);
    }
  }

  // Update document statuses (batched with .in())
  const docIds = extractionResults.map((r) => r.documentId);
  for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
    const { error: docUpdateError } = await supabase
      .from('documents')
      .update({ processing_status: 'validazione_in_corso', updated_at: new Date().toISOString() })
      .in('id', docIds.slice(i, i + BATCH_SIZE));
    if (docUpdateError) {
      throw new Error(`Failed to update document statuses: ${docUpdateError.message}`);
    }
  }

  if (expectedEvents && allEvents.length === 0) {
    throw new Error('CRITICAL: extraction reported events but DB has 0. Insert likely failed silently.');
  }
  logger.info('pipeline', ` Step 4: ${allEvents.length} total events in DB`);
  // Return only counts — NOT the full allEvents array.
  // allEvents can be 25MB+ for large cases, exceeding Inngest's 4MB step output limit.
  // Downstream steps re-read events from DB via fetchAllEventsForCase().
  return { newEventsCount: allEvents.length, totalEventsCount: allEvents.length };
}
