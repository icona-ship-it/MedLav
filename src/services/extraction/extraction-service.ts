import { MISTRAL_MODELS, streamMistralChat, TIMEOUT_EXTRACTION, DETERMINISTIC_SEED, assertNotTruncated } from '@/lib/mistral/client';
import type { MistralResponseFormat } from '@/lib/mistral/client';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import type { ExtractedEvent, ExtractionResponse } from './extraction-schemas';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './extraction-prompts';
import { annotateTablesInText } from './table-detector';
import type { CaseType } from '@/types';
import { jsonrepair } from 'jsonrepair';
import { logger } from '@/lib/logger';

// Smaller chunks = faster per-chunk extraction + less risk of truncation
const MAX_CHUNK_CHARS = 8_000;

// ── JSON Schema for structured extraction (enforced at token level by Mistral) ──
const EXTRACTION_JSON_SCHEMA: MistralResponseFormat = {
  type: 'json_schema',
  jsonSchema: {
    name: 'extraction_response',
    schemaDefinition: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              extraction_reasoning: {
                type: 'string',
                description: 'Why this event was extracted and where it was found in the text',
              },
              eventDate: {
                type: ['string', 'null'],
                description: 'Date in YYYY-MM-DD format, null if unknown',
              },
              datePrecision: {
                type: 'string',
                enum: ['giorno', 'mese', 'anno', 'sconosciuta'],
                description: 'How precise the date is',
              },
              eventType: {
                type: 'string',
                enum: [
                  'visita', 'esame', 'diagnosi', 'intervento', 'terapia',
                  'ricovero', 'follow-up', 'referto', 'prescrizione',
                  'consenso', 'complicanza', 'spesa_medica',
                  'documento_amministrativo', 'certificato', 'altro',
                ],
                description: 'Category of clinical event',
              },
              title: { type: 'string', description: 'Short title, max 100 chars' },
              description: { type: 'string', description: 'Complete detailed description with all values' },
              sourceType: {
                type: 'string',
                enum: ['cartella_clinica', 'referto_controllo', 'esame_strumentale', 'esame_ematochimico', 'altro'],
                description: 'Source document category',
              },
              diagnosis: { type: ['string', 'null'], description: 'Formal diagnosis if present' },
              doctor: { type: ['string', 'null'], description: 'Doctor name if present' },
              facility: { type: ['string', 'null'], description: 'Facility name if present' },
              confidence: { type: 'number', description: '0-100 confidence score' },
              requiresVerification: { type: 'boolean', description: 'Whether manual verification is needed' },
              reliabilityNotes: { type: ['string', 'null'], description: 'Reliability notes if applicable' },
              sourceText: { type: 'string', description: 'Exact quote from OCR text, max 200 chars' },
              sourcePages: { type: 'array', items: { type: 'number' }, description: 'Page numbers' },
            },
            required: [
              'extraction_reasoning', 'eventDate', 'datePrecision', 'eventType',
              'title', 'description', 'sourceType', 'confidence',
              'requiresVerification', 'sourceText', 'sourcePages',
            ],
          },
        },
        abbreviations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              abbreviation: { type: 'string' },
              expansion: { type: 'string' },
            },
            required: ['abbreviation', 'expansion'],
          },
        },
      },
      required: ['events'],
    },
  },
};

export interface ExtractionParams {
  documentText: string;
  fileName: string;
  documentType: string;
  caseType: CaseType;
  temperature?: number;
}

/**
 * Pre-process text and split into chunks for extraction.
 * Returns chunks ready to be processed (potentially in parallel).
 */
export function prepareExtractionChunks(params: ExtractionParams): {
  chunks: string[];
  params: ExtractionParams;
} {
  const { documentText } = params;

  const { annotatedText, tableCount } = annotateTablesInText(documentText);
  if (tableCount > 0) {
    logger.info('extraction', ` Annotated ${tableCount} tables in document`);
  }

  const processedParams = { ...params, documentText: annotatedText };

  if (annotatedText.length <= MAX_CHUNK_CHARS) {
    return { chunks: [annotatedText], params: processedParams };
  }

  const chunks = splitTextIntoChunks(annotatedText, MAX_CHUNK_CHARS);
  logger.info('extraction', ` Split ${annotatedText.length} chars into ${chunks.length} chunks`);
  return { chunks, params: processedParams };
}

/**
 * Extract events from a single text chunk using streaming.
 * Designed to be called as a separate Inngest step for parallelism.
 */
export async function extractEventsFromChunk(params: {
  chunkText: string;
  chunkLabel: string;
  documentType: string;
  caseType: CaseType | CaseType[];
  temperature?: number;
  chunkIndex?: number;
  totalChunks?: number;
  documentName?: string;
  pageRange?: string;
  /** Wave C.4: language hint when chunk OCR is detected as not-Italian. */
  languageHint?: 'de' | 'en' | 'mixed';
}): Promise<ExtractionResponse & { usage?: TokenUsage }> {
  const {
    chunkText, chunkLabel, documentType, caseType,
    temperature = 0, chunkIndex, totalChunks, documentName, pageRange, languageHint,
  } = params;

  const startMs = Date.now();
  logger.info('extraction', ` Starting Mistral Large for "${chunkLabel}" (${chunkText.length} chars)`);

  const result_ = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      {
        role: 'system',
        content: buildExtractionSystemPrompt(caseType),
      },
      {
        role: 'user',
        content: buildExtractionUserPrompt({
          documentText: chunkText,
          fileName: chunkLabel,
          documentType,
          chunkIndex,
          totalChunks,
          documentName,
          pageRange,
          languageHint,
        }),
      },
    ],
    responseFormat: EXTRACTION_JSON_SCHEMA,
    temperature,
    maxTokens: 8192,
    timeoutMs: TIMEOUT_EXTRACTION,
    randomSeed: DETERMINISTIC_SEED,
    label: `extraction:${chunkLabel.slice(0, 30)}`,
  });
  assertNotTruncated(result_, `extraction:${chunkLabel.slice(0, 30)}`);
  const { content, usage } = result_;

  const elapsedMs = Date.now() - startMs;
  logger.info('extraction', ` Mistral Large responded in ${elapsedMs}ms (${content.length} chars)`);

  const result = parseExtractionResponse(content, chunkLabel);
  const validatedEvents = validateExtractedNamesAgainstOcr(result.events, chunkText);
  const inferredEvents = inferMissingDates(validatedEvents);
  const filteredEvents = flagLegislativeReferences(inferredEvents);
  return { ...result, events: filteredEvents, usage };
}

/**
 * Extract events from a full document (single chunk or auto-chunked).
 * For small documents. Large documents should use prepareExtractionChunks +
 * extractEventsFromChunk in parallel Inngest steps.
 */
export async function extractEventsFromDocument(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { chunks, params: processedParams } = prepareExtractionChunks(params);

  if (chunks.length === 1) {
    return extractEventsFromChunk({
      chunkText: chunks[0],
      chunkLabel: processedParams.fileName,
      documentType: processedParams.documentType,
      caseType: processedParams.caseType,
      temperature: processedParams.temperature,
      chunkIndex: 0,
      totalChunks: 1,
      documentName: processedParams.fileName,
    });
  }

  // Sequential fallback (for non-Inngest callers)
  const allEvents: ExtractedEvent[] = [];
  const allAbbreviations: Array<{ abbreviation: string; expansion: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = `${processedParams.fileName} [parte ${i + 1}/${chunks.length}]`;
    const result = await extractEventsFromChunk({
      chunkText: chunks[i],
      chunkLabel,
      documentType: processedParams.documentType,
      caseType: processedParams.caseType,
      temperature: processedParams.temperature,
      chunkIndex: i,
      totalChunks: chunks.length,
      documentName: processedParams.fileName,
    });

    allEvents.push(...result.events);
    if (result.abbreviations) {
      allAbbreviations.push(...result.abbreviations);
    }
  }

  // Deduplicate within document
  const dedupedEvents = deduplicateWithinDocument(allEvents);

  // Self-verify critical events
  const fullText = chunks.join('\n');
  const verifiedEvents = flagUnverifiedEvents(dedupedEvents, fullText);

  return {
    events: verifiedEvents,
    abbreviations: deduplicateAbbreviations(allAbbreviations),
  };
}

// --- Internal helpers ---

interface PageBlock {
  pageNumber: number;
  text: string;
}

function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const pageBlocks = extractPageBlocks(text);

  if (pageBlocks.length === 0) {
    return splitByCharacterBoundaries(text, maxChunkSize);
  }

  return splitPageBlocksIntoChunks(pageBlocks, maxChunkSize);
}

function extractPageBlocks(text: string): PageBlock[] {
  const blocks: PageBlock[] = [];
  const regex = /\[PAGE_START:(\d+)\]([\s\S]*?)\[PAGE_END:\d+\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      pageNumber: parseInt(match[1], 10),
      text: match[0],
    });
  }

  return blocks;
}

function splitPageBlocksIntoChunks(blocks: PageBlock[], maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let currentPages: string[] = [];
  let currentSize = 0;
  // Overlap: keep last 2 pages from previous chunk
  const OVERLAP_PAGES = 2;
  let lastPagesOfPrevChunk: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.text.length > maxChunkSize) {
      if (currentPages.length > 0) {
        chunks.push(currentPages.join('\n'));
        lastPagesOfPrevChunk = currentPages.slice(-OVERLAP_PAGES);
        currentPages = [];
        currentSize = 0;
      }
      const subChunks = splitByCharacterBoundaries(block.text, maxChunkSize);
      chunks.push(...subChunks);
      lastPagesOfPrevChunk = [];
      continue;
    }

    if (currentSize + block.text.length > maxChunkSize && currentPages.length > 0) {
      chunks.push(currentPages.join('\n'));
      lastPagesOfPrevChunk = currentPages.slice(-OVERLAP_PAGES);
      currentPages = [...lastPagesOfPrevChunk];
      currentSize = currentPages.reduce((s, p) => s + p.length, 0);
    }

    currentPages.push(block.text);
    currentSize += block.text.length;
  }

  if (currentPages.length > 0) {
    chunks.push(currentPages.join('\n'));
  }

  return chunks;
}

function splitByCharacterBoundaries(text: string, maxChunkSize: number): string[] {
  const overlapSize = 2_000;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    if (end < text.length) {
      const searchStart = Math.max(end - 1000, start);
      const searchText = text.slice(searchStart, end);
      const lastDoubleNewline = searchText.lastIndexOf('\n\n');
      if (lastDoubleNewline !== -1) {
        end = searchStart + lastDoubleNewline + 2;
      } else {
        const lastNewline = searchText.lastIndexOf('\n');
        if (lastNewline !== -1) {
          end = searchStart + lastNewline + 1;
        }
      }
    }

    chunks.push(text.slice(start, end));
    start = Math.max(end - overlapSize, start + 1);
    if (end >= text.length) break;
  }

  return chunks;
}

// ── Date inference for events with missing dates ──

const SENTINEL_DATE = '1900-01-01';

/**
 * Infer missing dates from nearby events on the same source pages.
 * For events with sentinel date '1900-01-01', tries to find a "donor" event
 * on the same page (or ±1 page) that has a valid date.
 */
export function inferMissingDates(events: ExtractedEvent[]): ExtractedEvent[] {
  if (events.length === 0) return events;

  // Index events with valid dates by page number
  const datedEventsByPage = new Map<number, ExtractedEvent[]>();
  for (const event of events) {
    if (event.eventDate === SENTINEL_DATE) continue;
    for (const page of event.sourcePages) {
      const existing = datedEventsByPage.get(page) ?? [];
      existing.push(event);
      datedEventsByPage.set(page, existing);
    }
  }

  // Nothing to donate from
  if (datedEventsByPage.size === 0) return events;

  let inferredCount = 0;

  const result = events.map((event) => {
    if (event.eventDate !== SENTINEL_DATE) return event;

    // Try to find a donor: same page first, then ±1
    const donor = findDateDonor(event.sourcePages, datedEventsByPage);
    if (!donor) return event;

    inferredCount++;
    const note = `Data approssimata — desunta da "${donor.title}" del ${donor.eventDate} nella stessa pagina. Verificare sul documento originale.`;
    return {
      ...event,
      eventDate: donor.eventDate,
      datePrecision: 'sconosciuta' as const,
      confidence: Math.max(10, Math.min(event.confidence - 30, 40)),
      requiresVerification: true,
      reliabilityNotes: event.reliabilityNotes
        ? `${event.reliabilityNotes} | ${note}`
        : note,
    };
  });

  if (inferredCount > 0) {
    logger.info('extraction', `Date inference: ${inferredCount} events inherited dates from nearby events`);
  }

  return result;
}

// ── Legislative reference filter ──

const LEGISLATIVE_PATTERNS = [
  /\bLegge\s+\d+\/\d{4}\b/i,
  /\bL\.\s*\d+\/\d{4}\b/i,
  /\bD\.?\s*L\.?\s*gs\.?\s*\d+\/\d{4}\b/i,
  /\bD\.?\s*P\.?\s*R\.?\s*\d+\/\d{4}\b/i,
  /\bD\.?\s*M\.?\s*\d+\/\d{4}\b/i,
  /\bArt\.?\s*\d+\s+c\.?\s*[cp]\b/i, // Art. 2043 c.c.
  /\bCass\.?\s*(Civ|Pen|Sez)/i, // Cassazione
  /\bSent(?:enza)?\s+n\.\s*\d+/i, // Sentenza n.
];

const PATIENT_KEYWORDS = [
  'paziente', 'periziando', 'ricorrente', 'resistente',
  'sig.', 'signor', 'signora', 'sig.ra',
  'danneggiato', 'danneggiata', 'vittima',
  'lavoratore', 'lavoratrice', 'assicurato', 'assicurata',
  'infortunato', 'infortunata', 'assistito', 'assistita',
  'ricorsa', 'attore', 'attrice', 'convenuto', 'convenuta',
];

/**
 * Flag legislative references that are NOT about the patient.
 * Does NOT delete them — marks with very low confidence so they sort to bottom.
 */
export function flagLegislativeReferences(events: ExtractedEvent[]): ExtractedEvent[] {
  let flaggedCount = 0;

  const result = events.map((event) => {
    // Only check documento_amministrativo and altro types
    if (event.eventType !== 'documento_amministrativo' && event.eventType !== 'altro') return event;

    const text = `${event.title} ${event.description}`.toLowerCase();

    // Does it match a legislative pattern?
    const isLegislative = LEGISLATIVE_PATTERNS.some((p) => p.test(event.title) || p.test(event.description));
    if (!isLegislative) return event;

    // Does it reference the patient specifically?
    const mentionsPatient = PATIENT_KEYWORDS.some((kw) => text.includes(kw));
    if (mentionsPatient) return event; // Keep — it's about the patient

    flaggedCount++;
    return {
      ...event,
      confidence: Math.min(event.confidence, 10),
      requiresVerification: true,
      reliabilityNotes: `Riferimento normativo generico — potrebbe non essere pertinente alla vicenda clinica del paziente. ${event.reliabilityNotes ?? ''}`.trim(),
    };
  });

  if (flaggedCount > 0) {
    logger.info('extraction', `Legislative filter: ${flaggedCount} normative references flagged with low confidence`);
  }

  return result;
}

/**
 * Find a date donor for an event without a date.
 * Priority: same page > adjacent page (±1).
 *
 * MEDICO-LEGAL SAFETY (audit 2026-05-31, confermato Lavini): inherit a date
 * ONLY when the page is unambiguous — i.e. all candidate donors share a SINGLE
 * date. The previous heuristic "pick the most recent" silently assigned the
 * DISCHARGE date to an undated lab that sat between an admission and a discharge
 * on the same page — a confidently-wrong date in a forensic timeline. When
 * multiple distinct dates are present, refuse to guess: leave the event undated
 * (sentinel) and flagged, so the perito assigns the correct date.
 */
function findDateDonor(
  sourcePages: number[],
  datedEventsByPage: Map<number, ExtractedEvent[]>,
): ExtractedEvent | null {
  // Collect all candidate donors from same page, then adjacent pages
  const candidates: ExtractedEvent[] = [];

  // Priority 1: exact same page
  for (const page of sourcePages) {
    const donors = datedEventsByPage.get(page);
    if (donors) candidates.push(...donors);
  }

  // Priority 2: adjacent page (±1) — only if no same-page donors
  if (candidates.length === 0) {
    for (const page of sourcePages) {
      for (const offset of [-1, 1]) {
        const donors = datedEventsByPage.get(page + offset);
        if (donors) candidates.push(...donors);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Inherit ONLY if the page is unambiguous (one single date among candidates).
  const distinctDates = Array.from(
    new Set(candidates.map((c) => c.eventDate).filter((d): d is string => Boolean(d) && d !== SENTINEL_DATE)),
  );
  if (distinctDates.length !== 1) return null; // ambiguous → do not fabricate a date
  return candidates.find((c) => c.eventDate === distinctDates[0]) ?? null;
}

/**
 * 3-level JSON parse with repair and recovery.
 */
function safeJsonParse(raw: string, label: string): unknown {
  // Level 1: Direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // Level 2: Automatic repair (close brackets, fix quotes, etc.)
  try {
    const repaired = jsonrepair(raw);
    logger.warn('extraction', `[${label}] JSON repaired (${raw.length} -> ${repaired.length} chars)`);
    return JSON.parse(repaired);
  } catch {
    // continue
  }

  // Level 3: Manual recovery of events from truncated JSON
  const eventsMatch = raw.match(/"events"\s*:\s*\[/);
  if (eventsMatch && eventsMatch.index !== undefined) {
    const fromEvents = raw.substring(eventsMatch.index);
    const lastCloseBrace = fromEvents.lastIndexOf('}');
    if (lastCloseBrace > 0) {
      try {
        const partial = '{' + fromEvents.substring(0, lastCloseBrace + 1) + ']}';
        const result = JSON.parse(partial) as Record<string, unknown>;
        const count = Array.isArray(result.events) ? result.events.length : 0;
        logger.warn('extraction', `[${label}] Recovered ${count} events from truncated JSON (${raw.length} chars total)`);
        return result;
      } catch { /* give up */ }
    }
  }

  // All levels failed: do NOT swallow the error with an empty events array.
  // Returning {events:[]} silently makes the perito believe a document carries
  // no clinical events when in reality the LLM produced unparseable output.
  // Inngest will retry; if every attempt fails the document lands in
  // processing_status='failed' with a visible error in the UI.
  const preview = raw.slice(0, 500).replace(/\s+/g, ' ');
  logger.error('extraction',
    `[${label}] JSON irrecoverable (${raw.length} chars). First 500: ${preview}`,
  );
  throw new Error(
    `Estrazione fallita per "${label}": JSON LLM irrecuperabile dopo 3 livelli di fallback. Inngest ritenterà.`,
  );
}

/**
 * Parse extraction response with maximum resilience.
 */
function parseExtractionResponse(content: string, chunkLabel?: string): ExtractionResponse {
  const label = `parse:${chunkLabel ?? 'unknown'}`;
  const raw = safeJsonParse(content, label) as Record<string, unknown>;

  // Find events array — try multiple key names
  let rawEvents: unknown[] | null = null;
  for (const key of ['events', 'Events', 'eventi', 'EVENTS']) {
    if (Array.isArray(raw[key])) {
      rawEvents = raw[key] as unknown[];
      break;
    }
  }

  // Search all keys for array with event-like objects
  if (!rawEvents) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        const first = value[0] as Record<string, unknown>;
        if ('eventDate' in first || 'title' in first || 'description' in first) {
          rawEvents = value as unknown[];
          logger.info('extraction', ` Found events under key "${key}"`);
          break;
        }
      }
    }
  }

  if (!rawEvents || rawEvents.length === 0) {
    logger.error('extraction', `No events found. Keys: ${Object.keys(raw).join(', ')}`);
    logger.error('extraction', `Preview: ${content.slice(0, 500)}`);
    return { events: [] };
  }

  // Parse each event with safe defaults
  const validEvents: ExtractedEvent[] = [];
  let sentinelCopyCount = 0;
  for (const rawEvent of rawEvents) {
    const e = rawEvent as Record<string, unknown>;
    if (!e || typeof e !== 'object') continue;
    if (!('title' in e) && !('description' in e)) continue;

    // Handle missing/invalid dates — never invent dates
    // Use '1900-01-01' sentinel for missing dates (DB column is NOT NULL)
    const rawDate = e.eventDate ?? e.event_date;
    const dateStr = rawDate != null ? String(rawDate).trim() : '';
    const isDateMissing = !dateStr || dateStr === '1900-01-01' || dateStr === 'null' || dateStr === 'undefined';
    const normalizedDate = isDateMissing ? '1900-01-01' : normalizeDateFormat(dateStr);
    const eventDate = normalizedDate ?? '1900-01-01';
    const isDateInvalid = !isDateMissing && normalizedDate === null;
    const datePrecision = (isDateMissing || isDateInvalid)
      ? 'sconosciuta'
      : String(e.datePrecision ?? e.date_precision ?? 'sconosciuta');

    // Sentinel detection: nullify fields where LLM copied placeholder values from example
    const rawDiagnosis = e.diagnosis != null ? String(e.diagnosis) : null;
    const rawDoctor = e.doctor != null ? String(e.doctor) : null;
    const rawFacility = e.facility != null ? String(e.facility) : null;
    const diagnosis = rawDiagnosis && isSentinelValue(rawDiagnosis) ? null : rawDiagnosis;
    const doctor = rawDoctor && isSentinelValue(rawDoctor) ? null : rawDoctor;
    const facility = rawFacility && isSentinelValue(rawFacility) ? null : rawFacility;
    if (diagnosis !== rawDiagnosis || doctor !== rawDoctor || facility !== rawFacility) {
      sentinelCopyCount++;
    }

    validEvents.push({
      eventDate,
      datePrecision,
      eventType: String(e.eventType ?? e.event_type ?? 'altro'),
      title: String(e.title ?? 'Evento clinico'),
      description: String(e.description ?? ''),
      sourceType: String(e.sourceType ?? e.source_type ?? 'altro'),
      diagnosis,
      doctor,
      facility,
      confidence: typeof e.confidence === 'number' ? Math.min(100, Math.max(0, e.confidence)) : 70,
      requiresVerification: (isDateMissing || isDateInvalid) ? true : Boolean(e.requiresVerification ?? e.requires_verification ?? false),
      reliabilityNotes: isDateMissing
        ? (e.reliabilityNotes != null ? `${String(e.reliabilityNotes)} | Data non presente nel documento originale` : 'Data non presente nel documento originale')
        : isDateInvalid
          ? (e.reliabilityNotes != null ? `${String(e.reliabilityNotes)} | Formato data non valido nel documento: "${dateStr}"` : `Formato data non valido nel documento: "${dateStr}"`)
          : (e.reliabilityNotes != null ? String(e.reliabilityNotes) : null),
      sourceText: String(e.sourceText ?? e.source_text ?? ''),
      sourcePages: Array.isArray(e.sourcePages ?? e.source_pages) ? ((e.sourcePages ?? e.source_pages) as number[]) : [1],
    });
  }

  if (sentinelCopyCount > 0) {
    logger.warn('extraction', `Detected ${sentinelCopyCount} events with sentinel/placeholder values copied from example — nullified`);
  }

  const abbreviations = raw.abbreviations as Array<{ abbreviation: string; expansion: string }> | undefined;
  logger.info('extraction', ` Parsed ${validEvents.length}/${rawEvents.length} events`);
  return { events: validEvents, abbreviations };
}

// ── Date format normalization ──

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const EURO_DATE_REGEX = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;

/**
 * True only for a REAL calendar date. A format-only check is not enough: an
 * invalid date like "2024-02-31" or "2024-13-01" would either silently roll
 * over via `new Date()` ("2024-02-31" → 2024-03-02) or become an Invalid Date
 * → NaN day-counts in the ITT/ITP calculations downstream. We reject it so the
 * caller stores the sentinel (a flagged "data non documentata") instead of a
 * silently-wrong date.
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

/**
 * Normalize a date string to ISO YYYY-MM-DD format.
 * Accepts: YYYY-MM-DD (pass-through), DD.MM.YYYY, DD/MM/YYYY.
 * Returns null if the format is unrecognizable OR the date is not a real
 * calendar date — caller should use the sentinel.
 */
export function normalizeDateFormat(dateStr: string): string | null {
  // Already ISO format — but still validate it is a REAL date (format ≠ valid).
  const isoMatch = dateStr.match(ISO_DATE_REGEX);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isRealCalendarDate(y, m, d)) return dateStr;
    logger.warn('extraction', `ISO date out of calendar range: "${dateStr}" — using sentinel`);
    return null;
  }

  // European format: DD.MM.YYYY or DD/MM/YYYY
  const euroMatch = dateStr.match(EURO_DATE_REGEX);
  if (euroMatch) {
    const day = euroMatch[1].padStart(2, '0');
    const month = euroMatch[2].padStart(2, '0');
    const year = euroMatch[3];
    if (isRealCalendarDate(parseInt(year, 10), parseInt(month, 10), parseInt(day, 10))) {
      return `${year}-${month}-${day}`;
    }
  }

  // Unrecognizable / invalid date
  logger.warn('extraction', `Unrecognizable or invalid date: "${dateStr}" — using sentinel`);
  return null;
}

// ── Post-extraction validation: verify names exist in OCR text ──

/**
 * Validate that extracted doctor/facility names actually appear in the source OCR text.
 * Prevents LLM hallucination of names that don't exist in the original document.
 * Names not found in OCR are nullified and confidence is lowered.
 */
function validateExtractedNamesAgainstOcr(
  events: ExtractedEvent[],
  ocrText: string,
): ExtractedEvent[] {
  if (!ocrText || ocrText.length === 0) return events;

  const ocrLower = ocrText.toLowerCase();
  let nullifiedCount = 0;

  const validated = events.map((event) => {
    let modified = false;
    let newDoctor = event.doctor;
    let newFacility = event.facility;
    let newConfidence = event.confidence;
    let newRequiresVerification = event.requiresVerification;
    let notes = event.reliabilityNotes;

    // Validate doctor name: must appear in OCR text (case-insensitive, word boundary)
    if (newDoctor && newDoctor.length >= 3) {
      const doctorLower = newDoctor.toLowerCase();
      // Check if at least the surname (last word, >= 3 chars) appears as whole word in OCR
      const parts = doctorLower.split(/\s+/).filter((p) => p.length >= 3);
      const surnameFound = parts.some((part) => {
        const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`).test(ocrLower);
      });
      if (!surnameFound) {
        newDoctor = null;
        newConfidence = Math.min(newConfidence, 50);
        newRequiresVerification = true;
        notes = notes
          ? `${notes} | Nome medico non riscontrato nel documento originale — rimosso per verifica`
          : 'Nome medico non riscontrato nel documento originale — rimosso per verifica';
        modified = true;
      }
    }

    // Validate facility name: must appear in OCR text (case-insensitive, word boundary)
    if (newFacility && newFacility.length >= 4) {
      const facilityLower = newFacility.toLowerCase();
      // Check if the main keyword (>= 4 chars) appears as whole word in OCR
      const parts = facilityLower.split(/\s+/).filter((p) => p.length >= 4);
      const facilityFound = parts.some((part) => {
        const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${escaped}\\b`).test(ocrLower);
      });
      if (!facilityFound) {
        newFacility = null;
        newConfidence = Math.min(newConfidence, 50);
        newRequiresVerification = true;
        notes = notes
          ? `${notes} | Nome struttura non riscontrato nel documento originale — rimosso per verifica`
          : 'Nome struttura non riscontrato nel documento originale — rimosso per verifica';
        modified = true;
      }
    }

    if (modified) {
      nullifiedCount++;
      return {
        ...event,
        doctor: newDoctor,
        facility: newFacility,
        confidence: newConfidence,
        requiresVerification: newRequiresVerification,
        reliabilityNotes: notes,
      };
    }
    return event;
  });

  if (nullifiedCount > 0) {
    // GDPR (.claude/rules/security.md): MAI loggare i nomi propri (medico/struttura
    // SONO dati personali). Solo conteggi aggregati. Il nome non riscontrato nell'OCR
    // viene azzerato (anti-hallucination) e reliabilityNotes porta solo una nota
    // generica: il nome NON viene conservato — coerente col non doverlo loggare.
    const doctorNullified = validated.filter((v, i) => events[i].doctor && !v.doctor).length;
    const facilityNullified = validated.filter((v, i) => events[i].facility && !v.facility).length;
    logger.warn('extraction', `Name validation: ${nullifiedCount}/${events.length} events had names not in OCR. Nullified medico=${doctorNullified}, struttura=${facilityNullified}`);
  }

  return validated;
}

// ── Sentinel value detection (prevent LLM from copying example placeholders) ──

const SENTINEL_PATTERNS = [
  /PLACEHOLDER/i, /NON_COPIARE/i, /ESEMPIO_FITTIZIO/i,
  /NOME_ESEMPIO/i, /STRUTTURA_PLACEHOLDER/i, /DIAGNOSI_PLACEHOLDER/i,
];

function isSentinelValue(value: string): boolean {
  return SENTINEL_PATTERNS.some((p) => p.test(value));
}

// ── Intra-document deduplication ──

function jaccardSimilarity(a: string, b: string): number {
  // Wave C.1 (post-Schönweger): preserve umlauts (ä ö ü ß), Spanish ñ, accented
  // French/Italian letters via Unicode property class. Previous regex stripped
  // them, so dedup on German/foreign names like "Schönweger" failed.
  const tokenize = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function deduplicateWithinDocument(allChunkEvents: ExtractedEvent[]): ExtractedEvent[] {
  const result: ExtractedEvent[] = [];

  for (const event of allChunkEvents) {
    const eventText = `${event.title || ''} ${event.description || ''}`;
    const eventDate = event.eventDate || '';

    const duplicateIndex = result.findIndex((existing) => {
      const existingDate = existing.eventDate || '';
      if (eventDate !== existingDate) return false;

      const existingText = `${existing.title || ''} ${existing.description || ''}`;
      return jaccardSimilarity(eventText, existingText) > 0.6;
    });

    if (duplicateIndex >= 0) {
      const existing = result[duplicateIndex];
      const existingScore = (existing.confidence ?? 0) * 10 + (existing.description?.length ?? 0);
      const newScore = (event.confidence ?? 0) * 10 + (event.description?.length ?? 0);
      if (newScore > existingScore) {
        result[duplicateIndex] = event;
      }
    } else {
      result.push(event);
    }
  }

  const removed = allChunkEvents.length - result.length;
  if (removed > 0) {
    logger.info('extraction',
      `Deduplicated within document: ${allChunkEvents.length} -> ${result.length} events ` +
      `(${removed} duplicates removed via Jaccard similarity)`,
    );
  }
  return result;
}

// ── Self-verification: grounding check for ALL events ──

const CRITICAL_EVENT_TYPES = [
  'intervento', 'diagnosi', 'complicanza', 'ricovero', 'dimissione',
  'decesso', 'consenso', 'trasfusione',
];

function flagUnverifiedEvents(
  events: ExtractedEvent[],
  fullText: string,
): ExtractedEvent[] {
  const normalizedFull = fullText.toLowerCase().replace(/\s+/g, ' ');
  let ungroundedCount = 0;

  const result = events.map((event) => {
    const isCritical = CRITICAL_EVENT_TYPES.includes(event.eventType || '');
    const sourceText = event.sourceText || '';

    // Check 1: sourceText too short or missing
    if (sourceText.length < 10) {
      ungroundedCount++;
      return {
        ...event,
        requiresVerification: true,
        reliabilityNotes: ((event.reliabilityNotes || '') +
          (isCritical
            ? ' Evento critico senza riscontro testuale — richiede revisione.'
            : ' Testo sorgente assente o troppo breve.')).trim(),
      };
    }

    // Check 2: sourceText not found in document (fuzzy: use first 60 chars for matching)
    const matchText = sourceText.length > 60 ? sourceText.slice(0, 60) : sourceText;
    const normalizedSource = matchText.toLowerCase().replace(/\s+/g, ' ').trim();

    if (normalizedSource.length >= 10 && !normalizedFull.includes(normalizedSource)) {
      ungroundedCount++;
      return {
        ...event,
        requiresVerification: true,
        reliabilityNotes: ((event.reliabilityNotes || '') +
          (isCritical
            ? ' Evento critico: testo sorgente non riscontrato nel documento — possibile imprecisione, richiede revisione.'
            : ' Testo sorgente non riscontrato nel documento — verificare.')).trim(),
      };
    }

    return event;
  });

  if (ungroundedCount > 0) {
    logger.info('extraction', `Grounding check: ${ungroundedCount}/${events.length} events flagged for verification`);
  }

  return result;
}

function deduplicateAbbreviations(
  abbreviations: Array<{ abbreviation: string; expansion: string }>,
): Array<{ abbreviation: string; expansion: string }> {
  const seen = new Set<string>();
  return abbreviations.filter((abbr) => {
    const key = abbr.abbreviation.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
