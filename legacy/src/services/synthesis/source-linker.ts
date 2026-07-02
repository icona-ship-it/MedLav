/**
 * Source-linker: maps references in the report back to extracted events.
 * Supports three matching strategies:
 * 1. Explicit [Ev.N] references → direct match by orderNumber
 * 2. Date references (DD.MM.YYYY or DD/MM/YYYY) → match by eventDate
 * 3. Event title text → fuzzy substring match
 */

export interface EventRef {
  orderNumber: number;
  title: string;
  eventDate: string;
}

export interface SourceMatch {
  eventOrderNumber: number;
  matchType: 'explicit' | 'date' | 'title';
  matchConfidence: number;
}

export interface SourceLinkMap {
  /** Map from section id to matched events */
  sectionToEvents: Map<string, SourceMatch[]>;
  /** Reverse map from event orderNumber to section ids */
  eventToSections: Map<number, string[]>;
}

/**
 * Find all [Ev.N] references in text.
 */
function findExplicitReferences(text: string): number[] {
  const regex = /\[Ev\.(\d+)\]/g;
  const matches: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push(parseInt(match[1], 10));
  }
  return matches;
}

/**
 * Find date references in DD.MM.YYYY or DD/MM/YYYY format.
 */
function findDateReferences(text: string): string[] {
  const regex = /(\d{2})[./](\d{2})[./](\d{4})/g;
  const dates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    // Normalize to YYYY-MM-DD for comparison
    dates.push(`${match[3]}-${match[2]}-${match[1]}`);
  }
  return dates;
}

/**
 * Normalize a date string for comparison.
 * Handles YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY formats.
 */
function normalizeDate(dateStr: string): string {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  // DD.MM.YYYY or DD/MM/YYYY
  const match = dateStr.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return dateStr;
}

/**
 * Link report synthesis sections to events.
 */
export function linkReportToEvents(
  sections: Array<{ id: string; content: string }>,
  events: EventRef[],
): SourceLinkMap {
  const sectionToEvents = new Map<string, SourceMatch[]>();
  const eventToSections = new Map<number, string[]>();

  // Build lookup maps
  const eventByOrder = new Map<number, EventRef>();
  const eventsByDate = new Map<string, EventRef[]>();

  for (const event of events) {
    eventByOrder.set(event.orderNumber, event);
    const normalizedDate = normalizeDate(event.eventDate);
    if (!eventsByDate.has(normalizedDate)) {
      eventsByDate.set(normalizedDate, []);
    }
    eventsByDate.get(normalizedDate)!.push(event);
  }

  for (const section of sections) {
    const matches: SourceMatch[] = [];
    const seen = new Set<number>();

    // Strategy 1: Explicit [Ev.N] references
    const explicitRefs = findExplicitReferences(section.content);
    for (const orderNum of explicitRefs) {
      if (eventByOrder.has(orderNum) && !seen.has(orderNum)) {
        matches.push({ eventOrderNumber: orderNum, matchType: 'explicit', matchConfidence: 1.0 });
        seen.add(orderNum);
      }
    }

    // Strategy 2: Date references
    const dateRefs = findDateReferences(section.content);
    for (const dateStr of dateRefs) {
      const matchedEvents = eventsByDate.get(dateStr);
      if (matchedEvents) {
        for (const event of matchedEvents) {
          if (!seen.has(event.orderNumber)) {
            matches.push({ eventOrderNumber: event.orderNumber, matchType: 'date', matchConfidence: 0.8 });
            seen.add(event.orderNumber);
          }
        }
      }
    }

    // Strategy 3: Title substring match (only for longer titles)
    const contentLower = section.content.toLowerCase();
    for (const event of events) {
      if (seen.has(event.orderNumber)) continue;
      // Only match titles that are specific enough (5+ words)
      const titleWords = event.title.split(/\s+/);
      if (titleWords.length >= 4 && contentLower.includes(event.title.toLowerCase())) {
        matches.push({ eventOrderNumber: event.orderNumber, matchType: 'title', matchConfidence: 0.6 });
        seen.add(event.orderNumber);
      }
    }

    if (matches.length > 0) {
      sectionToEvents.set(section.id, matches);
    }

    // Build reverse map
    for (const match of matches) {
      if (!eventToSections.has(match.eventOrderNumber)) {
        eventToSections.set(match.eventOrderNumber, []);
      }
      const sections = eventToSections.get(match.eventOrderNumber)!;
      if (!sections.includes(section.id)) {
        sections.push(section.id);
      }
    }
  }

  return { sectionToEvents, eventToSections };
}
