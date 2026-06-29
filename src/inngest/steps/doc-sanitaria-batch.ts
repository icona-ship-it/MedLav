import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';
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

/** ISO date → DD.MM.YYYY (senza dipendenze; fallback alla stringa originale).
 * La sentinella 1900-01-01 (evento senza data) → "s.d.", mai "01.01.1900"
 * (leak bloccato dal validator sentinel_date_leak). */
function isoToItDate(iso: string): string {
  if (!iso || iso.startsWith('1900-01-01')) return 's.d.';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
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

/** Firma di contenuto di un evento per la dedup: testo riprodotto, normalizzato. */
function eventContentText(e: ConsolidatedEvent): string {
  return (e.sourceText?.trim() || e.description?.trim() || e.title || '').trim();
}

/**
 * Anti-DUPLICAZIONE (perizia RC): lo stesso referto presente in PIÙ PDF sorgente ha più
 * `documentId` e verrebbe reso più volte nella "Documentazione Medica Prodotta". Qui si
 * scartano i documenti il cui contenuto è IDENTICO (dopo normalizzazione spazi/maiuscole)
 * a un documento già tenuto — tenendo il PRIMO. Solo contenuto identico ⇒ un duplicato
 * esatto non porta alcun fatto nuovo ⇒ "mai perdere un fatto" rispettato. Pura e testabile.
 */
export function dedupeDocumentsByContent(events: ConsolidatedEvent[]): ConsolidatedEvent[] {
  const contentByDoc = new Map<string, string[]>();
  const order: string[] = [];
  for (const e of events) {
    if (!contentByDoc.has(e.documentId)) { contentByDoc.set(e.documentId, []); order.push(e.documentId); }
    contentByDoc.get(e.documentId)!.push(eventContentText(e));
  }
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  const dropped = new Set<string>();
  for (const id of order) {
    const sig = norm((contentByDoc.get(id) ?? []).join('\n'));
    if (sig.length === 0) continue; // contenuto vuoto → non deduplicare (conservativo)
    if (seen.has(sig)) dropped.add(id);
    else seen.add(sig);
  }
  return dropped.size === 0 ? events : events.filter((e) => !dropped.has(e.documentId));
}

/**
 * Variante PER-DOCUMENTO del batch-planner per la perizia RC: prima deduplica i documenti
 * a contenuto identico, poi impacchetta interi documenti senza spezzarli tra due batch
 * (un documento i cui eventi scavalcavano una finestra di 50 veniva ri-narrato → era la
 * causa principale della verbosità ~3× su Bigon). Stesso shape di planDocSanitariaEventBatches.
 */
export function planDocSanitariaEventBatchesByDocument(
  events: ConsolidatedEvent[],
  size: number = DOC_SANITARIA_EVENT_BATCH_SIZE,
): DocSanitariaEventBatch[] {
  const deduped = dedupeDocumentsByContent(events);
  const byDoc = new Map<string, ConsolidatedEvent[]>();
  const order: string[] = [];
  for (const e of deduped) {
    if (!byDoc.has(e.documentId)) { byDoc.set(e.documentId, []); order.push(e.documentId); }
    byDoc.get(e.documentId)!.push(e);
  }
  const windows: ConsolidatedEvent[][] = [];
  let cur: ConsolidatedEvent[] = [];
  for (const id of order) {
    const group = byDoc.get(id) ?? [];
    if (size > 0 && cur.length > 0 && cur.length + group.length > size) { windows.push(cur); cur = []; }
    cur.push(...group);
  }
  if (cur.length > 0) windows.push(cur);
  return windows.map((chunk) => ({
    events: chunk,
    docIds: [...new Set(chunk.map((e) => e.documentId))],
    dateRange: chunk.length > 0
      ? `${isoToItDate(chunk[0].eventDate)} – ${isoToItDate(chunk[chunk.length - 1].eventDate)}`
      : '',
  }));
}

/**
 * Toglie da un blocco-batch le ripetizioni dell'INTESTAZIONE di sezione che l'LLM
 * a volte emette su riga propria — come heading `## Titolo` OPPURE in grassetto
 * `**Titolo**` (il vero caso Bigon: il grassetto compariva 9× perché lo strip
 * precedente prendeva solo gli `##`) — nonostante la direttiva. L'intestazione
 * canonica viene aggiunta una sola volta a valle (assembleSectionBlock). Tocca SOLO
 * righe che sono ESATTAMENTE il titolo (eventuale heading/grassetto), mai le
 * menzioni del titolo dentro la prosa. Puro e testabile.
 */
export function stripRepeatedSectionHeading(part: string, title: string): string {
  const t = title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
  const titleLine = new RegExp(
    `^[ \\t]*(?:#{1,6}[ \\t]+|\\*\\*[ \\t]*)?${t}(?:[ \\t]*\\*\\*)?[ \\t]*$\\n?`,
    'gm',
  );
  return part.replace(titleLine, '');
}

/**
 * Restringe l'imageAnalysis ai soli documenti referenziati dalla finestra
 * cronologica: ogni finestra offre all'LLM SOLO le immagini dei propri documenti,
 * evitando che la stessa immagine venga proposta (ed eventualmente incorporata) in
 * più finestre → niente duplicati/misplacement. Richiede `documentId` sul result
 * (propagato end-to-end dal fix collisione cross-doc): immagini senza documentId
 * sono escluse (non attribuibili a una finestra). `undefined` resta `undefined`.
 */
export function filterImagesForBatch(
  imageAnalysis: ImageAnalysisResult[] | undefined,
  docIds: string[],
): ImageAnalysisResult[] | undefined {
  if (!imageAnalysis) return undefined;
  return imageAnalysis.filter((img) => img.documentId !== undefined && docIds.includes(img.documentId));
}
