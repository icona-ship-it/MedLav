import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl, uploadBase64Image } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { extractEventsFromDocument } from '@/services/extraction/extraction-service';
import { consolidateNewWithExisting } from '@/services/consolidation/event-consolidator';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
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
 * IMPORTANT: createAdminClient() must be called inside each step because
 * Inngest re-executes steps independently and closures are not preserved.
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

    // Step 1: Fetch case metadata and documents list
    const caseData = await step.run('fetch-case-metadata', async () => {
      const supabase = createAdminClient();

      console.log(`[pipeline] Step 1: Fetching case metadata for case ${caseId}`);

      const { data: caseRow, error: caseError } = await supabase
        .from('cases')
        .select('id, case_type, case_role, patient_initials, user_id')
        .eq('id', caseId)
        .single();

      if (caseError || !caseRow) {
        throw new Error(`Case not found: ${caseId} - error: ${caseError?.message ?? 'no data'}`);
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

      console.log(`[pipeline] Step 1: Found ${(docs ?? []).length} documents to process`);

      // Mark all documents as in_coda
      const docIds = (docs ?? []).map((d) => d.id);
      if (docIds.length > 0) {
        const { error: updateError } = await supabase
          .from('documents')
          .update({ processing_status: 'in_coda', updated_at: new Date().toISOString() })
          .in('id', docIds);

        if (updateError) {
          console.error(`[pipeline] Step 1: Failed to update doc status: ${updateError.message}`);
        }
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

    // Step 2: OCR each document
    const ocrResults = await step.run('ocr-all-documents', async () => {
      const supabase = createAdminClient();
      const results = [];

      console.log(`[pipeline] Step 2: Starting OCR for ${documents.length} documents`);

      for (const doc of documents) {
        // Update status to ocr_in_corso
        await supabase
          .from('documents')
          .update({ processing_status: 'ocr_in_corso', updated_at: new Date().toISOString() })
          .eq('id', doc.id);

        try {
          // Generate fresh signed URL for this document
          const signedUrl = await getSignedUrl(doc.storagePath);

          console.log(`[pipeline] Step 2: OCR processing doc ${doc.id} (${doc.fileName})`);

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

            const { data: insertedPages } = await supabase
              .from('pages')
              .insert(pageRows)
              .select('id, page_number');

            // Upload images and update page records with image paths
            if (insertedPages && ocrResult.images.length > 0) {
              const pageIdMap = new Map(
                insertedPages.map((p) => [p.page_number as number, p.id as string]),
              );

              // Group images by page
              const imagesByPage = new Map<number, Array<{ figureIndex: number; base64: string }>>();
              for (const img of ocrResult.images) {
                const existing = imagesByPage.get(img.pageNumber) ?? [];
                existing.push({ figureIndex: img.figureIndex, base64: img.imageBase64 });
                imagesByPage.set(img.pageNumber, existing);
              }

              for (const [pageNum, images] of imagesByPage) {
                const pageId = pageIdMap.get(pageNum);
                if (!pageId) continue;

                const uploadedPaths: string[] = [];
                for (const img of images) {
                  const storagePath = `${metadata.userId}/${caseId}/images/${pageId}-${img.figureIndex}.png`;
                  try {
                    await uploadBase64Image({ base64Data: img.base64, storagePath });
                    uploadedPaths.push(storagePath);
                  } catch (imgError) {
                    const imgMsg = imgError instanceof Error ? imgError.message : 'Upload failed';
                    console.error(`[pipeline] Image upload failed for page ${pageId}: ${imgMsg}`);
                  }
                }

                if (uploadedPaths.length > 0) {
                  await supabase
                    .from('pages')
                    .update({ image_path: uploadedPaths.join(';') })
                    .eq('id', pageId);
                }
              }
            }
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

          console.log(`[pipeline] Step 2: OCR completed for doc ${doc.id} - ${ocrResult.pageCount} pages`);
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
      const supabase = createAdminClient();
      const results: Array<{ documentId: string; events: ExtractedEvent[] }> = [];

      console.log(`[pipeline] Step 3: Extracting events from ${ocrResults.length} documents`);

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

          console.log(`[pipeline] Step 3: Extracted ${extraction.events.length} events from doc ${ocrResult.documentId}`);
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

    // Step 4: Consolidate events — incremental: dedup new vs existing DB events
    const consolidationResult = await step.run('consolidate-events', async () => {
      const supabase = createAdminClient();

      // Fetch existing active events for this case
      const { data: existingRaw } = await supabase
        .from('events')
        .select('*')
        .eq('case_id', caseId)
        .eq('is_deleted', false)
        .order('order_number', { ascending: true });

      const existingEvents: ConsolidatedEvent[] = (existingRaw ?? []).map((e) => ({
        orderNumber: e.order_number as number,
        documentId: (e.document_id ?? '') as string,
        eventDate: e.event_date as string,
        datePrecision: e.date_precision as ConsolidatedEvent['datePrecision'],
        eventType: e.event_type as ConsolidatedEvent['eventType'],
        title: e.title as string,
        description: e.description as string,
        sourceType: e.source_type as ConsolidatedEvent['sourceType'],
        diagnosis: (e.diagnosis ?? null) as string | null,
        doctor: (e.doctor ?? null) as string | null,
        facility: (e.facility ?? null) as string | null,
        confidence: e.confidence as number,
        requiresVerification: e.requires_verification as boolean,
        reliabilityNotes: (e.reliability_notes ?? null) as string | null,
        discrepancyNote: null,
      }));

      const { newEventsToInsert, allEvents } = consolidateNewWithExisting(
        extractionResults,
        existingEvents,
      );

      console.log(`[pipeline] Step 4: ${newEventsToInsert.length} new events (${existingEvents.length} existing, ${allEvents.length} total)`);

      // Insert only new (non-duplicate) events
      if (newEventsToInsert.length > 0) {
        const eventRows = newEventsToInsert.map((e) => ({
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

      return { allEvents, newEventsCount: newEventsToInsert.length };
    });

    // Step 5: Detect anomalies — delete old, re-detect on ALL events
    const anomalies = await step.run('detect-anomalies', async () => {
      const supabase = createAdminClient();

      // Delete previous anomalies for this case
      await supabase.from('anomalies').delete().eq('case_id', caseId);

      // Re-detect on the full event set
      const detected = detectAnomalies(consolidationResult.allEvents);

      console.log(`[pipeline] Step 5: Detected ${detected.length} anomalies (full case)`);

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

    // Step 6: Detect missing documents — delete old, check ALL doc types in case
    const missingDocs = await step.run('detect-missing-documents', async () => {
      const supabase = createAdminClient();

      // Delete previous missing documents for this case
      await supabase.from('missing_documents').delete().eq('case_id', caseId);

      // Fetch ALL document types for this case (not just current batch)
      const { data: allDocsRaw } = await supabase
        .from('documents')
        .select('document_type')
        .eq('case_id', caseId);
      const uploadedDocTypes = (allDocsRaw ?? []).map((d) => (d.document_type ?? 'altro') as string);

      const missing = detectMissingDocuments({
        events: consolidationResult.allEvents,
        caseType: metadata.caseType,
        uploadedDocTypes,
      });

      console.log(`[pipeline] Step 6: Detected ${missing.length} missing documents (full case)`);

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

    // Step 7: Generate synthesis — version = max + 1, on ALL events
    const synthesisResult = await step.run('generate-synthesis', async () => {
      const supabase = createAdminClient();

      console.log(`[pipeline] Step 7: Generating synthesis (full case, ${consolidationResult.allEvents.length} events)`);

      const result = await generateSynthesis({
        caseType: metadata.caseType,
        caseRole: metadata.caseRole,
        patientInitials: metadata.patientInitials,
        events: consolidationResult.allEvents,
        anomalies,
        missingDocuments: missingDocs,
      });

      // Get current max version
      const { data: latestReport } = await supabase
        .from('reports')
        .select('version')
        .eq('case_id', caseId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newVersion = ((latestReport?.version as number | null) ?? 0) + 1;

      const { data: report } = await supabase
        .from('reports')
        .insert({
          case_id: caseId,
          version: newVersion,
          report_status: 'bozza',
          synthesis: result.synthesis,
        })
        .select('id')
        .single();

      return { synthesis: result.synthesis, wordCount: result.wordCount, reportId: report?.id, reportVersion: newVersion };
    });

    // Step 8: Finalize - mark everything as completed
    await step.run('finalize', async () => {
      const supabase = createAdminClient();

      console.log(`[pipeline] Step 8: Finalizing`);

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

      // Audit log (no sensitive data) — includes incremental info
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'case.processing.completed',
        entity_type: 'case',
        entity_id: caseId,
        metadata: {
          documentsProcessed: extractionResults.length,
          newEventsInserted: consolidationResult.newEventsCount,
          totalEvents: consolidationResult.allEvents.length,
          anomaliesDetected: anomalies.length,
          missingDocuments: missingDocs.length,
          reportVersion: synthesisResult.reportVersion,
          synthesisWordCount: synthesisResult.wordCount,
        },
      });
    });

    return {
      success: true,
      caseId,
      documentsProcessed: extractionResults.length,
      newEventsInserted: consolidationResult.newEventsCount,
      totalEvents: consolidationResult.allEvents.length,
      anomaliesDetected: anomalies.length,
      missingDocuments: missingDocs.length,
      reportVersion: synthesisResult.reportVersion,
      synthesisWordCount: synthesisResult.wordCount,
    };
  },
);
