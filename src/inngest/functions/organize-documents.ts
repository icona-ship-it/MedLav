import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';
import { PIPELINE_LIMITS } from '@/lib/pipeline-limits';

/**
 * Idempotent refund of the `organizzazione_documenti` charge when the job fails
 * after all retries. The charge is VARIABLE (per-page), so we refund the exact
 * amount of THIS run (passed in the event payload as creditCost) rather than the
 * newest consumption. Count-based idempotency (refunds < consumptions) ensures an
 * Inngest re-delivery never double-refunds.
 */
async function refundOrganizeOnFailure(event: { data: unknown }): Promise<void> {
  try {
    const failureData = event.data as {
      event: { data: { caseId: string; creditCost?: number } };
      error?: { message?: string };
    };
    const caseId = failureData.event.data.caseId;
    const chargedAmount = failureData.event.data.creditCost;
    const errMsg = failureData.error?.message ?? 'Errore organizzazione documenti';
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    const { data: caseForRefund } = await supabase
      .from('cases')
      .select('user_id')
      .eq('id', caseId)
      .single();
    if (!caseForRefund) return;
    const userId = caseForRefund.user_id as string;

    const { data: consumptions } = await supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('entity_id', caseId)
      .eq('type', 'consumption')
      .eq('operation', 'organizzazione_documenti')
      .order('created_at', { ascending: false });
    const { data: refunds } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('entity_id', caseId)
      .eq('type', 'refund')
      .eq('operation', 'organizzazione_documenti');

    const consumptionCount = consumptions?.length ?? 0;
    const refundCount = refunds?.length ?? 0;
    if (consumptionCount === 0 || refundCount >= consumptionCount) return;

    // Exact amount of THIS run (event payload); fall back to the newest
    // consumption amount only for legacy events that predate the payload field.
    const refundAmount = (typeof chargedAmount === 'number' && chargedAmount > 0)
      ? chargedAmount
      : Math.abs(consumptions![0].amount as number);
    const { refundCredits } = await import('@/services/credits/credit-service');
    await refundCredits(userId, refundAmount, 'organizzazione_documenti', caseId, {
      reason: 'organize_failed',
      error: errMsg.slice(0, 200),
    });
    logger.info('document-organizer', `Refunded ${refundAmount} credits for failed organization of case ${caseId}`);
  } catch (err) {
    logger.error('document-organizer', `onFailure refund error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

/** Serializable version of OrganizeResult (no Uint8Array — buffers stay in step scope). */
interface SerializedOrganizeResult {
  documents: Array<{
    originalDocumentId: string | null;
    fileName: string;
    documentType: string;
    confidence: number;
    pageRange: { start: number; end: number } | null;
    pageCount: number;
    dateFound: string | null;
    wasSplit: boolean;
  }>;
  totalOriginalDocs: number;
  totalResultDocs: number;
  splitCount: number;
}

/**
 * Inngest function: Organize documents for a case.
 * Classifies pages, splits mixed PDFs, and reorders chronologically.
 */
export const organizeDocumentsJob = inngest.createFunction(
  {
    id: 'organize-documents',
    retries: 2,
    concurrency: [
      { limit: 50 },                              // global cap on Inngest Pro
      { limit: 30, key: 'event.data.userId' },    // per-user — organize is lightweight, parallelize aggressively
    ],
    onFailure: async ({ event }) => refundOrganizeOnFailure(event),
  },
  { event: 'case/documents.organize' },
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };

    // Step 1: Fetch documents and their OCR pages
    const docsWithPages = await step.run('fetch-documents', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      const { data: documents } = await supabase
        .from('documents')
        .select('id, file_name, file_type, storage_path')
        .eq('case_id', caseId)
        .eq('user_id', userId);

      if (!documents || documents.length === 0) {
        throw new Error('Nessun documento trovato nel caso');
      }

      // Fetch OCR pages for each document
      const results: Array<{
        documentId: string;
        fileName: string;
        mimeType: string;
        storagePath: string;
        pages: Array<{ pageNumber: number; ocrText: string }>;
      }> = [];

      for (const doc of documents) {
        const { data: pages } = await supabase
          .from('pages')
          .select('page_number, ocr_text')
          .eq('document_id', doc.id as string)
          .order('page_number', { ascending: true });

        results.push({
          documentId: doc.id as string,
          fileName: doc.file_name as string,
          mimeType: doc.file_type as string,
          storagePath: doc.storage_path as string,
          pages: (pages ?? []).map((p) => ({
            pageNumber: p.page_number as number,
            ocrText: (p.ocr_text as string) ?? '',
          })),
        });
      }

      // Defensive page cap (the route already caps, but pages could grow between
      // the route check and here). Throw BEFORE the per-page LLM classification
      // loop so no LLM calls are made above the cap.
      const totalPages = results.reduce((sum, d) => sum + d.pages.length, 0);
      if (totalPages > PIPELINE_LIMITS.MAX_PAGES_PER_RUN) {
        throw new Error(`Troppe pagine per l'organizzazione (${totalPages} > ${PIPELINE_LIMITS.MAX_PAGES_PER_RUN})`);
      }

      return results;
    });

    // Step 2: Download files, classify, split, and apply results
    // All in one step to avoid serializing Uint8Array buffers between steps
    const result: SerializedOrganizeResult = await step.run('classify-split-apply', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { organizeDocuments } = await import('@/services/document-organizer/document-organizer');
      const supabase = createAdminClient();

      // Download and organize
      const docsForOrganizer = [];
      for (const doc of docsWithPages) {
        const { data: fileData } = await supabase.storage
          .from('documents')
          .download(doc.storagePath);
        const fileBuffer = fileData ? await fileData.arrayBuffer() : new ArrayBuffer(0);
        docsForOrganizer.push({
          documentId: doc.documentId,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          fileBuffer,
          ocrPages: doc.pages,
        });
      }

      const organizeResult = await organizeDocuments(docsForOrganizer);

      // Apply results — upload splits and update DB
      for (const doc of organizeResult.documents) {
        if (doc.wasSplit && doc.splitBuffer && doc.originalDocumentId) {
          const storagePath = `cases/${caseId}/${doc.fileName}`;
          const { error: uploadErr } = await supabase.storage.from('documents').upload(storagePath, doc.splitBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });
          if (uploadErr) {
            // GDPR: il filename può contenere il nome del paziente → logga l'id, non il nome.
            logger.error('organize', `Failed to upload split PDF (origDoc ${doc.originalDocumentId}, pp.${doc.pageRange?.start}-${doc.pageRange?.end}): ${uploadErr.message}`);
            continue; // Skip this split, don't create orphan DB row
          }
          const { error: insertErr } = await supabase.from('documents').insert({
            case_id: caseId,
            user_id: userId,
            file_name: doc.fileName,
            file_type: 'application/pdf',
            file_size: doc.splitBuffer.length,
            storage_path: storagePath,
            document_type: doc.documentType,
            processing_status: 'caricato',
            classification_metadata: {
              aiSuggestedType: doc.documentType,
              confidence: doc.confidence,
              reasoning: `Split automatico (pp.${doc.pageRange?.start}-${doc.pageRange?.end})`,
              organizedBy: 'document_organizer',
            },
          });
          if (insertErr) {
            // GDPR: niente filename nei log (può contenere il nome del paziente).
            logger.error('organize', `Failed to insert split document (origDoc ${doc.originalDocumentId}, pp.${doc.pageRange?.start}-${doc.pageRange?.end}): ${insertErr.message}`);
          }
        } else if (doc.originalDocumentId) {
          const { error: updateErr } = await supabase.from('documents').update({
            document_type: doc.documentType,
            classification_metadata: {
              aiSuggestedType: doc.documentType,
              confidence: doc.confidence,
              reasoning: 'Classificato da Organizza Documenti',
              organizedBy: 'document_organizer',
            },
            updated_at: new Date().toISOString(),
          }).eq('id', doc.originalDocumentId);
          if (updateErr) {
            logger.error('organize', `Failed to update document ${doc.originalDocumentId}: ${updateErr.message}`);
          }
        }
      }

      // Return serializable result (no Uint8Array)
      return {
        documents: organizeResult.documents.map((d) => ({
          originalDocumentId: d.originalDocumentId,
          fileName: d.fileName,
          documentType: d.documentType,
          confidence: d.confidence,
          pageRange: d.pageRange,
          pageCount: d.pageCount,
          dateFound: d.dateFound,
          wasSplit: d.wasSplit,
        })),
        totalOriginalDocs: organizeResult.totalOriginalDocs,
        totalResultDocs: organizeResult.totalResultDocs,
        splitCount: organizeResult.splitCount,
      };
    });

    logger.info('document-organizer', `Organization complete for case ${caseId}: ${result.totalOriginalDocs} → ${result.totalResultDocs} docs`);

    return { success: true, caseId, ...result };
  },
);
