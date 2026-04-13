import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';
import { classifyDocument } from '@/services/classification/document-classifier';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { getSignedUrl } from '@/lib/supabase/storage';
import { refundCredits } from '@/services/credits/credit-service';
import { CREDIT_COSTS } from '@/services/credits/credit-costs';

/**
 * Inngest function: batch classify documents with AI.
 * Runs in background — user can close browser.
 * Each document is a separate step for fault tolerance.
 */
export const classifyBatchJob = inngest.createFunction(
  {
    id: 'classify-batch',
    retries: 2,
    concurrency: [
      { limit: 20 },
      { limit: 5, key: 'event.data.userId' },
    ],
    onFailure: async ({ event }) => {
      try {
        const failureData = event.data as { event: { data: { caseId: string; userId: string; totalCredits: number } } };
        const { caseId, userId, totalCredits } = failureData.event.data;
        // Refund all credits on total failure
        await refundCredits(userId, totalCredits, 'categorizzazione', caseId, { reason: 'classify_batch_failed' });
        logger.error('classify-batch', `Batch classification failed for case ${caseId}, refunded ${totalCredits} credits`);
      } catch (err) {
        logger.error('classify-batch', 'Failed to refund credits in onFailure', {
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    },
  },
  { event: 'case/documents.classify-batch' },
  async ({ event, step }) => {
    const { caseId, userId, documentIds } = event.data as {
      caseId: string;
      userId: string;
      documentIds: string[];
      totalCredits: number;
    };
    const total = documentIds.length;

    // Update progress: starting
    await step.run('init-progress', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      const { data: caseRow } = await supabase.from('cases').select('perizia_metadata').eq('id', caseId).single();
      const meta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
      await supabase.from('cases').update({
        perizia_metadata: { ...meta, classificationProgress: { completed: 0, total, errors: 0, status: 'running' } },
        updated_at: new Date().toISOString(),
      }).eq('id', caseId);
    });

    // Classify each document as a separate step
    let completed = 0;
    let errors = 0;

    for (const docId of documentIds) {
      const result = await step.run(`classify-${docId}`, async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();

        // Fetch document
        const { data: doc } = await supabase
          .from('documents')
          .select('id, file_name, file_type, storage_path')
          .eq('id', docId)
          .eq('case_id', caseId)
          .single();

        if (!doc) return { success: false, docId };

        try {
          // Check existing OCR pages
          const { data: existingPages } = await supabase
            .from('pages')
            .select('ocr_text')
            .eq('document_id', docId)
            .order('page_number', { ascending: true })
            .limit(3);

          let ocrText: string;
          if (existingPages && existingPages.length > 0) {
            ocrText = existingPages.map((p) => p.ocr_text as string).filter(Boolean).join('\n\n');
          } else {
            const signedUrl = await getSignedUrl(doc.storage_path);
            const ocrResult = await ocrDocument({
              documentId: docId,
              fileName: doc.file_name,
              fileType: doc.file_type,
              signedUrl,
            });
            ocrText = ocrResult.fullText;

            // Save OCR pages for pipeline reuse
            for (const page of ocrResult.pages) {
              const { data: existingPage } = await supabase
                .from('pages')
                .select('id')
                .eq('document_id', docId)
                .eq('page_number', page.pageNumber)
                .maybeSingle();
              if (!existingPage) {
                await supabase.from('pages').insert({
                  document_id: docId,
                  page_number: page.pageNumber,
                  ocr_text: page.text,
                  ocr_confidence: page.confidence,
                });
              }
            }
          }

          // Classify
          const classification = await classifyDocument(ocrText, doc.file_name);

          // Update document
          await supabase.from('documents').update({
            document_type: classification.documentType,
            classification_metadata: {
              aiSuggestedType: classification.documentType,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              classifiedAt: new Date().toISOString(),
              classifiedBy: 'inngest-batch',
            },
            updated_at: new Date().toISOString(),
          }).eq('id', docId);

          return { success: true, docId, type: classification.documentType };
        } catch (err) {
          logger.error('classify-batch', `Failed to classify doc ${docId}: ${err instanceof Error ? err.message : 'unknown'}`);
          return { success: false, docId };
        }
      });

      if (result.success) {
        completed++;
      } else {
        errors++;
      }

      // Update progress after each document
      await step.run(`progress-${docId}`, async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const supabase = createAdminClient();
        const { data: caseRow } = await supabase.from('cases').select('perizia_metadata').eq('id', caseId).single();
        const meta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
        await supabase.from('cases').update({
          perizia_metadata: { ...meta, classificationProgress: { completed: completed + errors, total, errors, status: 'running' } },
          updated_at: new Date().toISOString(),
        }).eq('id', caseId);
      });
    }

    // Finalize: clear progress, refund unused credits for errors
    await step.run('finalize', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      // Refund credits for failed documents
      if (errors > 0) {
        await refundCredits(userId, errors * CREDIT_COSTS.categorizzazione, 'categorizzazione', caseId, {
          reason: 'partial_classification_failure',
          failedDocs: errors,
        });
      }

      // Mark classification as done
      const { data: caseRow } = await supabase.from('cases').select('perizia_metadata').eq('id', caseId).single();
      const meta = (caseRow?.perizia_metadata ?? {}) as Record<string, unknown>;
      await supabase.from('cases').update({
        perizia_metadata: { ...meta, classificationProgress: { completed: completed + errors, total, errors, status: 'done' } },
        updated_at: new Date().toISOString(),
      }).eq('id', caseId);

      // Audit log
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'case.classification.batch',
        entity_type: 'case',
        entity_id: caseId,
        metadata: { total, completed, errors },
      });

      logger.info('classify-batch', `Batch classification done: ${completed}/${total} (${errors} errors)`, { caseId });
    });

    return { completed, errors, total };
  },
);
