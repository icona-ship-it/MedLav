import { getMistralClient, MISTRAL_MODELS } from '@/lib/mistral/client';
import type { OcrPageResult, OcrDocumentResult, OcrImageResult } from './ocr-types';

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'];
const SUPPORTED_PDF_TYPES = ['application/pdf'];

function isSupportedForOcr(mimeType: string): boolean {
  return [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_PDF_TYPES].includes(mimeType);
}

function isImageType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType);
}

/**
 * Process a document through Mistral OCR.
 * Supports PDF and image files.
 * For unsupported types (DOC, XLS), returns empty result with error note.
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

  return ocrPdf({ documentId, fileName, signedUrl });
}

/**
 * OCR a PDF document using Mistral OCR API.
 * The API processes all pages and returns structured results.
 */
async function ocrPdf(params: {
  documentId: string;
  fileName: string;
  signedUrl: string;
}): Promise<OcrDocumentResult> {
  const { documentId, fileName, signedUrl } = params;
  const client = getMistralClient();

  const response = await client.ocr.process({
    model: MISTRAL_MODELS.OCR,
    document: {
      type: 'document_url',
      documentUrl: signedUrl,
    },
    includeImageBase64: true,
  });

  const allImages: OcrImageResult[] = [];

  const pages: OcrPageResult[] = (response.pages ?? []).map((page, index) => {
    const text = page.markdown ?? '';
    const handwritingInfo = detectHandwriting(text);
    const pageNumber = index + 1;

    // Extract images from page
    const pageImages: OcrImageResult[] = [];
    const pageObj = page as { images?: Array<{ id?: string; imageBase64?: string }> };
    if (pageObj.images && Array.isArray(pageObj.images)) {
      pageObj.images.forEach((img, figIdx) => {
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

  const fullText = pages.map((p) => p.text).join('\n\n---\n\n');
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
 * OCR a single image using Mistral Pixtral vision model.
 * Returns a single-page result.
 */
async function ocrImage(params: {
  documentId: string;
  fileName: string;
  signedUrl: string;
}): Promise<OcrDocumentResult> {
  const { documentId, fileName, signedUrl } = params;
  const client = getMistralClient();

  const response = await client.chat.complete({
    model: MISTRAL_MODELS.PIXTRAL_LARGE,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            imageUrl: signedUrl,
          },
          {
            type: 'text',
            text: `Trascrivi INTEGRALMENTE il testo presente in questa immagine di un documento medico.
Regole:
- Trascrivi TUTTO il testo visibile, inclusi numeri, date, firme leggibili
- Mantieni la struttura originale (intestazioni, tabelle, elenchi)
- Se parti sono manoscritte, trascrivile al meglio e segnala con [MANOSCRITTO] prima della parte
- Se parti sono illeggibili, indica [ILLEGGIBILE] al posto del testo
- NON aggiungere interpretazioni o commenti
- Usa formato Markdown per strutturare il testo`,
          },
        ],
      },
    ],
  });

  const text = extractTextFromResponse(response);
  const handwritingInfo = detectHandwriting(text);
  const confidence = estimateConfidence(text);

  const page: OcrPageResult = {
    pageNumber: 1,
    text,
    confidence,
    hasHandwriting: handwritingInfo.hasHandwriting,
    handwritingConfidence: handwritingInfo.confidence,
    images: [],
  };

  return {
    documentId,
    fileName,
    pageCount: 1,
    pages: [page],
    averageConfidence: confidence,
    fullText: text,
    images: [],
  };
}

/**
 * Extract text content from Mistral chat response.
 */
function extractTextFromResponse(response: unknown): string {
  const res = response as {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
  };
  return res.choices?.[0]?.message?.content ?? '';
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
