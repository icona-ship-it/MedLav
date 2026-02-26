import { getMistralClient, MISTRAL_MODELS, withMistralRetry } from '@/lib/mistral/client';
import type { ExtractedEvent, ExtractionResponse } from './extraction-schemas';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './extraction-prompts';
import { annotateTablesInText } from './table-detector';
import type { CaseType } from '@/types';

// Mistral Large has 128k context; leave room for system prompt + response
const MAX_CHUNK_CHARS = 80_000;

export interface ExtractionParams {
  documentText: string;
  fileName: string;
  documentType: string;
  caseType: CaseType;
  temperature?: number;
}

interface PageBlock {
  pageNumber: number;
  text: string;
}

/**
 * Extract clinical events from a document's OCR text.
 * Uses Mistral Large with json_schema for fast + reliable structured output.
 */
export async function extractEventsFromDocument(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText } = params;

  // Pre-process: annotate tables before chunking
  const { annotatedText, tableCount } = annotateTablesInText(documentText);
  if (tableCount > 0) {
    console.log(`[extraction] Annotated ${tableCount} tables in document`);
  }

  const processedParams = { ...params, documentText: annotatedText };

  if (annotatedText.length <= MAX_CHUNK_CHARS) {
    return extractFromSingleChunk(processedParams);
  }

  return extractFromChunks(processedParams);
}

/**
 * Extract events from a single text chunk using Mistral Large + json_schema.
 */
async function extractFromSingleChunk(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName, documentType, caseType, temperature = 0.1 } = params;
  const client = getMistralClient();

  const startMs = Date.now();
  console.log(`[extraction] Starting Mistral Large call for "${fileName}" (${documentText.length} chars)`);

  const response = await withMistralRetry(
    () => client.chat.complete({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        {
          role: 'system',
          content: buildExtractionSystemPrompt(caseType),
        },
        {
          role: 'user',
          content: buildExtractionUserPrompt({ documentText, fileName, documentType }),
        },
      ],
      responseFormat: { type: 'json_object' },
      temperature,
      maxTokens: 16384,
    }),
    'extraction',
  );

  const elapsedMs = Date.now() - startMs;
  const content = extractResponseContent(response);
  console.log(`[extraction] Mistral Large responded in ${elapsedMs}ms (${content.length} chars response)`);

  return parseExtractionResponse(content);
}

/**
 * Extract events from a long document by splitting into overlapping chunks.
 */
async function extractFromChunks(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName, documentType, caseType } = params;
  const chunks = splitTextIntoChunks(documentText, MAX_CHUNK_CHARS);

  const allEvents: ExtractionResponse['events'] = [];
  const allAbbreviations: Array<{ abbreviation: string; expansion: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = `${fileName} [parte ${i + 1}/${chunks.length}]`;
    const result = await extractFromSingleChunk({
      documentText: chunks[i],
      fileName: chunkLabel,
      documentType,
      caseType,
    });

    allEvents.push(...result.events);
    if (result.abbreviations) {
      allAbbreviations.push(...result.abbreviations);
    }
  }

  const uniqueAbbreviations = deduplicateAbbreviations(allAbbreviations);

  return {
    events: allEvents,
    abbreviations: uniqueAbbreviations,
  };
}

/**
 * Smart chunking: split on page boundaries when page markers are present.
 */
function splitTextIntoChunks(
  text: string,
  maxChunkSize: number,
): string[] {
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

function splitPageBlocksIntoChunks(
  blocks: PageBlock[],
  maxChunkSize: number,
): string[] {
  const chunks: string[] = [];
  let currentPages: string[] = [];
  let currentSize = 0;
  let lastPageOfPrevChunk: string | null = null;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.text.length > maxChunkSize) {
      if (currentPages.length > 0) {
        chunks.push(currentPages.join('\n'));
        lastPageOfPrevChunk = currentPages[currentPages.length - 1];
        currentPages = [];
        currentSize = 0;
      }

      const subChunks = splitByCharacterBoundaries(block.text, maxChunkSize);
      chunks.push(...subChunks);
      lastPageOfPrevChunk = null;
      continue;
    }

    if (currentSize + block.text.length > maxChunkSize && currentPages.length > 0) {
      chunks.push(currentPages.join('\n'));
      lastPageOfPrevChunk = currentPages[currentPages.length - 1];

      currentPages = lastPageOfPrevChunk ? [lastPageOfPrevChunk] : [];
      currentSize = lastPageOfPrevChunk ? lastPageOfPrevChunk.length : 0;
    }

    currentPages.push(block.text);
    currentSize += block.text.length;
  }

  if (currentPages.length > 0) {
    chunks.push(currentPages.join('\n'));
  }

  return chunks;
}

function splitByCharacterBoundaries(
  text: string,
  maxChunkSize: number,
): string[] {
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

function extractResponseContent(response: unknown): string {
  const res = response as {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
  };
  return res.choices?.[0]?.message?.content ?? '{}';
}

/**
 * Parse the extraction response JSON with maximum resilience.
 * Handles any key name, validates each event individually.
 */
function parseExtractionResponse(content: string): ExtractionResponse {
  // Step 1: Parse JSON
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch (jsonErr) {
    console.error(`[extraction] JSON parse failed: ${jsonErr instanceof Error ? jsonErr.message : 'unknown'}`);
    console.error(`[extraction] Raw content (first 500 chars): ${content.slice(0, 500)}`);
    return { events: [] };
  }

  // Step 2: Find the events array — try multiple key names
  let rawEvents: unknown[] | null = null;
  const keysToTry = ['events', 'Events', 'eventi', 'EVENTS', 'event_list'];
  for (const key of keysToTry) {
    if (Array.isArray(raw[key])) {
      rawEvents = raw[key] as unknown[];
      console.log(`[extraction] Found ${rawEvents.length} events under key "${key}"`);
      break;
    }
  }

  // If no known key, search all top-level keys for an array of objects
  if (!rawEvents) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        const first = value[0] as Record<string, unknown>;
        if ('eventDate' in first || 'title' in first || 'description' in first) {
          rawEvents = value as unknown[];
          console.log(`[extraction] Found ${rawEvents.length} events under unexpected key "${key}"`);
          break;
        }
      }
    }
  }

  if (!rawEvents || rawEvents.length === 0) {
    console.error(`[extraction] No events array found in response. Keys: ${Object.keys(raw).join(', ')}`);
    console.error(`[extraction] Response preview: ${content.slice(0, 500)}`);
    return { events: [] };
  }

  // Step 3: Parse each event individually — safe cast with defaults
  const validEvents: ExtractedEvent[] = [];
  for (let i = 0; i < rawEvents.length; i++) {
    const rawEvent = rawEvents[i] as Record<string, unknown>;
    if (!rawEvent || typeof rawEvent !== 'object') continue;

    // Must have at least a title or description to be valid
    if (!('title' in rawEvent) && !('description' in rawEvent)) continue;

    const event: ExtractedEvent = {
      eventDate: String(rawEvent.eventDate ?? rawEvent.event_date ?? '1900-01-01'),
      datePrecision: String(rawEvent.datePrecision ?? rawEvent.date_precision ?? 'sconosciuta'),
      eventType: String(rawEvent.eventType ?? rawEvent.event_type ?? 'altro'),
      title: String(rawEvent.title ?? 'Evento clinico'),
      description: String(rawEvent.description ?? ''),
      sourceType: String(rawEvent.sourceType ?? rawEvent.source_type ?? 'altro'),
      diagnosis: rawEvent.diagnosis != null ? String(rawEvent.diagnosis) : null,
      doctor: rawEvent.doctor != null ? String(rawEvent.doctor) : null,
      facility: rawEvent.facility != null ? String(rawEvent.facility) : null,
      confidence: typeof rawEvent.confidence === 'number' ? Math.min(100, Math.max(0, rawEvent.confidence)) : 70,
      requiresVerification: Boolean(rawEvent.requiresVerification ?? rawEvent.requires_verification ?? false),
      reliabilityNotes: rawEvent.reliabilityNotes != null ? String(rawEvent.reliabilityNotes) : null,
      sourceText: String(rawEvent.sourceText ?? rawEvent.source_text ?? ''),
      sourcePages: Array.isArray(rawEvent.sourcePages ?? rawEvent.source_pages)
        ? ((rawEvent.sourcePages ?? rawEvent.source_pages) as number[])
        : [1],
    };

    validEvents.push(event);
  }

  // Extract abbreviations
  const abbreviations = raw.abbreviations as Array<{ abbreviation: string; expansion: string }> | undefined;

  console.log(`[extraction] Final result: ${validEvents.length}/${rawEvents.length} events valid`);
  return { events: validEvents, abbreviations };
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
