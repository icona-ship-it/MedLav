import type { ExtractedEvent } from '../extraction/extraction-schemas';

export interface ConsolidatedEvent extends ExtractedEvent {
  orderNumber: number;
  documentId: string;
  discrepancyNote: string | null;
}

export interface DocumentEvents {
  documentId: string;
  events: ExtractedEvent[];
}

export interface ConsolidationResult {
  newEventsToInsert: ConsolidatedEvent[];
  allEvents: ConsolidatedEvent[];
}

/**
 * Consolidate events from multiple documents into a single chronological timeline.
 * - Orders events chronologically
 * - Detects and marks duplicate/overlapping events across documents
 * - Assigns sequential order numbers
 */
export function consolidateEvents(
  documentsEvents: DocumentEvents[],
): ConsolidatedEvent[] {
  // Flatten all events with their document ID
  const allEvents: Array<ExtractedEvent & { documentId: string }> = [];

  for (const doc of documentsEvents) {
    for (const event of doc.events) {
      allEvents.push({ ...event, documentId: doc.documentId });
    }
  }

  // Sort chronologically, then by event type, then by title for deterministic ordering
  allEvents.sort((a, b) => {
    const dateCompare = (a.eventDate ?? '').localeCompare(b.eventDate ?? '');
    if (dateCompare !== 0) return dateCompare;
    const typeCompare = (a.eventType ?? '').localeCompare(b.eventType ?? '');
    if (typeCompare !== 0) return typeCompare;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });

  // Detect duplicates/discrepancies across documents
  const consolidated = markDiscrepancies(allEvents);

  // Assign sequential order numbers
  return consolidated.map((event, index) => ({
    ...event,
    orderNumber: index + 1,
  }));
}

/**
 * Detect events that appear in multiple documents.
 * When the same event has discrepancies between sources, mark them.
 *
 * Uses O(n*k) grouping by date|eventType instead of O(n^2) pairwise comparison.
 * k = average group size (typically 2-5 events share the same date+type).
 */
function markDiscrepancies(
  events: Array<ExtractedEvent & { documentId: string }>,
): Array<ExtractedEvent & { documentId: string; discrepancyNote: string | null }> {
  // Index events by date|eventType for O(1) peer lookup.
  // Events with null/undefined date get unique keys to avoid false grouping.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < events.length; i++) {
    const key = events[i].eventDate
      ? `${events[i].eventDate}|${events[i].eventType}`
      : `__NO_DATE_${i}|${events[i].eventType}`;
    const group = groups.get(key);
    if (group) {
      group.push(i);
    } else {
      groups.set(key, [i]);
    }
  }

  return events.map((event, i) => {
    const key = event.eventDate
      ? `${event.eventDate}|${event.eventType}`
      : `__NO_DATE_${i}|${event.eventType}`;
    const peers = groups.get(key) ?? [];
    const { discrepancy, confidenceCap, requiresVerification } = findDiscrepancyInGroup(event, i, events, peers);
    return {
      ...event,
      discrepancyNote: discrepancy,
      ...(confidenceCap !== undefined ? { confidence: Math.min(event.confidence, confidenceCap) } : {}),
      ...(requiresVerification ? { requiresVerification: true } : {}),
    };
  });
}

/**
 * Check if an event has a potential duplicate within its date|type group
 * from a different document, with conflicting information.
 */
interface DiscrepancyResult {
  discrepancy: string | null;
  confidenceCap?: number;
  requiresVerification: boolean;
}

function findDiscrepancyInGroup(
  event: ExtractedEvent & { documentId: string },
  currentIndex: number,
  allEvents: Array<ExtractedEvent & { documentId: string }>,
  peerIndices: number[],
): DiscrepancyResult {
  const NONE: DiscrepancyResult = { discrepancy: null, requiresVerification: false };

  // Early exit: no peers or only self → no discrepancy possible
  if (peerIndices.length <= 1) return NONE;

  // Early exit: all peers from the same document → no cross-doc discrepancy
  const hasMultipleDocs = peerIndices.some(
    (j) => j !== currentIndex && allEvents[j].documentId !== event.documentId,
  );
  if (!hasMultipleDocs) return NONE;

  const discrepancies: string[] = [];
  let confidenceCap: number | undefined;
  let requiresVerification = false;

  for (const j of peerIndices) {
    if (j === currentIndex) continue;

    const other = allEvents[j];

    // Different document, same date+type (already guaranteed by grouping), similar content
    if (
      other.documentId !== event.documentId &&
      isSimilarEvent(event, other)
    ) {
      // Check for specific discrepancies — NEVER auto-resolve, always escalate
      if (event.diagnosis && other.diagnosis && event.diagnosis !== other.diagnosis) {
        discrepancies.push(
          `⚠ DIAGNOSI DISCORDANTE — richiede verifica del perito: Fonte 1 (${event.sourceType}): "${event.diagnosis}" vs Fonte 2 (${other.sourceType}): "${other.diagnosis}". Verificare sul documento originale quale diagnosi sia corretta.`,
        );
        confidenceCap = 30;
        requiresVerification = true;
      }

      if (event.doctor && other.doctor && event.doctor !== other.doctor) {
        discrepancies.push(
          `⚠ MEDICO DISCORDANTE — richiede verifica: "${event.doctor}" vs "${other.doctor}". Verificare sul documento originale.`,
        );
        requiresVerification = true;
      }

      // Mark as cross-referenced even without discrepancy
      if (discrepancies.length === 0) {
        discrepancies.push(
          `Evento presente in piu documenti (fonti concordi)`,
        );
      }
    }
  }

  return {
    discrepancy: discrepancies.length > 0 ? discrepancies.join('; ') : null,
    confidenceCap,
    requiresVerification,
  };
}

/**
 * Heuristic check if two events refer to the same clinical event.
 * Uses title similarity and description overlap.
 */
export function isSimilarEvent(a: ExtractedEvent, b: ExtractedEvent): boolean {
  // Same type and date is already checked by caller
  const titleSimilarity = calculateSimilarity(
    a.title.toLowerCase(),
    b.title.toLowerCase(),
  );

  // High title similarity: likely same event (used for discrepancy detection and dedup)
  if (titleSimilarity > 0.7) return true;

  // For moderate similarity (0.5-0.7), require description keyword overlap
  // to avoid merging genuinely different same-day events (two ECGs, two blood draws)
  if (titleSimilarity > 0.5) {
    const aKeywords = extractMedicalKeywords(a.description);
    const bKeywords = extractMedicalKeywords(b.description);
    const overlap = aKeywords.filter((k) => bKeywords.includes(k));
    const overlapRatio = Math.min(aKeywords.length, bKeywords.length) > 0
      ? overlap.length / Math.min(aKeywords.length, bKeywords.length)
      : 0;
    return overlapRatio > 0.4;
  }

  return false;
}

/**
 * Simple Jaccard similarity on word sets.
 */
// Medical abbreviations that must be kept in similarity calculation despite being ≤3 chars
const MEDICAL_ABBREVIATIONS = new Set([
  'ecg', 'tac', 'rmn', 'pcr', 'inr', 'ptt', 'tsh', 'ft3', 'ft4', 'pet', 'eeg', 'emg',
  'moc', 'hba', 'ves', 'hcv', 'hiv', 'hbv', 'ldl', 'hdl', 'bnp', 'cpk', 'got', 'gpt',
  'alt', 'ast', 'gfr', 'psa', 'cea', 'afp', 'ldh', 'crp', 'wbc', 'rbc', 'plt', 'hgb',
  'mcv', 'mch', 'rdw', 'mpv', 'fev', 'fvc', 'dlco', 'asa', 'bmi', 'nyha',
]);

function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3 || MEDICAL_ABBREVIATIONS.has(w)));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3 || MEDICAL_ABBREVIATIONS.has(w)));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Extract significant medical keywords from text.
 */
function extractMedicalKeywords(text: string): string[] {
  const stopWords = new Set([
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'di', 'a', 'da',
    'in', 'con', 'su', 'per', 'tra', 'fra', 'del', 'dello', 'della',
    'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
    'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle', 'nel', 'nello',
    'nella', 'nei', 'negli', 'nelle', 'sul', 'sullo', 'sulla', 'sui',
    'sugli', 'sulle', 'che', 'non', 'si', 'come', 'anche', 'sono',
    'stato', 'stata', 'essere', 'viene', 'viene', 'paziente',
  ]);

  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => (w.length > 3 || MEDICAL_ABBREVIATIONS.has(w)) && !stopWords.has(w))
    .slice(0, 50); // Cap at 50 keywords (increased to avoid losing tail of lab panels)
}

/**
 * Check if a new event is a duplicate of an existing event in the database.
 * Same date + same type + similar title/keywords = duplicate.
 */
export function isDuplicateOfExisting(
  newEvent: ExtractedEvent,
  existingEvents: ConsolidatedEvent[],
): boolean {
  return existingEvents.some((existing) =>
    existing.eventDate === newEvent.eventDate &&
    existing.eventType === newEvent.eventType &&
    isSimilarEvent(newEvent, existing),
  );
}

/**
 * Incremental consolidation: consolidate new document events among themselves,
 * then deduplicate against existing events from the database.
 *
 * - When existingEvents is empty, behaves identically to consolidateEvents()
 * - order_number for new events continues from max existing
 * - Returns both new events to insert and the full combined timeline
 */
export function consolidateNewWithExisting(
  newDocEvents: DocumentEvents[],
  existingEvents: ConsolidatedEvent[],
): ConsolidationResult {
  // Consolidate new events among themselves (same logic as consolidateEvents)
  const consolidatedNew = consolidateEvents(newDocEvents);

  // If no existing events, this is first-time processing
  if (existingEvents.length === 0) {
    return {
      newEventsToInsert: consolidatedNew,
      allEvents: consolidatedNew,
    };
  }

  // Filter out duplicates of existing events
  const deduped = consolidatedNew.filter(
    (newEvent) => !isDuplicateOfExisting(newEvent, existingEvents),
  );

  // Find max order_number from existing events
  const maxOrderNumber = Math.max(...existingEvents.map((e) => e.orderNumber));

  // Re-assign order_number starting from max + 1
  const newEventsToInsert = deduped.map((event, index) => ({
    ...event,
    orderNumber: maxOrderNumber + index + 1,
  }));

  // Combine all events and sort chronologically for full-case analysis
  const allEvents = [...existingEvents, ...newEventsToInsert].sort((a, b) => {
    const dateCompare = (a.eventDate ?? '').localeCompare(b.eventDate ?? '');
    if (dateCompare !== 0) return dateCompare;
    const typeCompare = (a.eventType ?? '').localeCompare(b.eventType ?? '');
    if (typeCompare !== 0) return typeCompare;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });

  return { newEventsToInsert, allEvents };
}
