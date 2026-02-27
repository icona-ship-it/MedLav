import { getMistralClient, MISTRAL_MODELS, withMistralRetry } from '@/lib/mistral/client';
import type { OcrPageResult, OcrDocumentResult, OcrImageResult } from './ocr-types';

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
  tables?: string[];
  header?: string;
  footer?: string;
}

interface OcrRawResponse {
  pages?: OcrRawPage[];
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

  // Filter repetitive headers/footers
  filterRepetitiveHeadersFooters(rawPages);

  const pages: OcrPageResult[] = rawPages.map((page) => {
    let text = page.markdown ?? '';

    // If there are HTML tables from OCR 3, insert them with markers
    if (page.tables && page.tables.length > 0) {
      for (const table of page.tables) {
        text += `\n[TABLE_HTML_START]\n${table}\n[TABLE_HTML_END]\n`;
      }
    }

    // Append non-repetitive header/footer as context
    if (page.headerText.length > 0) {
      console.log(`[ocr] Page ${page.pageNumber}: header detected (${page.headerText.length} chars)`);
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
    };
  });

  // Full text with page markers for source anchoring
  const fullText = pages.map((p) =>
    `[PAGE_START:${p.pageNumber}]\n${p.text}\n[PAGE_END:${p.pageNumber}]`,
  ).join('\n\n');

  const averageConfidence = pages.length > 0
    ? pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length
    : 0;

  return {
    documentId,
    fileName,
    pageCount: pages.length,
    pages,
    averageConfidence: Math.round(averageConfidence),
    fullText,
    images: allImages,
  };
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
      console.log(`[ocr] Filtering repetitive header (${count}/${pages.length} pages): "${header.slice(0, 50)}..."`);
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
      console.log(`[ocr] Filtering repetitive footer (${count}/${pages.length} pages): "${footer.slice(0, 50)}..."`);
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
  const client = getMistralClient();

  const response = await withMistralRetry(
    () => client.ocr.process({
      model: MISTRAL_MODELS.OCR,
      document: {
        type: 'document_url',
        documentUrl: signedUrl,
      },
      includeImageBase64: false,
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
  const client = getMistralClient();

  const response = await withMistralRetry(
    () => client.ocr.process({
      model: MISTRAL_MODELS.OCR,
      document: {
        type: 'image_url',
        imageUrl: signedUrl,
      },
      includeImageBase64: false,
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
  const client = getMistralClient();

  const response = await withMistralRetry(
    () => client.ocr.process({
      model: MISTRAL_MODELS.OCR,
      document: {
        type: 'document_url',
        documentUrl: signedUrl,
      },
      includeImageBase64: false,
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
