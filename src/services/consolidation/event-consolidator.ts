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
 * Sentinel date used by the extractor when no real date can be inferred.
 * Events with this date are filtered out at consolidation: they pollute the
 * cronistoria with placeholder rows and have no chronological position.
 */
const SENTINEL_DATE = '1900-01-01';

/**
 * Indicators that the event was generated from broken OCR output. Trigger:
 * Schönweger case — the OCR returned table objects that the old code
 * stringified into the literal text "[object Object]"; the extractor then
 * dutifully created an event for each broken table, polluting the
 * cronistoria with 50+ "Tabelle non interpretabili" rows that contained
 * zero useful data. The OCR side is now fixed (coerceTableToHtml) but we
 * keep this filter as a defense-in-depth so future shape mismatches don't
 * silently re-create the bug.
 */
const BROKEN_OCR_MARKERS = ['[object Object]', '[object object]'];

function isBrokenOcrEvent(event: ExtractedEvent): boolean {
  const haystack = `${event.title ?? ''} ${event.description ?? ''}`;
  return BROKEN_OCR_MARKERS.some((m) => haystack.includes(m));
}

/**
 * Consolidate events from multiple documents into a single chronological timeline.
 * - Drops sentinel-date placeholders and broken-OCR events
 * - Orders events chronologically
 * - Detects and marks duplicate/overlapping events across documents
 * - Assigns sequential order numbers
 */
export function consolidateEvents(
  documentsEvents: DocumentEvents[],
): ConsolidatedEvent[] {
  // Flatten all events with their document ID
  const allEvents: Array<ExtractedEvent & { documentId: string }> = [];
  let droppedSentinel = 0;
  let droppedBroken = 0;

  for (const doc of documentsEvents) {
    for (const event of doc.events) {
      // Drop events with the sentinel date — they have no chronological position
      // and are usually placeholders generated when the extractor couldn't infer
      // a date. They distort the cronistoria with unanchored rows.
      // EXCEPTION: spesa_medica events. The perito (Lavini, 2026-05-11) reported
      // that medical-expense items without an explicit payment date were being
      // silently dropped from the expense table. For expenses, the *amount* is
      // the load-bearing field, not the date. Bollo (stamp duty), summary lines,
      // and faded receipt dates are common cases. The cronistoria UI already
      // excludes spesa_medica via NON_CLINICAL_TYPES, so these unanchored rows
      // don't pollute the clinical timeline.
      if (event.eventDate === SENTINEL_DATE && event.eventType !== 'spesa_medica') {
        droppedSentinel++;
        continue;
      }
      // Drop events whose content is literally "[object Object]" — broken OCR
      // upstream (now fixed in coerceTableToHtml, but defensive filter stays).
      if (isBrokenOcrEvent(event)) {
        droppedBroken++;
        continue;
      }
      allEvents.push({ ...event, documentId: doc.documentId });
    }
  }

  if (droppedSentinel > 0 || droppedBroken > 0) {
    console.info(
      `[consolidator] dropped ${droppedSentinel} sentinel-date events + ${droppedBroken} broken-OCR events`,
    );
  }

  // Sort chronologically, then by event type, then by title for deterministic ordering
  allEvents.sort((a, b) => {
    const dateCompare = (a.eventDate ?? '').localeCompare(b.eventDate ?? '');
    if (dateCompare !== 0) return dateCompare;
    const typeCompare = (a.eventType ?? '').localeCompare(b.eventType ?? '');
    if (typeCompare !== 0) return typeCompare;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });

  // Intra-document deduplication: when the same document yields multiple events
  // with same date+type and similar title (likely same fact extracted twice by
  // overlapping chunks or multi-pass extraction), keep only the highest-confidence
  // one. Trigger: Schönweger case — "Spondilodesi D11-L3" appeared twice (events
  // 13+14), "Glasgow Coma Scale 15/15" appeared twice (events 23+50), and 8
  // copies of "Esami ematochimici - Tabella N" were extracted from the same doc.
  const dedupedSameDoc = dedupWithinSameDocument(allEvents);

  // Sprint 1 S1.4 (Lavini quality, 2026-05-17): aggregate 3+ similar lab/imaging
  // exams on the same date into a single event. Reduces report verbosity:
  // "Emocromo / Creatinina / Transaminasi / INR / Glicemia" on the same date
  // become "Esami ematochimici routinari del DD.MM.YYYY (5 esami)".
  // Conservative: only fires when title token-overlap (Jaccard) >= 0.5 AND
  // eventType is a laboratory/imaging exam. Surgeries, diagnoses, etc. are
  // never aggregated.
  const aggregated = aggregateIdenticalEventsPerDay(dedupedSameDoc);

  // Detect duplicates/discrepancies across documents (existing behavior)
  const consolidated = markDiscrepancies(aggregated);

  // Assign sequential order numbers
  return consolidated.map((event, index) => ({
    ...event,
    orderNumber: index + 1,
  }));
}

/**
 * Drop near-duplicate events that come from the SAME document.
 * Two events are considered duplicates if they share documentId + eventDate +
 * eventType AND `isSimilarEvent` says their titles/descriptions match.
 * Keeps the event with the highest confidence. Stable order: original order
 * is preserved among non-duplicates.
 */
function dedupWithinSameDocument(
  events: Array<ExtractedEvent & { documentId: string }>,
): Array<ExtractedEvent & { documentId: string }> {
  const kept: Array<ExtractedEvent & { documentId: string }> = [];
  const droppedIndices = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (droppedIndices.has(i)) continue;
    const a = events[i];
    if (!a.eventDate || !a.eventType) {
      kept.push(a);
      continue;
    }

    // Look ahead for same-document, same-date, same-type peers
    for (let j = i + 1; j < events.length; j++) {
      if (droppedIndices.has(j)) continue;
      const b = events[j];
      // Stop scanning once we leave the date-type group (events are sorted)
      if (b.eventDate !== a.eventDate || b.eventType !== a.eventType) break;
      if (b.documentId !== a.documentId) continue;
      if (!isSimilarEvent(a, b)) continue;
      // Drop the lower-confidence twin (or the second one if equal)
      if ((b.confidence ?? 0) > (a.confidence ?? 0)) {
        droppedIndices.add(i);
        break; // a is dropped, move on
      } else {
        droppedIndices.add(j);
      }
    }

    if (!droppedIndices.has(i)) kept.push(a);
  }

  return kept;
}

/**
 * Sprint 1 S1.4 (Lavini quality, 2026-05-17): aggregate 3+ similar laboratory
 * or imaging exams on the same date into a single rolled-up event. Reduces
 * report verbosity ("5 emocromi nello stesso giorno" → 1 evento aggregato).
 *
 * CONSERVATIVE LOGIC — fires only when ALL conditions are met:
 *  - Group size >= 3 events
 *  - Same eventDate + eventType + sourceType
 *  - eventType is in AGGREGABLE_EXAM_TYPES (lab tests, instrumental exams)
 *  - Titles share >=50% token overlap (Jaccard on tokens >=4 chars,
 *    case-insensitive). This prevents merging "RX gomito" + "RX ginocchio"
 *    which are different exams on the same date.
 *
 * Aggregated event: title rolls up to "Esami ematochimici / Esami strumentali
 * (N esami)", description concatenates all originals separated by " | ",
 * sourcePages unions all page numbers, confidence is the min of the group,
 * sourceText concatenates source snippets for downstream citation fidelity.
 */
const AGGREGABLE_EXAM_TYPES = new Set([
  'esame',
  'esame_strumentale',
  'esame_ematochimico',
]);

function aggregateIdenticalEventsPerDay(
  events: Array<ExtractedEvent & { documentId: string }>,
): Array<ExtractedEvent & { documentId: string }> {
  if (events.length < 3) return events;

  // Group by (eventDate, eventType, sourceType, documentId)
  const groups = new Map<string, number[]>();
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!ev.eventDate || ev.eventDate === SENTINEL_DATE) continue;
    if (!AGGREGABLE_EXAM_TYPES.has(ev.eventType)) continue;
    const key = `${ev.eventDate}|${ev.eventType}|${ev.sourceType}|${ev.documentId}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }

  // Identify groups eligible for aggregation (size >=3).
  // For esame_ematochimico (already a specific category), always aggregate.
  // For esame/esame_strumentale (broader), require token overlap >=0.3 to
  // avoid merging "RX gomito" + "RX ginocchio" + "Risonanza colonna".
  const aggregatedIndices = new Set<number>();
  const replacements: Array<{ insertAt: number; event: ExtractedEvent & { documentId: string } }> = [];

  for (const [, indices] of groups) {
    if (indices.length < 3) continue;
    const sampleType = events[indices[0]].eventType;
    const groupTitles = indices.map((i) => events[i].title ?? '');
    if (sampleType !== 'esame_ematochimico') {
      if (!titlesShareKeywords(groupTitles, 0.3)) continue;
    }

    // Build aggregated event
    const sample = events[indices[0]];
    const eventTypeLabel = sample.eventType === 'esame_ematochimico'
      ? 'Esami ematochimici'
      : sample.eventType === 'esame_strumentale'
        ? 'Esami strumentali'
        : 'Esami';
    const aggregated: ExtractedEvent & { documentId: string } = {
      ...sample,
      title: `${eventTypeLabel} routinari (${indices.length} esami raggruppati)`,
      description: `Aggregato da ${indices.length} esami originari: ${indices.map((i) => events[i].title ?? events[i].description ?? '').filter(Boolean).join(' | ')}`,
      sourcePages: dedupSortPages(indices.flatMap((i) => events[i].sourcePages ?? [])),
      confidence: Math.min(...indices.map((i) => events[i].confidence ?? 0)),
      sourceText: indices.map((i) => events[i].sourceText ?? '').filter(Boolean).join(' / ').slice(0, 200),
    };
    for (const i of indices) aggregatedIndices.add(i);
    replacements.push({ insertAt: indices[0], event: aggregated });
  }

  if (aggregatedIndices.size === 0) return events;

  // Build result: skip indices in aggregatedIndices, insert aggregated events
  // at the position of their first member to keep chronological ordering stable.
  const insertMap = new Map<number, ExtractedEvent & { documentId: string }>();
  for (const r of replacements) insertMap.set(r.insertAt, r.event);

  const result: Array<ExtractedEvent & { documentId: string }> = [];
  for (let i = 0; i < events.length; i++) {
    if (insertMap.has(i)) result.push(insertMap.get(i)!);
    else if (!aggregatedIndices.has(i)) result.push(events[i]);
  }
  return result;
}

/** Token-based Jaccard similarity across multiple titles. Returns true if
 * ALL pairwise comparisons share >= threshold overlap on tokens >= 4 chars. */
function titlesShareKeywords(titles: string[], threshold: number): boolean {
  const tokenSets = titles.map((t) =>
    new Set(
      t.toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4),
    ),
  );
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      if (a.size === 0 || b.size === 0) return false;
      let intersect = 0;
      for (const t of a) if (b.has(t)) intersect++;
      const union = a.size + b.size - intersect;
      const jaccard = union === 0 ? 0 : intersect / union;
      if (jaccard < threshold) return false;
    }
  }
  return true;
}

function dedupSortPages(pages: number[]): number[] {
  return Array.from(new Set(pages)).sort((a, b) => a - b);
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
 * Jaccard similarity on word sets, enhanced with medical synonym normalization.
 */
// Medical abbreviations that must be kept in similarity calculation despite being ≤3 chars
const MEDICAL_ABBREVIATIONS = new Set([
  'ecg', 'tac', 'rmn', 'pcr', 'inr', 'ptt', 'tsh', 'ft3', 'ft4', 'pet', 'eeg', 'emg',
  'moc', 'hba', 'ves', 'hcv', 'hiv', 'hbv', 'ldl', 'hdl', 'bnp', 'cpk', 'got', 'gpt',
  'alt', 'ast', 'gfr', 'psa', 'cea', 'afp', 'ldh', 'crp', 'wbc', 'rbc', 'plt', 'hgb',
  'mcv', 'mch', 'rdw', 'mpv', 'fev', 'fvc', 'dlco', 'asa', 'bmi', 'nyha',
]);

/**
 * Italian medical synonyms: map abbreviations and variants to canonical forms.
 * This improves similarity detection when different documents use different terms
 * for the same thing (e.g., "ECG" vs "elettrocardiogramma", "TAC" vs "TC").
 */
const MEDICAL_SYNONYMS: Record<string, string> = {
  'ecg': 'elettrocardiogramma', 'ekg': 'elettrocardiogramma', 'elettrocardiogramma': 'elettrocardiogramma',
  'tac': 'tomografia', 'tc': 'tomografia', 'tomografia': 'tomografia',
  'rmn': 'risonanza', 'rm': 'risonanza', 'risonanza': 'risonanza',
  'rx': 'radiografia', 'radiografia': 'radiografia',
  'eco': 'ecografia', 'ecografia': 'ecografia',
  'emg': 'elettromiografia', 'elettromiografia': 'elettromiografia',
  'eeg': 'elettroencefalogramma', 'elettroencefalogramma': 'elettroencefalogramma',
  'pet': 'tomografia_pet', 'scintigrafia': 'scintigrafia',
  'follow-up': 'controllo', 'followup': 'controllo', 'follow_up': 'controllo',
  'post-operatorio': 'postoperatorio', 'postoperatorio': 'postoperatorio',
  'pre-operatorio': 'preoperatorio', 'preoperatorio': 'preoperatorio',
};

function normalizeMedicalWord(word: string): string {
  return MEDICAL_SYNONYMS[word] ?? word;
}

function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a.split(/\s+/)
      .filter((w) => w.length > 3 || MEDICAL_ABBREVIATIONS.has(w))
      .map(normalizeMedicalWord),
  );
  const wordsB = new Set(
    b.split(/\s+/)
      .filter((w) => w.length > 3 || MEDICAL_ABBREVIATIONS.has(w))
      .map(normalizeMedicalWord),
  );

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
