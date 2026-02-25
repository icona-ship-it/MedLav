import { getMistralClient, MISTRAL_MODELS } from '@/lib/mistral/client';
import { extractionResponseSchema, extractionJsonSchema } from './extraction-schemas';
import type { ExtractedEvent, ExtractionResponse } from './extraction-schemas';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './extraction-prompts';
import type { CaseType } from '@/types';

// Mistral Large has 128k context; leave room for system prompt + response
const MAX_CHUNK_CHARS = 80_000;
const CHUNK_OVERLAP_CHARS = 2_000;

interface ExtractionParams {
  documentText: string;
  fileName: string;
  documentType: string;
  caseType: CaseType;
}

/**
 * Extract clinical events from a document's OCR text.
 * Handles long documents by chunking with overlap.
 */
export async function extractEventsFromDocument(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName, documentType, caseType } = params;

  if (documentText.length <= MAX_CHUNK_CHARS) {
    return extractFromSingleChunk({ documentText, fileName, documentType, caseType });
  }

  return extractFromChunks({ documentText, fileName, documentType, caseType });
}

/**
 * Extract events from a single text chunk.
 */
async function extractFromSingleChunk(
  params: ExtractionParams,
): Promise<ExtractionResponse> {
  const { documentText, fileName, documentType, caseType } = params;
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
    temperature: 0.1,
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
  const chunks = splitTextIntoChunks(documentText, MAX_CHUNK_CHARS, CHUNK_OVERLAP_CHARS);

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
 * Split text into overlapping chunks at natural boundaries (paragraphs, sections).
 */
function splitTextIntoChunks(
  text: string,
  maxChunkSize: number,
  overlapSize: number,
): string[] {
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
