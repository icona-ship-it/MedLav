import { classifyPage, detectBoundaries } from './page-classifier';
import { splitPdf } from './pdf-splitter';
import type { PageClassification } from './page-classifier';
import { classifyDocument } from '../classification/document-classifier';
import { logger } from '@/lib/logger';

export interface OrganizedDocument {
  /** Original document ID (null if created from split) */
  originalDocumentId: string | null;
  /** New file name */
  fileName: string;
  /** Classified document type */
  documentType: string;
  /** Classification confidence */
  confidence: number;
  /** Page range in original PDF (null for non-PDF) */
  pageRange: { start: number; end: number } | null;
  /** Page count */
  pageCount: number;
  /** Date found in document (for chronological ordering) */
  dateFound: string | null;
  /** PDF buffer (null if not split, means keep original) */
  splitBuffer: Uint8Array | null;
  /** Whether this was split from a larger PDF */
  wasSplit: boolean;
}

export interface OrganizeResult {
  documents: OrganizedDocument[];
  totalOriginalDocs: number;
  totalResultDocs: number;
  splitCount: number;
}

/** Minimum pages before attempting to split a PDF. */
const MIN_PAGES_FOR_SPLIT = 3;

/**
 * Organize a set of documents:
 * 1. For PDFs with many pages: OCR per page → classify → detect boundaries → split
 * 2. For other files: classify normally
 * 3. Sort all results chronologically
 */
export async function organizeDocuments(
  documents: Array<{
    documentId: string;
    fileName: string;
    mimeType: string;
    fileBuffer: ArrayBuffer;
    ocrPages: Array<{ pageNumber: number; ocrText: string }>;
  }>,
): Promise<OrganizeResult> {
  const results: OrganizedDocument[] = [];
  let splitCount = 0;

  for (const doc of documents) {
    const isPdf = doc.mimeType === 'application/pdf';
    const pageCount = doc.ocrPages.length;

    if (isPdf && pageCount >= MIN_PAGES_FOR_SPLIT) {
      // Classify each page
      logger.info('document-organizer', `Classifying ${pageCount} pages of "${doc.fileName}"`);

      const pageClassifications: PageClassification[] = [];
      for (const page of doc.ocrPages) {
        const classification = await classifyPage(page.ocrText, page.pageNumber);
        pageClassifications.push(classification);
      }

      // Detect boundaries between different document types
      const boundaries = detectBoundaries(pageClassifications);

      if (boundaries.length > 1) {
        // Multiple document types found — split the PDF
        logger.info('document-organizer', `Found ${boundaries.length} document boundaries in "${doc.fileName}"`);

        const segments = await splitPdf(doc.fileBuffer, boundaries, doc.fileName);
        splitCount++;

        for (const segment of segments) {
          results.push({
            originalDocumentId: doc.documentId,
            fileName: segment.fileName,
            documentType: segment.documentType,
            confidence: segment.avgConfidence,
            pageRange: { start: segment.startPage, end: segment.endPage },
            pageCount: segment.pageCount,
            dateFound: segment.dateFound,
            splitBuffer: segment.buffer,
            wasSplit: true,
          });
        }
      } else {
        // Single document type — classify as whole
        const boundary = boundaries[0];
        results.push({
          originalDocumentId: doc.documentId,
          fileName: doc.fileName,
          documentType: boundary?.documentType ?? 'altro',
          confidence: boundary?.avgConfidence ?? 50,
          pageRange: null,
          pageCount,
          dateFound: boundary?.dateFound ?? null,
          splitBuffer: null,
          wasSplit: false,
        });
      }
    } else {
      // Non-PDF or small PDF — classify by first page text
      const fullText = doc.ocrPages.map((p) => p.ocrText).join('\n');

      try {
        const classification = await classifyDocument(fullText, doc.fileName);
        results.push({
          originalDocumentId: doc.documentId,
          fileName: doc.fileName,
          documentType: classification.documentType,
          confidence: classification.confidence,
          pageRange: null,
          pageCount,
          dateFound: null,
          splitBuffer: null,
          wasSplit: false,
        });
      } catch {
        results.push({
          originalDocumentId: doc.documentId,
          fileName: doc.fileName,
          documentType: 'altro',
          confidence: 10,
          pageRange: null,
          pageCount,
          dateFound: null,
          splitBuffer: null,
          wasSplit: false,
        });
      }
    }
  }

  // Sort chronologically by date found (documents without dates go to the end)
  results.sort((a, b) => {
    if (!a.dateFound && !b.dateFound) return 0;
    if (!a.dateFound) return 1;
    if (!b.dateFound) return -1;
    return a.dateFound.localeCompare(b.dateFound);
  });

  logger.info('document-organizer', `Organized ${documents.length} docs → ${results.length} docs (${splitCount} PDFs split)`);

  return {
    documents: results,
    totalOriginalDocs: documents.length,
    totalResultDocs: results.length,
    splitCount,
  };
}
