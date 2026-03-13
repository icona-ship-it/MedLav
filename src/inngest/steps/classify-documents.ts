import { createAdminClient } from '@/lib/supabase/admin';
import { classifyDocument } from '@/services/classification/document-classifier';
import { logger } from '@/lib/logger';
import type { OcrResult } from './types';

export interface DocumentClassification {
  documentId: string;
  oldType: string;
  newType: string;
  confidence: number;
  reasoning: string;
}

/**
 * Step 2.5: Classify ALL documents with OCR text for AI metadata.
 * - Always saves classification_metadata (AI suggestion) for every doc with text.
 * - Only changes document_type for docs that are "altro" with confidence >= 50%.
 * - Returns reclassified "altro" docs so the pipeline can apply them to ocrResults.
 */
export async function classifyDocumentsStep(
  ocrResults: OcrResult[],
): Promise<DocumentClassification[]> {
  const docsWithText = ocrResults.filter((r) => r.fullText.trim().length > 0);

  if (docsWithText.length === 0) {
    logger.info('pipeline', 'Step 2.5: No documents with OCR text, skipping classification');
    return [];
  }

  logger.info('pipeline', `Step 2.5: Classifying ${docsWithText.length}/${ocrResults.length} documents for AI metadata`);

  const supabase = createAdminClient();
  const classifications: DocumentClassification[] = [];

  for (const ocrResult of docsWithText) {
    try {
      const result = await classifyDocument(ocrResult.fullText, ocrResult.fileName);

      // Always save AI classification metadata for all docs
      await supabase
        .from('documents')
        .update({
          classification_metadata: {
            aiSuggestedType: result.documentType,
            confidence: result.confidence,
            reasoning: result.reasoning,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', ocrResult.documentId);

      // Only change document_type for "altro" docs with sufficient confidence
      if (ocrResult.documentType === 'altro' && result.documentType !== 'altro' && result.confidence >= 50) {
        const oldType = ocrResult.documentType;

        await supabase
          .from('documents')
          .update({
            document_type: result.documentType,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ocrResult.documentId);

        classifications.push({
          documentId: ocrResult.documentId,
          oldType,
          newType: result.documentType,
          confidence: result.confidence,
          reasoning: result.reasoning,
        });

        logger.info('pipeline',
          `Step 2.5: Doc ${ocrResult.documentId} reclassified "${oldType}" → "${result.documentType}" (confidence: ${result.confidence})`,
        );
      } else if (ocrResult.documentType !== 'altro') {
        logger.info('pipeline',
          `Step 2.5: Doc ${ocrResult.documentId} has user type "${ocrResult.documentType}", AI suggests "${result.documentType}" (confidence: ${result.confidence}) — metadata saved`,
        );
      } else {
        logger.info('pipeline',
          `Step 2.5: Doc ${ocrResult.documentId} kept as "altro" (AI: "${result.documentType}", confidence: ${result.confidence})`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Classification failed';
      logger.warn('pipeline', `Step 2.5: Classification failed for doc ${ocrResult.documentId}: ${message}`);
      // Non-fatal: document keeps its type, no metadata saved
    }
  }

  logger.info('pipeline', `Step 2.5: Classification complete — ${classifications.length} "altro" documents reclassified`);
  return classifications;
}

/**
 * Apply classification results to ocrResults array.
 * Must be called OUTSIDE step.run() so it always executes, even on retries.
 */
export function applyClassifications(
  ocrResults: OcrResult[],
  classifications: DocumentClassification[],
): void {
  const classMap = new Map(classifications.map((c) => [c.documentId, c.newType]));
  for (const ocrResult of ocrResults) {
    const newType = classMap.get(ocrResult.documentId);
    if (newType) {
      ocrResult.documentType = newType;
    }
  }
}
