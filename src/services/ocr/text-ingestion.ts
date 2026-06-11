import type { OcrDocumentResult } from './ocr-types';

/**
 * Text-based document ingestion (XML, TXT) — no OCR call needed: the file IS
 * text. Built after a real-world challenge (2026-06-11): clinical documents in
 * XML DO exist in Italy (HL7/CDA referti from the Fascicolo Sanitario
 * Elettronico), and an app handling medico-legal evidence must never silently
 * drop a document. The XML is SANITIZED (tags stripped, attribute values kept,
 * embedded base64 signatures/payloads removed) so the extraction pipeline sees
 * real content, not markup soup.
 */

const TEXT_INGEST_MIME_TYPES = new Set(['text/xml', 'application/xml', 'text/plain']);
const TEXT_INGEST_EXTENSIONS = new Set(['xml', 'txt']);

/** Chars per synthetic "page" — aligned with typical dense OCR page volume so
 * downstream chunking/extraction behaves like it does for scanned documents. */
export const TEXT_PAGE_CHARS = 4000;

export function fileExtensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** True when the document should take the direct-text path instead of OCR. */
export function isTextIngestType(fileType: string, fileName: string): boolean {
  return TEXT_INGEST_MIME_TYPES.has(fileType) || TEXT_INGEST_EXTENSIONS.has(fileExtensionOf(fileName));
}

/** MIME fallback when the browser reports an empty type for a text file. */
export function textMimeFromExtension(fileName: string): string | null {
  const ext = fileExtensionOf(fileName);
  if (ext === 'xml') return 'text/xml';
  if (ext === 'txt') return 'text/plain';
  return null;
}

const BINARY_OMITTED_MARKER = '[contenuto binario omesso]';

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

/**
 * Extract readable content from an XML document:
 * - keeps text nodes AND attribute values (DatiAtto puts case data in attributes)
 * - keeps CDATA content
 * - removes tags, comments, processing instructions
 * - removes long base64 runs (embedded signatures, PEC payloads) — both
 *   contiguous and line-wrapped — replacing each with an explicit marker
 * - decodes common XML entities
 * Never throws: malformed input degrades to best-effort tag stripping.
 */
export function extractTextFromXml(xml: string): string {
  let s = xml;

  // Comments and processing instructions (incl. the <?xml ...?> declaration)
  s = s.replace(/<!--[\s\S]*?-->/g, '\n');
  s = s.replace(/<\?[\s\S]*?\?>/g, '\n');

  // Unwrap CDATA, keeping its content
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

  // Base64/binary runs: line-wrapped blocks (PEM/PEC style) — matched as
  // consecutive base64-only segments so a block starting mid-line (right
  // after a tag) is caught too…
  s = s.replace(/[A-Za-z0-9+/=]{40,}(?:\r?\n[A-Za-z0-9+/=]{40,}){2,}/g, BINARY_OMITTED_MARKER);
  // …and long contiguous runs inside attributes or text nodes (signatures,
  // hashes). 200+ alphanumerics without a space never occur in prose.
  s = s.replace(/[A-Za-z0-9+/]{200,}={0,2}/g, BINARY_OMITTED_MARKER);

  // Opening tags: keep attribute VALUES (case data often lives there), drop names
  s = s.replace(/<([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*\/?\s*>/g, (_m, _tag: string, attrs: string) => {
    const values = Array.from(attrs.matchAll(/=\s*"([^"]*)"/g))
      .map((x) => x[1].trim())
      .filter((v) => v.length > 0);
    return values.length > 0 ? `\n${values.join(' ')}\n` : '\n';
  });

  // Any remaining tags (closing tags, malformed leftovers)
  s = s.replace(/<[^>]*>/g, '\n');

  s = decodeXmlEntities(s);

  // Collapse whitespace noise, drop empty lines
  return s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Split plain text into page-sized blocks at line boundaries (never mid-line
 * unless a single line exceeds the page size). */
export function paginatePlainText(text: string, charsPerPage: number = TEXT_PAGE_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= charsPerPage) return [trimmed];

  const pages: string[] = [];
  let current = '';
  for (const line of trimmed.split('\n')) {
    if (line.length > charsPerPage) {
      // Pathological single line: hard-split
      if (current.length > 0) {
        pages.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += charsPerPage) {
        pages.push(line.slice(i, i + charsPerPage));
      }
      continue;
    }
    if (current.length + line.length + 1 > charsPerPage && current.length > 0) {
      pages.push(current);
      current = line;
    } else {
      current = current.length > 0 ? `${current}\n${line}` : line;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

/**
 * Build an OcrDocumentResult from raw text content — same shape the OCR
 * service returns, so the rest of the pipeline (page upsert, chunking,
 * extraction, classification) is untouched. ocrPages = 0: no OCR API cost.
 */
export function buildTextIngestResult(params: {
  documentId: string;
  fileName: string;
  fileType: string;
  rawText: string;
}): OcrDocumentResult {
  const isXml = params.fileType.includes('xml') || fileExtensionOf(params.fileName) === 'xml';
  const content = isXml ? extractTextFromXml(params.rawText) : params.rawText.trim();
  const pageTexts = paginatePlainText(content);

  return {
    documentId: params.documentId,
    fileName: params.fileName,
    pageCount: pageTexts.length,
    pages: pageTexts.map((text, i) => ({
      pageNumber: i + 1,
      text,
      confidence: 100, // native text — no recognition uncertainty
      hasHandwriting: null,
      handwritingConfidence: null,
      images: [],
    })),
    averageConfidence: pageTexts.length > 0 ? 100 : 0,
    fullText: '',
    images: [],
    ocrPages: 0,
  };
}
