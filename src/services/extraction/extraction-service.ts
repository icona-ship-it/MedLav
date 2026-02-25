import { getMistralClient, MISTRAL_MODELS, withMistralRetry } from '@/lib/mistral/client';
import { extractionResponseSchema, extractionJsonSchema } from './extraction-schemas';
import type { ExtractionResponse } from './extraction-schemas';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './extraction-prompts';
import { annotateTablesInText } from './table-detector';
import type { CaseType } from '@/types';

// Mistral Small has 128k context; leave room for system prompt + response
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
 * Uses Mistral Small with json_schema for fast + reliable structured output.
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
 * Extract events from a single text chunk using Mistral Small + json_schema.
 */
async function extractFromSingleChunk(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName, documentType, caseType, temperature = 0.1 } = params;
  const client = getMistralClient();

  const startMs = Date.now();
  console.log(`[extraction] Starting Mistral Small call for "${fileName}" (${documentText.length} chars)`);

  const response = await withMistralRetry(
    () => client.chat.complete({
      model: MISTRAL_MODELS.MISTRAL_SMALL,
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
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'extraction_response',
          schemaDefinition: extractionJsonSchema,
        },
      },
      temperature,
      maxTokens: 16384,
    }),
    'extraction',
  );

  const elapsedMs = Date.now() - startMs;
  const content = extractResponseContent(response);
  console.log(`[extraction] Mistral Small responded in ${elapsedMs}ms (${content.length} chars response)`);

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
 * Parse and validate the extraction response JSON.
 * With json_schema mode, structure is guaranteed. Zod is a safety net.
 */
function parseExtractionResponse(content: string): ExtractionResponse {
  try {
    const parsed = JSON.parse(content) as unknown;
    const validated = extractionResponseSchema.parse(parsed);
    console.log(`[extraction] Parsed ${validated.events.length} events`);
    return validated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[extraction] Zod validation failed: ${message}`);
    console.error(`[extraction] Raw response (first 1000 chars): ${content.slice(0, 1000)}`);

    // Fallback: try raw JSON parse without Zod
    try {
      const raw = JSON.parse(content) as { events?: unknown[] };
      if (Array.isArray(raw.events)) {
        console.log(`[extraction] Fallback: found ${raw.events.length} raw events, returning without Zod validation`);
        return { events: raw.events as ExtractionResponse['events'] };
      }
    } catch { /* ignore */ }

    return { events: [] };
  }
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
