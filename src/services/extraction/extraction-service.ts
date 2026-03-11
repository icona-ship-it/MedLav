import { MISTRAL_MODELS, streamMistralChat, TIMEOUT_EXTRACTION } from '@/lib/mistral/client';
import type { ExtractedEvent, ExtractionResponse } from './extraction-schemas';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './extraction-prompts';
import { annotateTablesInText } from './table-detector';
import type { CaseType } from '@/types';
import { jsonrepair } from 'jsonrepair';
import { logger } from '@/lib/logger';

// Smaller chunks = faster per-chunk extraction + less risk of truncation
const MAX_CHUNK_CHARS = 15_000;

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
}): Promise<ExtractionResponse> {
  const {
    chunkText, chunkLabel, documentType, caseType,
    temperature = 0.2, chunkIndex, totalChunks, documentName, pageRange,
  } = params;

  const startMs = Date.now();
  logger.info('extraction', ` Starting Mistral Large for "${chunkLabel}" (${chunkText.length} chars)`);

  const content = await streamMistralChat({
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
        }),
      },
    ],
    responseFormat: { type: 'json_object' },
    temperature,
    maxTokens: 8192,
    timeoutMs: TIMEOUT_EXTRACTION,
    label: `extraction:${chunkLabel.slice(0, 30)}`,
  });

  const elapsedMs = Date.now() - startMs;
  logger.info('extraction', ` Mistral Large responded in ${elapsedMs}ms (${content.length} chars)`);

  return parseExtractionResponse(content, chunkLabel);
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
  const verifiedEvents = flagUnverifiedCriticalEvents(dedupedEvents, fullText);

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

  // All levels failed
  logger.error('extraction',
    `[${label}] JSON irrecoverable (${raw.length} chars). First 500: ${raw.slice(0, 500)}`,
  );
  return { events: [] };
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
  for (const rawEvent of rawEvents) {
    const e = rawEvent as Record<string, unknown>;
    if (!e || typeof e !== 'object') continue;
    if (!('title' in e) && !('description' in e)) continue;

    // Handle missing/invalid dates — never invent dates
    const rawDate = e.eventDate ?? e.event_date;
    const dateStr = rawDate != null ? String(rawDate) : '';
    const isDateMissing = !dateStr || dateStr === '1900-01-01' || dateStr === 'null' || dateStr === 'undefined';
    const eventDate = isDateMissing ? '' : dateStr;
    const datePrecision = isDateMissing
      ? 'sconosciuta'
      : String(e.datePrecision ?? e.date_precision ?? 'sconosciuta');

    validEvents.push({
      eventDate,
      datePrecision,
      eventType: String(e.eventType ?? e.event_type ?? 'altro'),
      title: String(e.title ?? 'Evento clinico'),
      description: String(e.description ?? ''),
      sourceType: String(e.sourceType ?? e.source_type ?? 'altro'),
      diagnosis: e.diagnosis != null ? String(e.diagnosis) : null,
      doctor: e.doctor != null ? String(e.doctor) : null,
      facility: e.facility != null ? String(e.facility) : null,
      confidence: typeof e.confidence === 'number' ? Math.min(100, Math.max(0, e.confidence)) : 70,
      requiresVerification: isDateMissing ? true : Boolean(e.requiresVerification ?? e.requires_verification ?? false),
      reliabilityNotes: isDateMissing
        ? (e.reliabilityNotes != null ? `${String(e.reliabilityNotes)} | Data non presente nel documento originale` : 'Data non presente nel documento originale')
        : (e.reliabilityNotes != null ? String(e.reliabilityNotes) : null),
      sourceText: String(e.sourceText ?? e.source_text ?? ''),
      sourcePages: Array.isArray(e.sourcePages ?? e.source_pages) ? ((e.sourcePages ?? e.source_pages) as number[]) : [1],
    });
  }

  const abbreviations = raw.abbreviations as Array<{ abbreviation: string; expansion: string }> | undefined;
  logger.info('extraction', ` Parsed ${validEvents.length}/${rawEvents.length} events`);
  return { events: validEvents, abbreviations };
}

// ── Intra-document deduplication ──

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a.toLowerCase().replace(/[^\w\sàèéìòù]/g, '').split(/\s+/).filter((w) => w.length > 3),
  );
  const wordsB = new Set(
    b.toLowerCase().replace(/[^\w\sàèéìòù]/g, '').split(/\s+/).filter((w) => w.length > 3),
  );

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

// ── Self-verification for critical events ──

const CRITICAL_EVENT_TYPES = [
  'intervento', 'diagnosi', 'complicanza', 'ricovero', 'dimissione',
  'decesso', 'consenso', 'trasfusione',
];

function flagUnverifiedCriticalEvents(
  events: ExtractedEvent[],
  fullText: string,
): ExtractedEvent[] {
  const normalizedFull = fullText.toLowerCase().replace(/\s+/g, ' ');

  return events.map((event) => {
    const isCritical = CRITICAL_EVENT_TYPES.includes(event.eventType || '');
    if (!isCritical) return event;

    const sourceText = event.sourceText || '';
    if (sourceText.length < 10) {
      return {
        ...event,
        requiresVerification: true,
        reliabilityNotes: ((event.reliabilityNotes || '') +
          ' [AUTO] Evento critico senza testo sorgente — richiede revisione manuale.').trim(),
      };
    }

    const normalizedSource = sourceText.toLowerCase().replace(/\s+/g, ' ').trim();

    if (!normalizedFull.includes(normalizedSource)) {
      return {
        ...event,
        requiresVerification: true,
        reliabilityNotes: ((event.reliabilityNotes || '') +
          ' [AUTO] Evento critico: testo sorgente non trovato nel documento — possibile imprecisione, richiede revisione.').trim(),
      };
    }

    return event;
  });
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
