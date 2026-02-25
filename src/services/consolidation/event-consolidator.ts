import type { ExtractedEvent } from '../extraction/extraction-schemas';

export interface ConsolidatedEvent extends ExtractedEvent {
  orderNumber: number;
  documentId: string;
  discrepancyNote: string | null;
}

interface DocumentEvents {
  documentId: string;
  events: ExtractedEvent[];
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

  // Sort chronologically, then by event type for same-date events
  allEvents.sort((a, b) => {
    const dateCompare = a.eventDate.localeCompare(b.eventDate);
    if (dateCompare !== 0) return dateCompare;
    return a.eventType.localeCompare(b.eventType);
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
 */
function markDiscrepancies(
  events: Array<ExtractedEvent & { documentId: string }>,
): Array<ExtractedEvent & { documentId: string; discrepancyNote: string | null }> {
  const result: Array<ExtractedEvent & { documentId: string; discrepancyNote: string | null }> = [];

  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const discrepancy = findDiscrepancy(current, events, i);

    result.push({
      ...current,
      discrepancyNote: discrepancy,
    });
  }

  return result;
}

/**
 * Check if an event has a potential duplicate in another document
 * with conflicting information.
 */
function findDiscrepancy(
  event: ExtractedEvent & { documentId: string },
  allEvents: Array<ExtractedEvent & { documentId: string }>,
  currentIndex: number,
): string | null {
  const discrepancies: string[] = [];

  for (let j = 0; j < allEvents.length; j++) {
    if (j === currentIndex) continue;

    const other = allEvents[j];

    // Different document, same date, similar event type
    if (
      other.documentId !== event.documentId &&
      other.eventDate === event.eventDate &&
      other.eventType === event.eventType &&
      isSimilarEvent(event, other)
    ) {
      // Check for specific discrepancies
      if (event.diagnosis && other.diagnosis && event.diagnosis !== other.diagnosis) {
        discrepancies.push(
          `Diagnosi discordante tra fonti: "${event.diagnosis}" vs "${other.diagnosis}"`,
        );
      }

      if (event.doctor && other.doctor && event.doctor !== other.doctor) {
        discrepancies.push(
          `Medico diverso tra fonti: "${event.doctor}" vs "${other.doctor}"`,
        );
      }

      // Mark as cross-referenced even without discrepancy
      if (discrepancies.length === 0) {
        discrepancies.push(
          `Evento presente in piu documenti (fonti concordi)`,
        );
      }
    }
  }

  return discrepancies.length > 0 ? discrepancies.join('; ') : null;
}

/**
 * Heuristic check if two events refer to the same clinical event.
 * Uses title similarity and description overlap.
 */
function isSimilarEvent(a: ExtractedEvent, b: ExtractedEvent): boolean {
  // Same type and date is already checked by caller
  const titleSimilarity = calculateSimilarity(
    a.title.toLowerCase(),
    b.title.toLowerCase(),
  );

  if (titleSimilarity > 0.6) return true;

  // Check if descriptions share significant keywords
  const aKeywords = extractMedicalKeywords(a.description);
  const bKeywords = extractMedicalKeywords(b.description);
  const overlap = aKeywords.filter((k) => bKeywords.includes(k));

  return overlap.length >= 3;
}

/**
 * Simple Jaccard similarity on word sets.
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));

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
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 30); // Cap at 30 keywords
}
