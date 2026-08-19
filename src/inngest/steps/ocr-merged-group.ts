/**
 * OCR di un GRUPPO merge (feedback medici 2026-08-19): più file che sono
 * pagine dello stesso documento fisico (foto di un referto multi-pagina).
 * L'OCR gira per file IN SEQUENZA (l'ordine = merge_order = ordine pagina) e
 * tutte le pagine finiscono sotto il documento PRIMARIO con numerazione
 * progressiva — così classificazione, estrazione, cronistoria ed export vedono
 * UN documento unico.
 *
 * FAIL-SAFE: se anche UN solo file del gruppo fallisce l'OCR, fallisce tutto
 * il gruppo — un referto letto senza la pagina di mezzo sarebbe un errore
 * silenzioso peggiore di un errore dichiarato.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { OcrImageResult, OcrPageResult } from '@/services/ocr/ocr-types';
import type { DocumentInfo, OcrResult } from './types';
import { fetchOcrRawResult, saveOcrImagesToStorage } from './ocr-document';
import { logger } from '@/lib/logger';
import { recordDiagnostic, classifyPipelineError, sanitizeErrorForDetail } from '@/lib/pipeline-diagnostics';

interface RawFileResult {
  pages: OcrPageResult[];
  images: OcrImageResult[];
  averageConfidence: number;
  ocrPages?: number;
  pageCount: number;
}

export interface CombinedGroupResult {
  pages: OcrPageResult[];
  images: OcrImageResult[];
  averageConfidence: number;
  ocrPages: number;
  totalChars: number;
}

/**
 * Combina i risultati OCR dei file del gruppo in un unico documento logico:
 * pagine rinumerate progressivamente nell'ordine dei file, immagini rimappate
 * sulle nuove pagine, confidenza = media pesata sulle pagine. Pura.
 */
export function combineOcrResultsForGroup(fileResults: RawFileResult[]): CombinedGroupResult {
  const pages: OcrPageResult[] = [];
  const images: OcrImageResult[] = [];
  let confidenceWeighted = 0;
  let ocrPages = 0;
  let totalChars = 0;

  let offset = 0;
  for (const result of fileResults) {
    // Ordine pagine interno al file garantito dal numero pagina originale.
    const sortedPages = [...result.pages].sort((a, b) => a.pageNumber - b.pageNumber);
    const pageNumberMap = new Map<number, number>();
    for (const p of sortedPages) {
      const newNumber = offset + pageNumberMap.size + 1;
      pageNumberMap.set(p.pageNumber, newNumber);
      pages.push({ ...p, pageNumber: newNumber });
      totalChars += p.text?.length ?? 0;
    }
    for (const img of result.images) {
      const mapped = pageNumberMap.get(img.pageNumber);
      if (mapped !== undefined) images.push({ ...img, pageNumber: mapped });
    }
    confidenceWeighted += result.averageConfidence * sortedPages.length;
    ocrPages += result.ocrPages ?? result.pageCount;
    offset += sortedPages.length;
  }

  return {
    pages,
    images,
    averageConfidence: pages.length > 0 ? confidenceWeighted / pages.length : 0,
    ocrPages,
    totalChars,
  };
}

/**
 * Step 2 (variante gruppo): OCR di tutti i file del gruppo, scrittura pagine
 * sotto il primario, pulizia idempotente dei residui, immagini, status.
 * Returns null on failure (come ocrSingleDocument).
 */
export async function ocrMergedGroup(
  primary: DocumentInfo,
  secondaries: DocumentInfo[],
): Promise<OcrResult | null> {
  const supabase = createAdminClient();
  const allDocs = [primary, ...secondaries];
  const allIds = allDocs.map((d) => d.id);

  await supabase
    .from('documents')
    .update({ processing_status: 'ocr_in_corso', updated_at: new Date().toISOString() })
    .in('id', allIds);

  try {
    const startMs = Date.now();
    logger.info('pipeline', ` Step 2: Starting GROUP OCR for primary ${primary.id} (${allDocs.length} files)`);

    // Sequenziale: l'ordine dei file determina la numerazione delle pagine.
    const fileResults: RawFileResult[] = [];
    for (const doc of allDocs) {
      const result = await fetchOcrRawResult(doc);
      fileResults.push(result);
    }

    const combined = combineOcrResultsForGroup(fileResults);
    if (combined.pages.length === 0) {
      throw new Error(`Group OCR produced 0 pages for primary ${primary.id}`);
    }

    // Pulizia idempotente PRIMA dell'upsert: pagine residue dei secondari
    // (scritte da run precedenti al merge) e pagine del primario oltre il
    // totale nuovo non devono sopravvivere — l'estrazione le rileggerebbe.
    if (secondaries.length > 0) {
      await supabase.from('pages').delete().in('document_id', secondaries.map((s) => s.id));
    }
    await supabase.from('pages').delete().eq('document_id', primary.id).gt('page_number', combined.pages.length);

    const pageRows = combined.pages.map((p) => ({
      document_id: primary.id,
      page_number: p.pageNumber,
      ocr_text: p.text,
      ocr_confidence: p.confidence,
      has_handwriting: p.hasHandwriting,
      handwriting_confidence: p.handwritingConfidence,
    }));
    const { error: upsertError } = await supabase.from('pages').upsert(pageRows, { onConflict: 'document_id,page_number' });
    if (upsertError) {
      throw new Error(`Pages upsert failed for group primary ${primary.id}: ${upsertError.message}`);
    }

    const { count } = await supabase
      .from('pages')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', primary.id);
    const savedPageCount = count ?? 0;
    if (savedPageCount === 0) {
      throw new Error(`Group pages upsert returned no error but 0 pages found for primary ${primary.id}`);
    }

    if (combined.images.length > 0) {
      await saveOcrImagesToStorage(supabase, primary.id, combined.images);
    }

    // Primario: pageCount totale. Secondari: il contenuto è confluito — 0
    // pagine proprie, status completato (gli step a valle toccano solo il
    // primario via ocrResults).
    await supabase
      .from('documents')
      .update({ page_count: savedPageCount, updated_at: new Date().toISOString() })
      .eq('id', primary.id);
    if (secondaries.length > 0) {
      await supabase
        .from('documents')
        .update({ page_count: 0, processing_status: 'completato', updated_at: new Date().toISOString() })
        .in('id', secondaries.map((s) => s.id));
    }

    logger.info('pipeline', ` Step 2: GROUP OCR completed for primary ${primary.id} — ${savedPageCount} pages from ${allDocs.length} files in ${Date.now() - startMs}ms`);

    return {
      documentId: primary.id,
      fileName: primary.fileName,
      documentType: primary.documentType,
      fullText: '',
      pageCount: savedPageCount,
      averageConfidence: combined.averageConfidence,
      ocrPages: combined.ocrPages,
      totalChars: combined.totalChars,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Group OCR failed';
    await supabase
      .from('documents')
      .update({
        processing_status: 'errore',
        processing_error: `OCR del documento unito fallito: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .in('id', allIds);

    logger.error('pipeline', ` GROUP OCR failed for primary ${primary.id} (${allDocs.length} files): ${message}`);
    const { data: docRow } = await supabase.from('documents').select('case_id').eq('id', primary.id).single();
    if (docRow?.case_id) {
      await recordDiagnostic({
        caseId: docRow.case_id as string,
        step: 'ocr',
        code: classifyPipelineError(message),
        detail: { docId: primary.id, mergedFiles: allDocs.length, error: sanitizeErrorForDetail(message) },
      });
    }
    return null;
  }
}
