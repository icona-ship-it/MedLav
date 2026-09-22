/**
 * Pulizia dei dati di un caso prima di una RIELABORAZIONE («Riavvia l'analisi»).
 *
 * Fix 2026-09-22: la route cancellava `event_images` con `.eq('case_id', …)`, ma la
 * tabella non ha quella colonna (ha solo event_id): la delete falliva SEMPRE, dopo
 * che eventi, anomalie e report erano già stati cancellati in parallelo → il medico
 * riceveva «Errore durante la pulizia dei dati precedenti» con il caso svuotato e
 * bloccato in «elaborazione». Le immagini si cancellano per event_id (come fa la
 * retention), in ordine e con errori raccolti: chi chiama decide (rimborso + sblocco).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const BATCH = 500;
const CASE_TABLES = ['events', 'anomalies', 'missing_documents', 'reports'] as const;

export interface ReprocessCleanupResult {
  /** Descrizioni degli errori (tabella: messaggio); vuoto = tutto cancellato. */
  failures: string[];
  deletedImagesFor: number;
}

export async function cleanupCaseDataForReprocess(
  supabase: SupabaseClient,
  caseId: string,
): Promise<ReprocessCleanupResult> {
  const failures: string[] = [];
  const { data: eventRows, error: selectError } = await supabase.from('events').select('id').eq('case_id', caseId);
  if (selectError) failures.push(`events(select): ${selectError.message}`);
  const eventIds = (eventRows ?? []).map((r) => String((r as { id: unknown }).id));
  for (let i = 0; i < eventIds.length; i += BATCH) {
    const { error } = await supabase.from('event_images').delete().in('event_id', eventIds.slice(i, i + BATCH));
    if (error) failures.push(`event_images: ${error.message}`);
  }
  for (const table of CASE_TABLES) {
    const { error } = await supabase.from(table).delete().eq('case_id', caseId);
    if (error) failures.push(`${table}: ${error.message}`);
  }
  return { failures, deletedImagesFor: eventIds.length };
}
