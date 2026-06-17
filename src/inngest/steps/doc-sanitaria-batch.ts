import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { chunkArray } from '@/lib/array-utils';

/**
 * Documentazione sanitaria SELETTIVA su casi voluminosi: batching per FINESTRE
 * CRONOLOGICHE DI EVENTI (non per documenti).
 *
 * Causa storica (Lavini caso-2026-195, 47 doc / 1477 eventi): la doc-sanitaria
 * era batchata per documenti (4/batch) ma ogni batch riceveva TUTTI gli eventi →
 * col chunking selettivo (>80 eventi) ogni batch ri-chunkava l'intero set:
 * ~360 chiamate LLM, narrazioni duplicate e cronologia scombinata (i documenti
 * non sono ordinati per data). Batchando per eventi, ognuno viene narrato una
 * sola volta, in ordine cronologico, e ogni finestra resta sotto il tetto token.
 *
 * Modulo volutamente LEGGERO (solo array/date utils): è importato da
 * `section-partition` — non deve trascinare lo stack di sintesi.
 */
export const DOC_SANITARIA_EVENT_BATCH_SIZE = 50;

/** Una finestra cronologica di eventi + i documenti che essa referenzia. */
export interface DocSanitariaEventBatch {
  events: ConsolidatedEvent[];
  /** ID documenti (dedup, in ordine di prima comparsa) referenziati dagli eventi. */
  docIds: string[];
  /** Range cronologico leggibile (DD.MM.YYYY – DD.MM.YYYY) per log/marker. */
  dateRange: string;
}

/** ISO date → DD.MM.YYYY (senza dipendenze; fallback alla stringa originale). */
function isoToItDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || 's.d.');
}

/**
 * Pianifica le finestre cronologiche di eventi per la doc-sanitaria. Puro e
 * testabile. Gli eventi sono già in ordine cronologico (consolidamento), quindi
 * `chunkArray` preserva l'ordine sia tra che dentro le finestre. Per ogni
 * finestra calcola i docId referenziati (dedup) così lo step può caricare solo
 * l'OCR pertinente, più un range di date leggibile. `size <= 0` → una sola
 * finestra con tutti gli eventi (mai perde eventi).
 */
export function planDocSanitariaEventBatches(
  events: ConsolidatedEvent[],
  size: number = DOC_SANITARIA_EVENT_BATCH_SIZE,
): DocSanitariaEventBatch[] {
  const windows = size > 0
    ? chunkArray(events, size)
    : (events.length > 0 ? [events] : []);
  return windows.map((chunk) => ({
    events: chunk,
    docIds: [...new Set(chunk.map((e) => e.documentId))],
    dateRange: chunk.length > 0
      ? `${isoToItDate(chunk[0].eventDate)} – ${isoToItDate(chunk[chunk.length - 1].eventDate)}`
      : '',
  }));
}
