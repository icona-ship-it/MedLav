import { getMistralClient, MISTRAL_MODELS, withMistralRetry, TIMEOUT_OCR } from '@/lib/mistral/client';
import type { OcrPageResult, OcrDocumentResult, OcrImageResult } from './ocr-types';
import { logger } from '@/lib/logger';

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
const SUPPORTED_PDF_TYPES = ['application/pdf'];
const SUPPORTED_DOCX_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

function isSupportedForOcr(mimeType: string): boolean {
  return [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_PDF_TYPES, ...SUPPORTED_DOCX_TYPES].includes(mimeType);
}

function isImageType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}

function isDocxType(mimeType: string): boolean {
  return SUPPORTED_DOCX_TYPES.includes(mimeType);
}

/**
 * Process a document through Mistral OCR.
 * Supports PDF, DOCX, and image files — all use the dedicated OCR API.
 * For unsupported types (XLS, etc.), returns empty result with error note.
 */
export async function ocrDocument(params: {
  documentId: string;
  fileName: string;
  fileType: string;
  signedUrl: string;
}): Promise<OcrDocumentResult> {
  const { documentId, fileName, fileType, signedUrl } = params;

  if (!isSupportedForOcr(fileType)) {
    return {
      documentId,
      fileName,
      pageCount: 0,
      pages: [],
      averageConfidence: 0,
      fullText: `[Formato non supportato per OCR diretto: ${fileType}. Convertire il file in PDF per l'elaborazione.]`,
      images: [],
    };
  }

  if (isImageType(fileType)) {
    return ocrImage({ documentId, fileName, signedUrl });
  }

  if (isDocxType(fileType)) {
    return ocrDocx({ documentId, fileName, signedUrl });
  }

  return ocrPdf({ documentId, fileName, signedUrl });
}

// ── OCR response types (extended for OCR 3) ──

interface OcrRawPage {
  markdown?: string;
  images?: Array<{ id?: string; imageBase64?: string }>;
  /**
   * Mistral OCR 3 may return tables as either an array of HTML strings (older
   * SDK shape) or an array of objects like `{html: string, csv?: string, ...}`
   * (newer shape). We accept both at runtime — see `coerceTableToHtml()` below.
   */
  tables?: Array<string | Record<string, unknown>>;
  header?: string;
  footer?: string;
}

/**
 * Convert a single table entry from the Mistral OCR API to an HTML string.
 * Defensive against shape changes — accepts both `string` and `{html, ...}`
 * variants. Returns empty string for unrecognized shapes (with a log warning
 * so we notice if the API contract changes).
 *
 * Trigger: Schönweger case (CASO-2026-160) — patient lab values were lost
 * because Mistral OCR returned table objects, the old code did `${table}`
 * inside a template literal, producing the literal text `[object Object]`
 * which then polluted the cronistoria with 50+ "Tabelle non interpretabili".
 */
function coerceTableToHtml(table: string | Record<string, unknown>, pageNumber: number): string {
  if (typeof table === 'string') return table;
  if (table && typeof table === 'object') {
    // Common Mistral OCR 3 shapes — try in priority order
    const candidates = ['html', 'content', 'markdown', 'text', 'value'] as const;
    for (const key of candidates) {
      const v = table[key];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    logger.warn('ocr', `Unknown table shape on page ${pageNumber}: keys=${Object.keys(table).join(',')}`);
  }
  return '';
}

interface OcrRawResponse {
  pages?: OcrRawPage[];
  usageInfo?: { pagesProcessed?: number };
}

/**
 * Map a Mistral OCR API response to OcrDocumentResult.
 * Handles OCR 3 features: HTML tables, headers, footers.
 */
function mapOcrResponseToResult(params: {
  documentId: string;
  fileName: string;
  response: OcrRawResponse;
}): OcrDocumentResult {
  const { documentId, fileName, response } = params;
  const allImages: OcrImageResult[] = [];

  // Pre-process pages to include header/footer info for filtering
  const rawPages = (response.pages ?? []).map((page, index) => ({
    ...page,
    pageNumber: index + 1,
    headerText: (page.header ?? '').trim(),
    footerText: (page.footer ?? '').trim(),
  }));

  // Capture document-level header/footer (most common, ≥50% repetition) BEFORE
  // filtering wipes repetitive ones. These typically identify the document itself
  // ("Cartella Clinica n. XYZ, Ospedale ABC") and improve synthesis citation accuracy.
  const documentHeader = findMostCommonNonEmpty(rawPages.map((p) => p.headerText));
  const documentFooter = findMostCommonNonEmpty(rawPages.map((p) => p.footerText));

  // Filter repetitive headers/footers from individual pages (keeps unique page-level info only)
  filterRepetitiveHeadersFooters(rawPages);

  const pages: OcrPageResult[] = rawPages.map((page) => {
    let text = page.markdown ?? '';

    // Coerce tables to HTML strings (defensive against Mistral API shape changes).
    // Filters out empty strings (pages with no tables, or unknown shapes).
    const htmlTables: string[] | undefined = page.tables && page.tables.length > 0
      ? page.tables
          .map((t) => coerceTableToHtml(t, page.pageNumber))
          .filter((s) => s.length > 0)
      : undefined;

    // If there are HTML tables from OCR 3, insert them with markers
    if (htmlTables && htmlTables.length > 0) {
      for (const tableHtml of htmlTables) {
        text += `\n[TABLE_HTML_START]\n${tableHtml}\n[TABLE_HTML_END]\n`;
      }
    }

    // Append non-repetitive header/footer as context
    if (page.headerText.length > 0) {
      logger.debug('ocr', ` Page ${page.pageNumber}: header detected (${page.headerText.length} chars)`);
    }

    const handwritingInfo = detectHandwriting(text);
    const pageNumber = page.pageNumber;

    // Extract images from page
    const pageImages: OcrImageResult[] = [];
    if (page.images && Array.isArray(page.images)) {
      page.images.forEach((img, figIdx) => {
        if (img.imageBase64) {
          const imageResult: OcrImageResult = {
            imageId: img.id ?? `page-${pageNumber}-fig-${figIdx}`,
            imageBase64: img.imageBase64,
            pageNumber,
            figureIndex: figIdx,
          };
          pageImages.push(imageResult);
          allImages.push(imageResult);
        }
      });
    }

    return {
      pageNumber,
      text,
      confidence: estimateConfidence(text),
      hasHandwriting: handwritingInfo.hasHandwriting,
      handwritingConfidence: handwritingInfo.confidence,
      images: pageImages,
      header: page.headerText || undefined,
      footer: page.footerText || undefined,
      htmlTables,
    };
  });

  // Full text with page markers for source anchoring
  const fullText = pages.map((p) =>
    `[PAGE_START:${p.pageNumber}]\n${p.text}\n[PAGE_END:${p.pageNumber}]`,
  ).join('\n\n');

  const averageConfidence = pages.length > 0
    ? pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length
    : 0;

  const ocrPages = response.usageInfo?.pagesProcessed ?? pages.length;

  return {
    documentId,
    fileName,
    pageCount: pages.length,
    pages,
    averageConfidence: Math.round(averageConfidence),
    fullText,
    images: allImages,
    ocrPages,
    documentHeader,
    documentFooter,
  };
}

/**
 * Find the most common non-empty value across pages, used to identify
 * document-level header/footer (typically the cartella identifier or page numbering).
 * Returns undefined if no value occurs in >=50% of pages.
 */
function findMostCommonNonEmpty(values: string[]): string | undefined {
  if (values.length < 2) return undefined;
  const threshold = Math.max(2, Math.ceil(values.length * 0.5));

  const counts = new Map<string, number>();
  for (const v of values) {
    const trimmed = v.trim();
    if (trimmed.length < 5) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  let bestValue: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count >= threshold && count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue;
}

/**
 * Filter repetitive headers/footers that appear in >50% of pages.
 * Mutates the array in place by clearing repetitive header/footer text.
 */
function filterRepetitiveHeadersFooters(
  pages: Array<{ headerText: string; footerText: string }>,
): void {
  if (pages.length < 3) return;

  const threshold = pages.length * 0.5;

  // Count header occurrences
  const headerCounts = new Map<string, number>();
  for (const page of pages) {
    const h = page.headerText.toLowerCase();
    if (h.length > 5) {
      headerCounts.set(h, (headerCounts.get(h) ?? 0) + 1);
    }
  }

  // Remove headers appearing in >50% of pages
  for (const [header, count] of headerCounts) {
    if (count >= threshold) {
      logger.debug('ocr', ` Filtering repetitive header (${count}/${pages.length} pages): "${header.slice(0, 50)}..."`);
      for (const page of pages) {
        if (page.headerText.toLowerCase() === header) {
          page.headerText = '';
        }
      }
    }
  }

  // Same logic for footers
  const footerCounts = new Map<string, number>();
  for (const page of pages) {
    const f = page.footerText.toLowerCase();
    if (f.length > 5) {
      footerCounts.set(f, (footerCounts.get(f) ?? 0) + 1);
    }
  }

  for (const [footer, count] of footerCounts) {
    if (count >= threshold) {
      logger.debug('ocr', ` Filtering repetitive footer (${count}/${pages.length} pages): "${footer.slice(0, 50)}..."`);
      for (const page of pages) {
        if (page.footerText.toLowerCase() === footer) {
          page.footerText = '';
        }
      }
    }
  }
}

/**
 * OCR a PDF document using Mistral OCR API.
 */
async function ocrPdf(params: {
  documentId: string;
  fileName: string;
  signedUrl: string;
}): Promise<OcrDocumentResult> {
  const { documentId, fileName, signedUrl } = params;
  const client = getMistralClient(TIMEOUT_OCR);

  const response = await withMistralRetry(
    () => client.ocr.process({
      model: MISTRAL_MODELS.OCR,
      document: {
        type: 'document_url',
        documentUrl: signedUrl,
      },
      includeImageBase64: true,
      // OCR 3 features (cast for SDK compatibility)
      ...({ tableFormat: 'html', extractHeader: true, extractFooter: true } as Record<string, unknown>),
    }),
    'ocr-pdf',
  );

  return mapOcrResponseToResult({
    documentId,
    fileName,
    response: response as unknown as OcrRawResponse,
  });
}

/**
 * OCR a single image using Mistral OCR API (dedicated model, not Pixtral chat).
 * Returns a single-page result.
 */
async function ocrImage(params: {
  documentId: string;
  fileName: string;
  signedUrl: string;
}): Promise<OcrDocumentResult> {
  const { documentId, fileName, signedUrl } = params;
  const client = getMistralClient(TIMEOUT_OCR);

  const response = await withMistralRetry(
    () => client.ocr.process({
      model: MISTRAL_MODELS.OCR,
      document: {
        type: 'image_url',
        imageUrl: signedUrl,
      },
      includeImageBase64: true,
      ...({ tableFormat: 'html', extractHeader: true, extractFooter: true } as Record<string, unknown>),
    }),
    'ocr-image',
  );

  return mapOcrResponseToResult({
    documentId,
    fileName,
    response: response as unknown as OcrRawResponse,
  });
}

/**
 * OCR a DOCX document using Mistral OCR API.
 */
async function ocrDocx(params: {
  documentId: string;
  fileName: string;
  signedUrl: string;
}): Promise<OcrDocumentResult> {
  const { documentId, fileName, signedUrl } = params;
  const client = getMistralClient(TIMEOUT_OCR);

  const response = await withMistralRetry(
    () => client.ocr.process({
      model: MISTRAL_MODELS.OCR,
      document: {
        type: 'document_url',
        documentUrl: signedUrl,
      },
      includeImageBase64: true,
      ...({ tableFormat: 'html', extractHeader: true, extractFooter: true } as Record<string, unknown>),
    }),
    'ocr-docx',
  );

  return mapOcrResponseToResult({
    documentId,
    fileName,
    response: response as unknown as OcrRawResponse,
  });
}

/**
 * Detect handwriting markers in OCR text.
 * Looks for [MANOSCRITTO] tags inserted by the vision model.
 */
function detectHandwriting(text: string): {
  hasHandwriting: 'yes' | 'partial' | null;
  confidence: number | null;
} {
  const handwrittenSections = (text.match(/\[MANOSCRITTO\]/gi) ?? []).length;
  const totalLength = text.length;

  if (handwrittenSections === 0) {
    return { hasHandwriting: null, confidence: null };
  }

  // Rough estimate: each handwritten marker covers ~200 chars
  const estimatedHandwrittenChars = handwrittenSections * 200;
  const ratio = Math.min(estimatedHandwrittenChars / Math.max(totalLength, 1), 1);

  if (ratio > 0.5) {
    return { hasHandwriting: 'yes', confidence: 60 };
  }

  return { hasHandwriting: 'partial', confidence: 70 };
}

/**
 * Estimate OCR confidence based on text quality indicators.
 * Higher confidence for clean text, lower for text with many illegible markers.
 */
function estimateConfidence(text: string): number {
  if (!text || text.length < 10) return 0;

  const illegibleCount = (text.match(/\[ILLEGGIBILE\]/gi) ?? []).length;
  const totalWords = text.split(/\s+/).length;

  if (totalWords === 0) return 0;

  // Each illegible marker reduces confidence
  const illegiblePenalty = Math.min(illegibleCount * 5, 40);

  // Short text may indicate poor OCR
  const lengthBonus = Math.min(totalWords / 10, 10);

  return Math.max(Math.min(Math.round(90 - illegiblePenalty + lengthBonus), 100), 10);
}
