import { getMistralClient, MISTRAL_MODELS } from '@/lib/mistral/client';
import { extractionResponseSchema, extractionJsonSchema } from './extraction-schemas';
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
 * Pre-processes with table annotation, then handles long documents
 * by chunking on page boundaries with overlap.
 */
export async function extractEventsFromDocument(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName } = params;

  // Pre-process: annotate tables before chunking
  const { annotatedText, tableCount } = annotateTablesInText(documentText);
  if (tableCount > 0) {
    console.log(`[extraction] Annotated ${tableCount} tables in ${fileName}`);
  }

  const processedParams = { ...params, documentText: annotatedText };

  if (annotatedText.length <= MAX_CHUNK_CHARS) {
    return extractFromSingleChunk(processedParams);
  }

  return extractFromChunks(processedParams);
}

/**
 * Extract events from a single text chunk.
 */
async function extractFromSingleChunk(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName, documentType, caseType, temperature = 0.1 } = params;
  const client = getMistralClient();

  const response = await client.chat.complete({
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
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'extraction_response',
        schemaDefinition: extractionJsonSchema,
      },
    },
    temperature,
  });

  const content = extractResponseContent(response);
  return parseExtractionResponse(content);
}

/**
 * Extract events from a long document by splitting into overlapping chunks.
 * Merges results from all chunks.
 */
async function extractFromChunks(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName, documentType, caseType } = params;
  const chunks = splitTextIntoChunks(documentText, MAX_CHUNK_CHARS);

  const allEvents: ExtractedEvent[] = [];
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

  // Deduplicate abbreviations
  const uniqueAbbreviations = deduplicateAbbreviations(allAbbreviations);

  return {
    events: allEvents,
    abbreviations: uniqueAbbreviations,
  };
}

/**
 * Smart chunking: split on page boundaries when page markers are present.
 * Falls back to character-based chunking if no markers found.
 * Overlap = repeat last page of previous chunk at start of next chunk.
 */
function splitTextIntoChunks(
  text: string,
  maxChunkSize: number,
): string[] {
  const pageBlocks = extractPageBlocks(text);

  if (pageBlocks.length === 0) {
    // No page markers — fallback to character-based chunking
    return splitByCharacterBoundaries(text, maxChunkSize);
  }

  return splitPageBlocksIntoChunks(pageBlocks, maxChunkSize);
}

/**
 * Extract text blocks per page using [PAGE_START:N] / [PAGE_END:N] markers.
 */
function extractPageBlocks(text: string): PageBlock[] {
  const blocks: PageBlock[] = [];
  const regex = /\[PAGE_START:(\d+)\]([\s\S]*?)\[PAGE_END:\d+\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      pageNumber: parseInt(match[1], 10),
      text: match[0], // Keep markers so LLM can see page numbers
    });
  }

  return blocks;
}

/**
 * Accumulate page blocks into chunks up to maxChunkSize.
 * Overlap = repeat the last page of the previous chunk at start of next.
 */
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

    // Single page exceeds max — split it with character chunking
    if (block.text.length > maxChunkSize) {
      // Flush current chunk first
      if (currentPages.length > 0) {
        chunks.push(currentPages.join('\n'));
        lastPageOfPrevChunk = currentPages[currentPages.length - 1];
        currentPages = [];
        currentSize = 0;
      }

      const subChunks = splitByCharacterBoundaries(block.text, maxChunkSize);
      chunks.push(...subChunks);
      lastPageOfPrevChunk = null; // Can't cleanly overlap a split page
      continue;
    }

    // Would adding this page exceed the limit?
    if (currentSize + block.text.length > maxChunkSize && currentPages.length > 0) {
      // Flush current chunk
      chunks.push(currentPages.join('\n'));
      lastPageOfPrevChunk = currentPages[currentPages.length - 1];

      // Start new chunk with overlap (last page of previous chunk)
      currentPages = lastPageOfPrevChunk ? [lastPageOfPrevChunk] : [];
      currentSize = lastPageOfPrevChunk ? lastPageOfPrevChunk.length : 0;
    }

    currentPages.push(block.text);
    currentSize += block.text.length;
  }

  // Flush remaining
  if (currentPages.length > 0) {
    chunks.push(currentPages.join('\n'));
  }

  return chunks;
}

/**
 * Fallback: split text into overlapping chunks at natural boundaries.
 */
function splitByCharacterBoundaries(
  text: string,
  maxChunkSize: number,
): string[] {
  const overlapSize = 2_000;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    // Try to break at a natural boundary (double newline, section separator)
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

    // Next chunk starts with overlap from the end of current
    start = Math.max(end - overlapSize, start + 1);

    // Avoid infinite loop for very small remaining text
    if (end >= text.length) break;
  }

  return chunks;
}

/**
 * Extract text content from Mistral response.
 */
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
 * Falls back to empty result on parse errors.
 */
function parseExtractionResponse(content: string): ExtractionResponse {
  try {
    const parsed = JSON.parse(content) as unknown;
    const validated = extractionResponseSchema.parse(parsed);
    return validated;
  } catch {
    console.error('[extraction] Failed to parse Mistral response, returning empty events');
    return { events: [] };
  }
}

/**
 * Remove duplicate abbreviations, keeping the first occurrence.
 */
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
