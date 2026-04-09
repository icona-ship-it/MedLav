import { inngest } from '@/lib/inngest/client';
import { logger } from '@/lib/logger';

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
      { limit: 20 },                              // global cap
      { limit: 5, key: 'event.data.userId' },      // per-user fairness
    ],
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
          await supabase.storage.from('documents').upload(storagePath, doc.splitBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          });
          await supabase.from('documents').insert({
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
        } else if (doc.originalDocumentId) {
          await supabase.from('documents').update({
            document_type: doc.documentType,
            classification_metadata: {
              aiSuggestedType: doc.documentType,
              confidence: doc.confidence,
              reasoning: 'Classificato da Organizza Documenti',
              organizedBy: 'document_organizer',
            },
            updated_at: new Date().toISOString(),
          }).eq('id', doc.originalDocumentId);
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
