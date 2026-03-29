import { createAdminClient } from '@/lib/supabase/admin';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { safeJsonParse } from '@/lib/format';
import type { ExtractionResult, ConsolidationStepResult } from './types';
import { logger } from '@/lib/logger';

/**
 * Step 4: Read all events from DB (already inserted by extraction steps),
 * renumber order, and prepare for analysis.
 */
export async function consolidateEventsStep(
  caseId: string,
  extractionResults: ExtractionResult[],
): Promise<ConsolidationStepResult> {
  const supabase = createAdminClient();

  // Events are already in DB — just fetch and organize
  const expectedEvents = extractionResults.length > 0;
  const { data: existingRaw } = await supabase
    .from('events')
    .select('*')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .order('event_date', { ascending: true })
    .order('event_type', { ascending: true })
    .order('created_at', { ascending: true });

  const allEvents: ConsolidatedEvent[] = (existingRaw ?? []).map((e, idx) => ({
    orderNumber: idx + 1,
    documentId: (e.document_id ?? '') as string,
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
    discrepancyNote: null,
    sourceText: (e.source_text ?? '') as string,
    sourcePages: e.source_pages ? safeJsonParse<number[]>(e.source_pages as string, []) : [],
  }));

  // Update order numbers in DB (batched for scalability)
  const BATCH_SIZE = 500;
  const orderUpdates = allEvents
    .map((event) => {
      const dbRow = (existingRaw ?? [])[event.orderNumber - 1];
      return dbRow ? { id: dbRow.id as string, order_number: event.orderNumber } : null;
    })
    .filter((u): u is { id: string; order_number: number } => u !== null);

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
  return { allEvents, newEventsCount: allEvents.length };
}
