import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { extractEventsFromDocument } from '@/services/extraction/extraction-service';
import { consolidateEvents } from '@/services/consolidation/event-consolidator';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { generateSynthesis } from '@/services/synthesis/synthesis-service';
import type { CaseType } from '@/types';
import type { ExtractedEvent } from '@/services/extraction/extraction-schemas';

interface CaseMetadata {
  caseId: string;
  caseType: CaseType;
  caseRole: string;
  patientInitials: string | null;
  userId: string;
}

interface DocumentInfo {
  id: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  documentType: string;
}

/**
 * Main Inngest function that orchestrates the document processing pipeline.
 * Each step is independently retryable.
 *
 * Pipeline: fetch metadata → OCR docs → extract events → consolidate →
 *           detect anomalies → detect missing docs → generate synthesis → finalize
 */
export const processCaseDocuments = inngest.createFunction(
  {
    id: 'process-case-documents',
    retries: 2,
    concurrency: [{ limit: 5 }],
    cancelOn: [
      { event: 'case/process.cancelled', match: 'data.caseId' },
    ],
  },
  { event: 'case/process.requested' },
  async ({ event, step }) => {
    const { caseId, userId } = event.data as { caseId: string; userId: string };
    const supabase = createAdminClient();

    // Step 1: Fetch case metadata and documents list
    const caseData = await step.run('fetch-case-metadata', async () => {
      const { data: caseRow, error: caseError } = await supabase
        .from('cases')
        .select('id, case_type, case_role, patient_initials, user_id')
        .eq('id', caseId)
        .single();

      if (caseError || !caseRow) {
        throw new Error(`Case not found: ${caseId}`);
      }

      // Verify ownership
      if (caseRow.user_id !== userId) {
        throw new Error('Unauthorized access to case');
      }

      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, file_name, file_type, storage_path, document_type, processing_status')
        .eq('case_id', caseId)
        .in('processing_status', ['caricato', 'in_coda']);

      if (docsError) {
        throw new Error(`Failed to fetch documents: ${docsError.message}`);
      }

      // Mark all documents as in_coda
      const docIds = (docs ?? []).map((d) => d.id);
      if (docIds.length > 0) {
        await supabase
          .from('documents')
          .update({ processing_status: 'in_coda', updated_at: new Date().toISOString() })
          .in('id', docIds);
      }

      return {
        metadata: {
          caseId: caseRow.id as string,
          caseType: caseRow.case_type as CaseType,
          caseRole: caseRow.case_role as string,
          patientInitials: caseRow.patient_initials as string | null,
          userId: caseRow.user_id as string,
        } satisfies CaseMetadata,
        documents: (docs ?? []).map((d) => ({
          id: d.id as string,
          fileName: d.file_name as string,
          fileType: d.file_type as string,
          storagePath: d.storage_path as string,
          documentType: (d.document_type ?? 'altro') as string,
        })) satisfies DocumentInfo[],
      };
    });

    const { metadata, documents } = caseData;

    if (documents.length === 0) {
      throw new Error('No documents to process');
    }

    // Step 2: OCR each document (one step per document for independent retries)
    const ocrResults = await step.run('ocr-all-documents', async () => {
      const results = [];

      for (const doc of documents) {
        // Update status to ocr_in_corso
        await supabase
          .from('documents')
          .update({ processing_status: 'ocr_in_corso', updated_at: new Date().toISOString() })
          .eq('id', doc.id);

        try {
          // Generate fresh signed URL for this document
          const signedUrl = await getSignedUrl(doc.storagePath);

          const ocrResult = await ocrDocument({
            documentId: doc.id,
            fileName: doc.fileName,
            fileType: doc.fileType,
            signedUrl,
          });

          // Save OCR pages to database
          if (ocrResult.pages.length > 0) {
            const pageRows = ocrResult.pages.map((p) => ({
              document_id: doc.id,
              page_number: p.pageNumber,
              ocr_text: p.text,
              ocr_confidence: p.confidence,
              has_handwriting: p.hasHandwriting,
              handwriting_confidence: p.handwritingConfidence,
            }));

            await supabase.from('pages').insert(pageRows);
          }

          // Update document with page count
          await supabase
            .from('documents')
            .update({
              page_count: ocrResult.pageCount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', doc.id);

          results.push({
            documentId: doc.id,
            fileName: doc.fileName,
            documentType: doc.documentType,
            fullText: ocrResult.fullText,
            pageCount: ocrResult.pageCount,
            averageConfidence: ocrResult.averageConfidence,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'OCR failed';
          await supabase
            .from('documents')
            .update({
              processing_status: 'errore',
              processing_error: message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', doc.id);

          // Continue with other documents, don't fail the whole pipeline
          console.error(`[pipeline] OCR failed for doc ${doc.id}: ${message}`);
        }
      }

      return results;
    });

    if (ocrResults.length === 0) {
      throw new Error('All documents failed OCR processing');
    }

    // Step 3: Extract events from each document
    const extractionResults = await step.run('extract-events-all', async () => {
      const results: Array<{ documentId: string; events: ExtractedEvent[] }> = [];

      for (const ocrResult of ocrResults) {
        // Update status
        await supabase
          .from('documents')
          .update({
            processing_status: 'estrazione_in_corso',
            updated_at: new Date().toISOString(),
          })
          .eq('id', ocrResult.documentId);

        try {
          const extraction = await extractEventsFromDocument({
            documentText: ocrResult.fullText,
            fileName: ocrResult.fileName,
            documentType: ocrResult.documentType,
            caseType: metadata.caseType,
          });

          results.push({
            documentId: ocrResult.documentId,
            events: extraction.events,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Extraction failed';
          await supabase
            .from('documents')
            .update({
              processing_status: 'errore',
              processing_error: message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ocrResult.documentId);

          console.error(`[pipeline] Extraction failed for doc ${ocrResult.documentId}: ${message}`);
        }
      }

      return results;
    });

    // Step 4: Consolidate events across all documents
    const consolidatedEvents = await step.run('consolidate-events', async () => {
      const consolidated = consolidateEvents(extractionResults);

      // Save all events to database
      if (consolidated.length > 0) {
        const eventRows = consolidated.map((e) => ({
          case_id: caseId,
          document_id: e.documentId,
          order_number: e.orderNumber,
          event_date: e.eventDate,
          date_precision: e.datePrecision,
          event_type: e.eventType,
          title: e.title,
          description: e.description,
          source_type: e.sourceType,
          diagnosis: e.diagnosis ?? null,
          doctor: e.doctor ?? null,
          facility: e.facility ?? null,
          confidence: e.confidence,
          requires_verification: e.requiresVerification,
          reliability_notes: e.reliabilityNotes ?? e.discrepancyNote ?? null,
        }));

        await supabase.from('events').insert(eventRows);
      }

      // Update document statuses
      for (const docResult of extractionResults) {
        await supabase
          .from('documents')
          .update({
            processing_status: 'validazione_in_corso',
            updated_at: new Date().toISOString(),
          })
          .eq('id', docResult.documentId);
      }

      return consolidated;
    });

    // Step 5: Detect anomalies
    const anomalies = await step.run('detect-anomalies', async () => {
      const detected = detectAnomalies(consolidatedEvents);

      // Save anomalies to database
      if (detected.length > 0) {
        const anomalyRows = detected.map((a) => ({
          case_id: caseId,
          anomaly_type: a.anomalyType,
          severity: a.severity,
          description: a.description,
          involved_events: JSON.stringify(a.involvedEvents),
          suggestion: a.suggestion,
        }));

        await supabase.from('anomalies').insert(anomalyRows);
      }

      return detected;
    });

    // Step 6: Detect missing documents
    const missingDocs = await step.run('detect-missing-documents', async () => {
      const uploadedDocTypes = documents.map((d) => d.documentType);
      const missing = detectMissingDocuments({
        events: consolidatedEvents,
        caseType: metadata.caseType,
        uploadedDocTypes,
      });

      // Save missing documents to database
      if (missing.length > 0) {
        const missingRows = missing.map((m) => ({
          case_id: caseId,
          document_name: m.documentName,
          reason: m.reason,
          related_event: m.relatedEvent,
        }));

        await supabase.from('missing_documents').insert(missingRows);
      }

      return missing;
    });

    // Step 7: Generate synthesis
    const synthesisResult = await step.run('generate-synthesis', async () => {
      const result = await generateSynthesis({
        caseType: metadata.caseType,
        caseRole: metadata.caseRole,
        patientInitials: metadata.patientInitials,
        events: consolidatedEvents,
        anomalies,
        missingDocuments: missingDocs,
      });

      // Save report to database
      const { data: report } = await supabase
        .from('reports')
        .insert({
          case_id: caseId,
          version: 1,
          report_status: 'bozza',
          synthesis: result.synthesis,
        })
        .select('id')
        .single();

      return { synthesis: result.synthesis, wordCount: result.wordCount, reportId: report?.id };
    });

    // Step 8: Finalize - mark everything as completed
    await step.run('finalize', async () => {
      // Mark all processed documents as completed
      for (const docResult of extractionResults) {
        await supabase
          .from('documents')
          .update({
            processing_status: 'completato',
            updated_at: new Date().toISOString(),
          })
          .eq('id', docResult.documentId);
      }

      // Update case status
      await supabase
        .from('cases')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', caseId);

      // Audit log (no sensitive data)
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'case.processing.completed',
        entity_type: 'case',
        entity_id: caseId,
        metadata: {
          documentsProcessed: extractionResults.length,
          eventsExtracted: consolidatedEvents.length,
          anomaliesDetected: anomalies.length,
          missingDocuments: missingDocs.length,
          synthesisWordCount: synthesisResult.wordCount,
        },
      });
    });

    return {
      success: true,
      caseId,
      documentsProcessed: extractionResults.length,
      eventsExtracted: consolidatedEvents.length,
      anomaliesDetected: anomalies.length,
      missingDocuments: missingDocs.length,
      synthesisWordCount: synthesisResult.wordCount,
    };
  },
);
