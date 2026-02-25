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

/**
 * Map a Mistral OCR API response to OcrDocumentResult.
 * Shared by ocrPdf, ocrImage, and ocrDocx.
 */
function mapOcrResponseToResult(params: {
  documentId: string;
  fileName: string;
  response: { pages?: Array<{ markdown?: string; images?: Array<{ id?: string; imageBase64?: string }> }> };
}): OcrDocumentResult {
  const { documentId, fileName, response } = params;
  const allImages: OcrImageResult[] = [];

  const pages: OcrPageResult[] = (response.pages ?? []).map((page, index) => {
    const text = page.markdown ?? '';
    const handwritingInfo = detectHandwriting(text);
    const pageNumber = index + 1;

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
    `[PAGE_START:${p.pageNumber}]\n${p.text}\n[PAGE_END:${p.pageNumber}]`
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
      includeImageBase64: true,
    }),
    'ocr-pdf',
  );

  return mapOcrResponseToResult({
    documentId,
    fileName,
    response: response as { pages?: Array<{ markdown?: string; images?: Array<{ id?: string; imageBase64?: string }> }> },
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
      includeImageBase64: true,
    }),
    'ocr-image',
  );

  return mapOcrResponseToResult({
    documentId,
    fileName,
    response: response as { pages?: Array<{ markdown?: string; images?: Array<{ id?: string; imageBase64?: string }> }> },
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
      includeImageBase64: true,
    }),
    'ocr-docx',
  );

  return mapOcrResponseToResult({
    documentId,
    fileName,
    response: response as { pages?: Array<{ markdown?: string; images?: Array<{ id?: string; imageBase64?: string }> }> },
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
