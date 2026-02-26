import { getMistralClient, MISTRAL_MODELS, withMistralRetry } from '@/lib/mistral/client';
import type { ExtractedEvent, ExtractionResponse } from './extraction-schemas';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './extraction-prompts';
import { annotateTablesInText } from './table-detector';
import type { CaseType } from '@/types';

// Small chunks = fast per-chunk extraction (~30-60s each at 56 t/s)
const MAX_CHUNK_CHARS = 20_000;

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
    console.log(`[extraction] Annotated ${tableCount} tables in document`);
  }

  const processedParams = { ...params, documentText: annotatedText };

  if (annotatedText.length <= MAX_CHUNK_CHARS) {
    return { chunks: [annotatedText], params: processedParams };
  }

  const chunks = splitTextIntoChunks(annotatedText, MAX_CHUNK_CHARS);
  console.log(`[extraction] Split ${annotatedText.length} chars into ${chunks.length} chunks`);
  return { chunks, params: processedParams };
}

/**
 * Extract events from a single text chunk. Designed to be called
 * as a separate Inngest step for parallelism on large documents.
 */
export async function extractEventsFromChunk(params: {
  chunkText: string;
  chunkLabel: string;
  documentType: string;
  caseType: CaseType;
  temperature?: number;
}): Promise<ExtractionResponse> {
  const { chunkText, chunkLabel, documentType, caseType, temperature = 0.1 } = params;
  const client = getMistralClient();

  const startMs = Date.now();
  console.log(`[extraction] Starting Mistral Large for "${chunkLabel}" (${chunkText.length} chars)`);

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
          content: buildExtractionUserPrompt({ documentText: chunkText, fileName: chunkLabel, documentType }),
        },
      ],
      responseFormat: { type: 'json_object' },
      temperature,
      maxTokens: 8192,
    }),
    'extraction',
  );

  const elapsedMs = Date.now() - startMs;
  const content = extractResponseContent(response);
  console.log(`[extraction] Mistral Large responded in ${elapsedMs}ms (${content.length} chars)`);

  return parseExtractionResponse(content);
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
    });

    allEvents.push(...result.events);
    if (result.abbreviations) {
      allAbbreviations.push(...result.abbreviations);
    }
  }

  return {
    events: allEvents,
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

function extractResponseContent(response: unknown): string {
  const res = response as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return res.choices?.[0]?.message?.content ?? '{}';
}

/**
 * Parse extraction response with maximum resilience.
 */
function parseExtractionResponse(content: string): ExtractionResponse {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch (jsonErr) {
    console.error(`[extraction] JSON parse failed: ${jsonErr instanceof Error ? jsonErr.message : 'unknown'}`);
    console.error(`[extraction] Raw content (first 500 chars): ${content.slice(0, 500)}`);
    return { events: [] };
  }

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
          console.log(`[extraction] Found events under key "${key}"`);
          break;
        }
      }
    }
  }

  if (!rawEvents || rawEvents.length === 0) {
    console.error(`[extraction] No events found. Keys: ${Object.keys(raw).join(', ')}`);
    console.error(`[extraction] Preview: ${content.slice(0, 500)}`);
    return { events: [] };
  }

  // Parse each event with safe defaults
  const validEvents: ExtractedEvent[] = [];
  for (const rawEvent of rawEvents) {
    const e = rawEvent as Record<string, unknown>;
    if (!e || typeof e !== 'object') continue;
    if (!('title' in e) && !('description' in e)) continue;

    validEvents.push({
      eventDate: String(e.eventDate ?? e.event_date ?? '1900-01-01'),
      datePrecision: String(e.datePrecision ?? e.date_precision ?? 'sconosciuta'),
      eventType: String(e.eventType ?? e.event_type ?? 'altro'),
      title: String(e.title ?? 'Evento clinico'),
      description: String(e.description ?? ''),
      sourceType: String(e.sourceType ?? e.source_type ?? 'altro'),
      diagnosis: e.diagnosis != null ? String(e.diagnosis) : null,
      doctor: e.doctor != null ? String(e.doctor) : null,
      facility: e.facility != null ? String(e.facility) : null,
      confidence: typeof e.confidence === 'number' ? Math.min(100, Math.max(0, e.confidence)) : 70,
      requiresVerification: Boolean(e.requiresVerification ?? e.requires_verification ?? false),
      reliabilityNotes: e.reliabilityNotes != null ? String(e.reliabilityNotes) : null,
      sourceText: String(e.sourceText ?? e.source_text ?? ''),
      sourcePages: Array.isArray(e.sourcePages ?? e.source_pages) ? ((e.sourcePages ?? e.source_pages) as number[]) : [1],
    });
  }

  const abbreviations = raw.abbreviations as Array<{ abbreviation: string; expansion: string }> | undefined;
  console.log(`[extraction] Parsed ${validEvents.length}/${rawEvents.length} events`);
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
