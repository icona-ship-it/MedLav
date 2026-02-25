import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl, uploadBase64Image } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { extractEventsFromDocument } from '@/services/extraction/extraction-service';
import type { DualPassEvent } from '@/services/extraction/dual-pass-extraction';
import { consolidateNewWithExisting } from '@/services/consolidation/event-consolidator';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { validateExtractedEvents } from '@/services/validation/event-validator';
import { verifySourceTexts } from '@/services/validation/source-text-verifier';
import { analyzeCoverage } from '@/services/validation/coverage-analyzer';
import type { CoverageResult } from '@/services/validation/coverage-analyzer';
import { linkImagesToEvents } from '@/services/extraction/image-event-linker';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { generateSynthesis } from '@/services/synthesis/synthesis-service';
import type { CaseType } from '@/types';
import { safeJsonParse } from '@/lib/format';

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
 * Extended event type with dual-pass metadata for DB insertion.
 */
interface ExtractedEventWithMeta extends DualPassEvent {
  documentId: string;
}

/**
 * Main Inngest function that orchestrates the document processing pipeline.
 * Each step is independently retryable.
 * IMPORTANT: createAdminClient() must be called inside each step because
 * Inngest re-executes steps independently and closures are not preserved.
 *
 * Pipeline: fetch metadata → OCR docs → extract events (dual-pass) → validate →
 *           consolidate → link images → detect anomalies → detect missing docs →
 *           generate synthesis → finalize
 */
export const processCaseDocuments = inngest.createFunction(
  {
    id: 'process-case-documents',
    retries: 1,
    concurrency: [{ limit: 3 }],
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

    // Step 2: OCR each document (one step per document for independent retry)
    const ocrResults: Array<{
      documentId: string;
      fileName: string;
      documentType: string;
      fullText: string;
      pageCount: number;
      averageConfidence: number;
    }> = [];

    for (const doc of documents) {
      const ocrResult = await step.run(`ocr-doc-${doc.id}`, async () => {
        const supabase = createAdminClient();

        await supabase
          .from('documents')
          .update({ processing_status: 'ocr_in_corso', updated_at: new Date().toISOString() })
          .eq('id', doc.id);

        try {
          const signedUrl = await getSignedUrl(doc.storagePath);

          console.log(`[pipeline] Step 2: OCR processing doc ${doc.id}`);

          const result = await ocrDocument({
            documentId: doc.id,
            fileName: doc.fileName,
            fileType: doc.fileType,
            signedUrl,
          });

          // Save OCR pages to database
          if (result.pages.length > 0) {
            const pageRows = result.pages.map((p) => ({
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

            if (insertedPages && result.images.length > 0) {
              const pageIdMap = new Map(
                insertedPages.map((p) => [p.page_number as number, p.id as string]),
              );

              const imagesByPage = new Map<number, Array<{ figureIndex: number; base64: string }>>();
              for (const img of result.images) {
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

          await supabase
            .from('documents')
            .update({ page_count: result.pageCount, updated_at: new Date().toISOString() })
            .eq('id', doc.id);

          console.log(`[pipeline] Step 2: OCR completed for doc ${doc.id} - ${result.pageCount} pages`);

          return {
            documentId: doc.id,
            fileName: doc.fileName,
            documentType: doc.documentType,
            fullText: result.fullText,
            pageCount: result.pageCount,
            averageConfidence: result.averageConfidence,
          };
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

          console.error(`[pipeline] OCR failed for doc ${doc.id}: ${message}`);
          return null;
        }
      });

      if (ocrResult) {
        ocrResults.push(ocrResult);
      }
    }

    if (ocrResults.length === 0) {
      throw new Error('All documents failed OCR processing');
    }

    // Step 3: Extract events per document (one step per doc for independent retry)
    const extractionResults: Array<{
      documentId: string;
      events: ExtractedEventWithMeta[];
      coverageResult: CoverageResult | null;
    }> = [];

    for (const ocrResult of ocrResults) {
      const extractionResult = await step.run(`extract-doc-${ocrResult.documentId}`, async () => {
        const supabase = createAdminClient();

        await supabase
          .from('documents')
          .update({ processing_status: 'estrazione_in_corso', updated_at: new Date().toISOString() })
          .eq('id', ocrResult.documentId);

        try {
          // Primary extraction (1 LLM call with enhanced prompt)
          const extractionResult = await extractEventsFromDocument({
            documentText: ocrResult.fullText,
            fileName: ocrResult.fileName,
            documentType: ocrResult.documentType,
            caseType: metadata.caseType,
            temperature: 0.1,
          });

          const { events: validatedEvents, issues } = validateExtractedEvents(extractionResult.events);
          if (issues.length > 0) {
            console.log(`[pipeline] Step 3: Validation found ${issues.length} issues for doc ${ocrResult.documentId}`);
          }

          const verificationResult = verifySourceTexts(validatedEvents, ocrResult.fullText);
          let coverageResult = analyzeCoverage(verificationResult.events, ocrResult.fullText);
          let allEvents = verificationResult.events;

          // Conditional second pass: ONLY if coverage is poor (< 50%)
          // This catches missed events in complex documents without wasting LLM calls on simple ones
          if (coverageResult.coveragePercent < 50 && coverageResult.uncoveredWithMedicalTerms > 0) {
            console.log(`[pipeline] Step 3: Low coverage (${coverageResult.coveragePercent}%) for doc ${ocrResult.documentId}, running targeted second pass`);

            try {
              const secondPass = await extractEventsFromDocument({
                documentText: ocrResult.fullText,
                fileName: ocrResult.fileName,
                documentType: ocrResult.documentType,
                caseType: metadata.caseType,
                temperature: 0.3,
              });

              // Merge new events not already found in first pass
              const existingKeys = new Set(
                allEvents.map((e) => `${e.eventDate}|${e.eventType}|${e.title}`),
              );
              const newEvents = secondPass.events.filter((e) => {
                const key = `${e.eventDate}|${e.eventType}|${e.title}`;
                return !existingKeys.has(key);
              });

              if (newEvents.length > 0) {
                console.log(`[pipeline] Step 3: Second pass found ${newEvents.length} additional events for doc ${ocrResult.documentId}`);
                const { events: validatedNew } = validateExtractedEvents(newEvents);
                const verifiedNew = verifySourceTexts(validatedNew, ocrResult.fullText);
                allEvents = [...allEvents, ...verifiedNew.events];
                coverageResult = analyzeCoverage(allEvents, ocrResult.fullText);
              }
            } catch (pass2Error) {
              const msg = pass2Error instanceof Error ? pass2Error.message : 'Second pass failed';
              console.error(`[pipeline] Step 3: Second pass failed (non-fatal) for doc ${ocrResult.documentId}: ${msg}`);
            }
          }

          const eventsWithMeta: ExtractedEventWithMeta[] = allEvents.map((event) => ({
            ...event,
            extractionPass: 'pass1_only' as DualPassEvent['extractionPass'],
            documentId: ocrResult.documentId,
          }));

          console.log(`[pipeline] Step 3: Extracted ${eventsWithMeta.length} events from doc ${ocrResult.documentId} (coverage: ${coverageResult.coveragePercent}%)`);

          return {
            documentId: ocrResult.documentId,
            events: eventsWithMeta,
            coverageResult,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Extraction failed';
          await supabase
            .from('documents')
            .update({ processing_status: 'errore', processing_error: message, updated_at: new Date().toISOString() })
            .eq('id', ocrResult.documentId);
          console.error(`[pipeline] Extraction failed for doc ${ocrResult.documentId}: ${message}`);
          return null;
        }
      });

      if (extractionResult) {
        extractionResults.push(extractionResult);
      }
    }

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
        sourceText: (e.source_text ?? '') as string,
        sourcePages: e.source_pages ? safeJsonParse<number[]>(e.source_pages as string, []) : [],
      }));

      // Build DocumentEvents for consolidation (strip dual-pass metadata)
      const docEventsForConsolidation = extractionResults.map((r) => ({
        documentId: r.documentId,
        events: r.events.map((e) => ({
          eventDate: e.eventDate,
          datePrecision: e.datePrecision,
          eventType: e.eventType,
          title: e.title,
          description: e.description,
          sourceType: e.sourceType,
          diagnosis: e.diagnosis,
          doctor: e.doctor,
          facility: e.facility,
          confidence: e.confidence,
          requiresVerification: e.requiresVerification,
          reliabilityNotes: e.reliabilityNotes,
          sourceText: e.sourceText,
          sourcePages: e.sourcePages,
        })),
      }));

      const { newEventsToInsert, allEvents } = consolidateNewWithExisting(
        docEventsForConsolidation,
        existingEvents,
      );

      console.log(`[pipeline] Step 4: ${newEventsToInsert.length} new events (${existingEvents.length} existing, ${allEvents.length} total)`);

      // Build a lookup for extraction pass by matching events
      const extractionPassMap = new Map<string, string>();
      for (const docResult of extractionResults) {
        for (const e of docResult.events) {
          const key = `${e.eventDate}|${e.eventType}|${e.title}`;
          extractionPassMap.set(key, e.extractionPass);
        }
      }

      // Insert only new (non-duplicate) events
      if (newEventsToInsert.length > 0) {
        const eventRows = newEventsToInsert.map((e) => {
          const passKey = `${e.eventDate}|${e.eventType}|${e.title}`;
          const extractionPass = extractionPassMap.get(passKey) ?? 'pass1_only';

          return {
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
            source_text: e.sourceText ?? null,
            source_pages: e.sourcePages ? JSON.stringify(e.sourcePages) : null,
            extraction_pass: extractionPass,
          };
        });

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

    // Step 4.5: Link images to events based on sourcePages
    await step.run('link-images-to-events', async () => {
      const supabase = createAdminClient();

      console.log(`[pipeline] Step 4.5: Linking images to events`);

      // Fetch events with source_pages for this case
      const { data: eventsRaw } = await supabase
        .from('events')
        .select('id, document_id, source_pages')
        .eq('case_id', caseId)
        .eq('is_deleted', false)
        .not('source_pages', 'is', null);

      if (!eventsRaw || eventsRaw.length === 0) {
        console.log('[pipeline] Step 4.5: No events with source_pages, skipping');
        return;
      }

      // Fetch pages with images for documents in this case
      const { data: docsRaw } = await supabase
        .from('documents')
        .select('id')
        .eq('case_id', caseId);

      if (!docsRaw || docsRaw.length === 0) return;

      const docIds = docsRaw.map((d) => d.id);

      const { data: pagesRaw } = await supabase
        .from('pages')
        .select('id, document_id, page_number, image_path')
        .in('document_id', docIds)
        .not('image_path', 'is', null);

      if (!pagesRaw || pagesRaw.length === 0) {
        console.log('[pipeline] Step 4.5: No pages with images, skipping');
        return;
      }

      // Delete old event_images for this case's events
      const eventIds = eventsRaw.map((e) => e.id);
      if (eventIds.length > 0) {
        await supabase
          .from('event_images')
          .delete()
          .in('event_id', eventIds);
      }

      // Build links
      const events = eventsRaw.map((e) => ({
        eventId: e.id as string,
        documentId: (e.document_id ?? null) as string | null,
        sourcePages: safeJsonParse<number[]>(e.source_pages as string, []),
      }));

      const pagesWithImages = pagesRaw.map((p) => ({
        pageId: p.id as string,
        documentId: p.document_id as string,
        pageNumber: p.page_number as number,
        imagePath: p.image_path as string,
      }));

      const links = linkImagesToEvents(events, pagesWithImages);

      if (links.length > 0) {
        const rows = links.map((l) => ({
          event_id: l.eventId,
          page_id: l.pageId,
          image_path: l.imagePath,
          page_number: l.pageNumber,
        }));

        await supabase.from('event_images').insert(rows);
        console.log(`[pipeline] Step 4.5: Linked ${links.length} images to events`);
      }
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

    // Step 6: Detect missing documents — delete old, re-detect based on event content
    const missingDocs = await step.run('detect-missing-documents', async () => {
      const supabase = createAdminClient();

      // Delete previous missing documents for this case
      await supabase.from('missing_documents').delete().eq('case_id', caseId);

      const missing = detectMissingDocuments({
        events: consolidationResult.allEvents,
        caseType: metadata.caseType,
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

      // Build coverage summary (only numeric metrics, no sensitive data)
      const coverageMetrics = extractionResults
        .filter((r) => r.coverageResult !== null)
        .map((r) => ({
          documentId: r.documentId,
          coveragePercent: r.coverageResult!.coveragePercent,
          uncoveredBlocks: r.coverageResult!.uncoveredBlocks.length,
          uncoveredWithMedicalTerms: r.coverageResult!.uncoveredWithMedicalTerms,
        }));

      // Audit log (no sensitive data) — includes incremental info + coverage metrics
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
          coverageMetrics,
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

