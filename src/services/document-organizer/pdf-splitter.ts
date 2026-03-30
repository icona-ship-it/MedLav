import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';
import type { DocumentBoundary } from './page-classifier';

export interface SplitSegment {
  fileName: string;
  documentType: string;
  buffer: Uint8Array;
  startPage: number;
  endPage: number;
  pageCount: number;
  dateFound: string | null;
  avgConfidence: number;
}

const TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'Cartella Clinica',
  referto_specialistico: 'Referto Specialistico',
  esame_strumentale: 'Esame Strumentale',
  esame_laboratorio: 'Esame Laboratorio',
  lettera_dimissione: 'Lettera Dimissione',
  certificato: 'Certificato',
  perizia_precedente: 'Perizia Precedente',
  spese_mediche: 'Spese Mediche',
  memoria_difensiva: 'Memoria Difensiva',
  perizia_ctp: 'Perizia CTP',
  perizia_ctu: 'Perizia CTU',
  altro: 'Documento',
};

/**
 * Split a PDF into segments based on detected document boundaries.
 * Each boundary becomes a separate PDF file.
 */
export async function splitPdf(
  pdfBuffer: ArrayBuffer | Uint8Array,
  boundaries: DocumentBoundary[],
  originalFileName: string,
): Promise<SplitSegment[]> {
  if (boundaries.length <= 1) {
    // Single document — no split needed, return as-is
    const boundary = boundaries[0];
    return [{
      fileName: originalFileName,
      documentType: boundary?.documentType ?? 'altro',
      buffer: new Uint8Array(pdfBuffer),
      startPage: boundary?.startPage ?? 1,
      endPage: boundary?.endPage ?? 1,
      pageCount: boundary ? (boundary.endPage - boundary.startPage + 1) : 1,
      dateFound: boundary?.dateFound ?? null,
      avgConfidence: boundary?.avgConfidence ?? 50,
    }];
  }

  const srcDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = srcDoc.getPageCount();
  const segments: SplitSegment[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const label = TYPE_LABELS[boundary.documentType] ?? 'Documento';
    const baseName = originalFileName.replace(/\.pdf$/i, '');

    try {
      const newDoc = await PDFDocument.create();

      // pdf-lib uses 0-based page indices
      const startIdx = boundary.startPage - 1;
      const endIdx = Math.min(boundary.endPage - 1, totalPages - 1);
      const pageIndices = Array.from({ length: endIdx - startIdx + 1 }, (_, j) => startIdx + j);

      const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
      for (const page of copiedPages) {
        newDoc.addPage(page);
      }

      const buffer = await newDoc.save();
      const pageCount = endIdx - startIdx + 1;

      segments.push({
        fileName: `${baseName} — ${label} (pp.${boundary.startPage}-${boundary.endPage}).pdf`,
        documentType: boundary.documentType,
        buffer: new Uint8Array(buffer),
        startPage: boundary.startPage,
        endPage: boundary.endPage,
        pageCount,
        dateFound: boundary.dateFound,
        avgConfidence: boundary.avgConfidence,
      });

      logger.info('document-organizer', `Split segment ${i + 1}: ${label} pp.${boundary.startPage}-${boundary.endPage} (${pageCount} pages)`);
    } catch (error) {
      logger.error('document-organizer', `Failed to split segment ${i + 1}: ${error instanceof Error ? error.message : 'unknown'}`);
      // On failure, include the original pages as a single segment
      segments.push({
        fileName: `${baseName} — ${label} (pp.${boundary.startPage}-${boundary.endPage}).pdf`,
        documentType: boundary.documentType,
        buffer: new Uint8Array(pdfBuffer),
        startPage: boundary.startPage,
        endPage: boundary.endPage,
        pageCount: boundary.endPage - boundary.startPage + 1,
        dateFound: boundary.dateFound,
        avgConfidence: boundary.avgConfidence,
      });
    }
  }

  logger.info('document-organizer', `Split "${originalFileName}" into ${segments.length} segments from ${totalPages} pages`);
  return segments;
}
