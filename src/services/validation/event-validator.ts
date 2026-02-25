import type { ExtractedEvent } from '../extraction/extraction-schemas';

type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  eventIndex: number;
  field: string;
  severity: IssueSeverity;
  message: string;
  autoFixed: boolean;
}

export interface ValidationResult {
  events: ExtractedEvent[];
  issues: ValidationIssue[];
}

/**
 * Run deterministic validation checks on extracted events.
 * Auto-fixes what can be fixed, flags the rest.
 */
export function validateExtractedEvents(
  events: ExtractedEvent[],
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const validatedEvents: ExtractedEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    const { event: validated, issues: eventIssues } = validateSingleEvent(events[i], i);
    validatedEvents.push(validated);
    issues.push(...eventIssues);
  }

  // Cross-event checks
  const crossIssues = validateCrossEvent(validatedEvents);
  issues.push(...crossIssues);

  return { events: validatedEvents, issues };
}

/**
 * Validate a single event and auto-fix where possible.
 */
function validateSingleEvent(
  event: ExtractedEvent,
  index: number,
): { event: ExtractedEvent; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  let fixed = { ...event };

  // Check: future date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(event.eventDate);
  if (!isNaN(eventDate.getTime()) && eventDate > today) {
    issues.push({
      eventIndex: index,
      field: 'eventDate',
      severity: 'error',
      message: `Data futura rilevata: ${event.eventDate}`,
      autoFixed: false,
    });
    fixed = { ...fixed, requiresVerification: true };
  }

  // Check: invalid date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.eventDate) || isNaN(eventDate.getTime())) {
    issues.push({
      eventIndex: index,
      field: 'eventDate',
      severity: 'error',
      message: `Data invalida: ${event.eventDate}`,
      autoFixed: false,
    });
    fixed = { ...fixed, requiresVerification: true };
  }

  // Check: description too short (likely hallucinated or truncated)
  if (event.description.length < 20) {
    issues.push({
      eventIndex: index,
      field: 'description',
      severity: 'warning',
      message: `Descrizione molto corta (${event.description.length} caratteri)`,
      autoFixed: false,
    });
  }

  // Check: title too long (likely contains description text)
  if (event.title.length > 150) {
    issues.push({
      eventIndex: index,
      field: 'title',
      severity: 'warning',
      message: `Titolo troppo lungo (${event.title.length} caratteri), potrebbe contenere testo della descrizione`,
      autoFixed: false,
    });
  }

  // Check: confidence out of range — auto-fix by clamping
  if (event.confidence < 0 || event.confidence > 100) {
    const clamped = Math.max(0, Math.min(100, event.confidence));
    issues.push({
      eventIndex: index,
      field: 'confidence',
      severity: 'warning',
      message: `Confidence fuori range (${event.confidence}), corretta a ${clamped}`,
      autoFixed: true,
    });
    fixed = { ...fixed, confidence: clamped };
  }

  return { event: fixed, issues };
}

/**
 * Cross-event validation: detect duplicates and impossible sequences.
 */
function validateCrossEvent(events: ExtractedEvent[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < events.length; i++) {
    // Check exact duplicates (same date, same title, same description)
    for (let j = i + 1; j < events.length; j++) {
      if (
        events[i].eventDate === events[j].eventDate &&
        events[i].title === events[j].title &&
        events[i].description === events[j].description
      ) {
        issues.push({
          eventIndex: j,
          field: 'duplicate',
          severity: 'warning',
          message: `Duplicato esatto dell'evento #${i + 1} (stessa data, titolo, descrizione)`,
          autoFixed: false,
        });
      }
    }

    // Check impossible sequences: follow-up before related intervention
    if (events[i].eventType === 'follow-up') {
      const followUpDate = new Date(events[i].eventDate);
      for (let j = 0; j < events.length; j++) {
        if (j === i) continue;
        if (events[j].eventType === 'intervento') {
          const interventionDate = new Date(events[j].eventDate);
          if (
            !isNaN(followUpDate.getTime()) &&
            !isNaN(interventionDate.getTime()) &&
            followUpDate < interventionDate &&
            titlesRelated(events[i].title, events[j].title)
          ) {
            issues.push({
              eventIndex: i,
              field: 'eventDate',
              severity: 'warning',
              message: `Follow-up (${events[i].eventDate}) prima dell'intervento correlato (${events[j].eventDate})`,
              autoFixed: false,
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Simple check if two event titles are related (share significant words).
 */
function titlesRelated(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++;
  }
  return shared >= 2;
}
