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
 * Step 2.5: Auto-classify documents that have type 'altro' (not manually set by user).
 * Skips documents where the user already chose a specific type.
 * Updates both the ocrResults array (for downstream steps) and the DB.
 */
export async function classifyDocumentsStep(
  ocrResults: OcrResult[],
): Promise<DocumentClassification[]> {
  const docsToClassify = ocrResults.filter((r) => r.documentType === 'altro');

  if (docsToClassify.length === 0) {
    logger.info('pipeline', 'Step 2.5: All documents already have types, skipping classification');
    return [];
  }

  logger.info('pipeline', `Step 2.5: Classifying ${docsToClassify.length}/${ocrResults.length} documents`);

  const supabase = createAdminClient();
  const classifications: DocumentClassification[] = [];

  for (const ocrResult of docsToClassify) {
    try {
      const result = await classifyDocument(ocrResult.fullText, ocrResult.fileName);

      if (result.documentType !== 'altro' && result.confidence >= 30) {
        // Update the ocrResult in-place so downstream steps use the new type
        const oldType = ocrResult.documentType;
        ocrResult.documentType = result.documentType;

        // Update the DB
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
          `Step 2.5: Doc ${ocrResult.documentId} classified as "${result.documentType}" (confidence: ${result.confidence})`,
        );
      } else {
        logger.info('pipeline',
          `Step 2.5: Doc ${ocrResult.documentId} kept as "altro" (classified: "${result.documentType}", confidence: ${result.confidence})`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Classification failed';
      logger.warn('pipeline', `Step 2.5: Classification failed for doc ${ocrResult.documentId}: ${message}`);
      // Non-fatal: document keeps 'altro' type
    }
  }

  logger.info('pipeline', `Step 2.5: Classification complete — ${classifications.length} documents reclassified`);
  return classifications;
}
