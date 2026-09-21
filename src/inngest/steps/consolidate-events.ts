import { createAdminClient } from '@/lib/supabase/admin';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { consolidateEvents, type DocumentEvents } from '@/services/consolidation/event-consolidator';
import { safeJsonParse } from '@/lib/format';
import type { ExtractionResult, ConsolidationStepResult } from './types';
import { buildOrderUpdates } from './order-mapping';
import { applyPlanToRows, planConsolidationPersistence, type ConsolidationPersistencePlan, type RawEventRowForPersistence } from './consolidation-persistence';
import { logger } from '@/lib/logger';
import { normalizeTemporalScope } from '@/lib/temporal-scope';
import { documentTypeLabels } from '@/lib/constants';
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
): Promise<Array<{ id: string; reliability_notes: string }>> {
  const updates: Array<{ id: string; reliability_notes: string }> = [];
  for (const e of rows) {
    const res = checkEventSourceConsistency({
      title: (e.title ?? null) as string | null,
      description: (e.description ?? null) as string | null,
      source_text: (e.source_text ?? null) as string | null,
      event_date: (e.event_date ?? null) as string | null,
      event_type: (e.event_type ?? null) as string | null,
    });
    if (!res.flagged || !res.reason) continue;
    const prev = (e.reliability_notes ?? null) as string | null;
    if (prev && prev.includes(res.reason)) continue; // idempotenza
    updates.push({ id: e.id as string, reliability_notes: prev ? `${prev} | ${res.reason}` : res.reason });
  }
  if (updates.length === 0) return updates;
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
  return updates;
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
  const docLabels = await fetchDocumentLabels(supabase, caseId);
  const docEventsMap = new Map<string, DocumentEvents>();
  for (const e of rows) {
    const docId = (e.document_id ?? '') as string;
    if (!docEventsMap.has(docId)) {
      docEventsMap.set(docId, { documentId: docId, events: [], documentLabel: docLabels.get(docId) });
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
      temporalScope: normalizeTemporalScope(e.temporal_scope),
      rowId: e.id as string,
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
  // Le note scritte vengono riportate anche sulle righe in memoria: la persistenza
  // del consolidamento confronta e riscrive a partire da QUESTE, mai da una copia
  // vecchia (altrimenti una fusione sovrascriverebbe la nota della Rete A).
  const reteAUpdates = await flagInconsistentEvents(supabase, existingRaw ?? []);
  const reteAById = new Map(reteAUpdates.map((u) => [u.id, u.reliability_notes]));
  for (const e of existingRaw ?? []) {
    const note = reteAById.get(e.id as string);
    if (note !== undefined) { e.reliability_notes = note; e.requires_verification = true; }
  }

  // Group events by document for cross-document deduplication
  const docLabels = await fetchDocumentLabels(supabase, caseId);
  const docEventsMap = new Map<string, DocumentEvents>();
  for (const e of existingRaw ?? []) {
    const docId = (e.document_id ?? '') as string;
    if (!docEventsMap.has(docId)) {
      docEventsMap.set(docId, { documentId: docId, events: [], documentLabel: docLabels.get(docId) });
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
      temporalScope: normalizeTemporalScope(e.temporal_scope),
      rowId: e.id as string,
    });
  }

  // Run cross-document consolidation (marks discrepancies, detects duplicates)
  const allEvents: ConsolidatedEvent[] = docEventsMap.size > 0
    ? consolidateEvents([...docEventsMap.values()])
    : [];

  // Persistenza delle decisioni del consolidatore (collaudo 2026-09-18): le righe
  // assorbite (doppioni, aggregati, fusioni) spariscono dal DB e i sopravvissuti
  // riscritti, così la cronistoria che il medico vede è la stessa della perizia.
  const BATCH_SIZE = 500;
  const plan = planConsolidationPersistence(allEvents, (existingRaw ?? []).map(rowForPersistence));
  await applyConsolidationPersistence(supabase, plan, BATCH_SIZE);
  // Le righe come saranno DOPO il piano (tipo/titolo riscritti): la chiave di
  // assegnazione dell'ordine deve combaciare con gli eventi consolidati.
  const survivingRaw = applyPlanToRows(
    (existingRaw ?? []).map((e) => ({ ...e, id: e.id as string, event_type: e.event_type as string, title: e.title as string })),
    plan,
  );

  // Update order numbers in DB (batched for scalability). Map consolidated
  // events back to raw rows by STABLE IDENTITY — consolidateEvents() dedups and
  // aggregates, so a positional (index) mapping would mis-assign order_number.
  const orderUpdates = buildOrderUpdates(
    allEvents.map((event) => ({
      documentId: event.documentId,
      eventDate: event.eventDate,
      eventType: event.eventType,
      title: event.title,
      orderNumber: event.orderNumber,
    })),
    survivingRaw.map((e) => ({
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

function rowForPersistence(e: Record<string, unknown>): RawEventRowForPersistence {
  return {
    id: e.id as string,
    title: e.title as string,
    description: e.description as string,
    event_type: e.event_type as string,
    diagnosis: (e.diagnosis ?? null) as string | null,
    doctor: (e.doctor ?? null) as string | null,
    facility: (e.facility ?? null) as string | null,
    confidence: e.confidence as number,
    requires_verification: e.requires_verification as boolean,
    reliability_notes: (e.reliability_notes ?? null) as string | null,
    source_pages: (e.source_pages ?? null) as string | null,
    temporal_scope: (e.temporal_scope ?? null) as string | null,
  };
}

/** Applica il piano: delete a lotti delle righe assorbite, update dei sopravvissuti.
 * Un fallimento qui non blocca il caso (torna il comportamento vecchio: doppioni
 * visibili), ma viene registrato. */
async function applyConsolidationPersistence(
  supabase: ReturnType<typeof createAdminClient>,
  plan: ConsolidationPersistencePlan,
  batchSize: number,
): Promise<void> {
  // PRIMA i sopravvissuti (che ora contengono ciò che era nelle righe assorbite),
  // POI le cancellazioni: se un update fallisce si lancia e Inngest ritenta il
  // passo con le righe ancora intere (il piano si ricalcola, idempotente). Mai
  // cancellare prima di aver scritto (giro avversariale 2026-09-21).
  for (let i = 0; i < plan.updates.length; i += batchSize) {
    const batch = plan.updates.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((u) => supabase.from('events').update({ ...u.fields, updated_at: new Date().toISOString() }).eq('id', u.id)),
    );
    const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)).length;
    if (failures > 0) {
      throw new Error(`consolidation: ${failures}/${batch.length} survivor updates failed — absorbed rows NOT deleted, step will retry`);
    }
  }
  for (let i = 0; i < plan.deleteIds.length; i += batchSize) {
    const batch = plan.deleteIds.slice(i, i + batchSize);
    const { error } = await supabase.from('events').delete().in('id', batch);
    if (error) throw new Error(`consolidation: delete of ${batch.length} absorbed rows failed: ${error.message}`);
  }
  if (plan.deleteIds.length > 0 || plan.updates.length > 0) {
    logger.info('pipeline', ` Step 4: consolidation persisted — ${plan.deleteIds.length} absorbed rows deleted, ${plan.updates.length} survivors updated`);
  }
}

/** Etichetta per documento (tipo leggibile): per le note «Citato anche in: Certificato». */
async function fetchDocumentLabels(
  supabase: ReturnType<typeof createAdminClient>,
  caseId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase.from('documents').select('id, document_type').eq('case_id', caseId);
  const out = new Map<string, string>();
  for (const d of data ?? []) {
    const type = (d.document_type ?? 'altro') as string;
    out.set(d.id as string, type !== 'altro' ? (documentTypeLabels[type] ?? type) : 'altro documento');
  }
  return out;
}
