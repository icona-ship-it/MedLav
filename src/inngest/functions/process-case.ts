import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl } from '@/lib/supabase/storage';
import { ocrDocument } from '@/services/ocr/ocr-service';
import { extractEventsFromChunk } from '@/services/extraction/extraction-service';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { linkImagesToEvents } from '@/services/extraction/image-event-linker';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import { generateSynthesis } from '@/services/synthesis/synthesis-service';
import type { CaseType, CaseRole } from '@/types';
import { safeJsonParse } from '@/lib/format';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';

interface CaseMetadata {
  caseId: string;
  caseType: CaseType;
  caseRole: CaseRole;
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
          caseRole: caseRow.case_role as CaseRole,
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

    // Step 2: OCR each document — text only, no base64 images (fast, light response)
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

          const ocrStartMs = Date.now();
          console.log(`[pipeline] Step 2: Starting OCR for doc ${doc.id} (${doc.fileName})`);

          const result = await ocrDocument({
            documentId: doc.id,
            fileName: doc.fileName,
            fileType: doc.fileType,
            signedUrl,
          });

          // Save OCR pages to database (text only)
          if (result.pages.length > 0) {
            const pageRows = result.pages.map((p) => ({
              document_id: doc.id,
              page_number: p.pageNumber,
              ocr_text: p.text,
              ocr_confidence: p.confidence,
              has_handwriting: p.hasHandwriting,
              handwriting_confidence: p.handwritingConfidence,
            }));

            await supabase.from('pages').insert(pageRows);
          }

          await supabase
            .from('documents')
            .update({ page_count: result.pageCount, updated_at: new Date().toISOString() })
            .eq('id', doc.id);

          console.log(`[pipeline] Step 2: OCR completed for doc ${doc.id} - ${result.pageCount} pages in ${Date.now() - ocrStartMs}ms`);

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
    }> = [];

    // Step 3: Extract events — chunks read from DB, process in PARALLEL
    // Pages are already in DB from OCR. Each chunk step reads its pages,
    // calls Mistral, saves events to DB. Only tiny counts pass through Inngest.
    const PAGES_PER_CHUNK = 10;

    for (const ocrResult of ocrResults) {
      // Step 3a: Calculate chunk ranges (instant, no data)
      const chunkRanges = await step.run(`plan-chunks-${ocrResult.documentId}`, async () => {
        const supabase = createAdminClient();
        await supabase.from('documents').update({
          processing_status: 'estrazione_in_corso',
          updated_at: new Date().toISOString(),
        }).eq('id', ocrResult.documentId);

        const totalPages = ocrResult.pageCount;
        const ranges: Array<{ start: number; end: number }> = [];
        for (let i = 1; i <= totalPages; i += PAGES_PER_CHUNK) {
          ranges.push({ start: i, end: Math.min(i + PAGES_PER_CHUNK - 1, totalPages) });
        }
        console.log(`[pipeline] Doc ${ocrResult.documentId}: ${ranges.length} chunk(s) for ${totalPages} pages`);
        return ranges;
      });

      // Step 3b: Extract each chunk IN PARALLEL — each reads from DB, saves to DB
      const chunkPromises = chunkRanges.map((range, i) =>
        step.run(`extract-${ocrResult.documentId}-p${range.start}-${range.end}`, async () => {
          const supabase = createAdminClient();

          try {
            const extractionStartMs = Date.now();
            console.log(`[pipeline] Starting extraction for pages ${range.start}-${range.end} of doc ${ocrResult.documentId}`);

            // Read pages from DB (no large data from Inngest)
            const { data: pages } = await supabase
              .from('pages')
              .select('page_number, ocr_text')
              .eq('document_id', ocrResult.documentId)
              .gte('page_number', range.start)
              .lte('page_number', range.end)
              .order('page_number', { ascending: true });

            if (!pages || pages.length === 0) return { count: 0 };

            const chunkText = pages.map((p) =>
              `[PAGE_START:${p.page_number}]\n${p.ocr_text}\n[PAGE_END:${p.page_number}]`,
            ).join('\n\n');

            const chunkLabel = chunkRanges.length > 1
              ? `${ocrResult.fileName} [pag ${range.start}-${range.end}]`
              : ocrResult.fileName;

            const result = await extractEventsFromChunk({
              chunkText,
              chunkLabel,
              documentType: ocrResult.documentType,
              caseType: metadata.caseType,
              temperature: 0.2,
              chunkIndex: i,
              totalChunks: chunkRanges.length,
              documentName: ocrResult.fileName,
              pageRange: `pag ${range.start}-${range.end}`,
            });

            if (result.events.length === 0) return { count: 0 };

            // Enum validation — LLM can produce values outside the enum
            const VALID_EVENT_TYPES = new Set([
              'visita', 'esame', 'diagnosi', 'intervento', 'terapia', 'ricovero',
              'follow-up', 'referto', 'prescrizione', 'consenso', 'complicanza', 'altro',
            ]);
            const VALID_SOURCE_TYPES = new Set([
              'cartella_clinica', 'referto_controllo', 'esame_strumentale', 'esame_ematochimico', 'altro',
            ]);
            const VALID_DATE_PRECISIONS = new Set(['giorno', 'mese', 'anno', 'sconosciuta']);

            // Save events directly to DB with enum normalization
            const eventRows = result.events.map((e, idx) => ({
              case_id: caseId,
              document_id: ocrResult.documentId,
              order_number: (range.start - 1) * 100 + idx + 1,
              event_date: e.eventDate,
              date_precision: VALID_DATE_PRECISIONS.has(e.datePrecision) ? e.datePrecision : 'sconosciuta',
              event_type: VALID_EVENT_TYPES.has(e.eventType) ? e.eventType : 'altro',
              title: e.title,
              description: e.description,
              source_type: VALID_SOURCE_TYPES.has(e.sourceType) ? e.sourceType : 'altro',
              diagnosis: e.diagnosis ?? null,
              doctor: e.doctor ?? null,
              facility: e.facility ?? null,
              confidence: e.confidence,
              requires_verification: e.requiresVerification,
              reliability_notes: e.reliabilityNotes ?? null,
              source_text: e.sourceText ?? null,
              source_pages: e.sourcePages ? JSON.stringify(e.sourcePages) : null,
              extraction_pass: 'pass1_only',
            }));

            const { error: insertError } = await supabase.from('events').insert(eventRows);
            if (insertError) {
              console.error(`[pipeline] Chunk ${i + 1} INSERT FAILED: ${insertError.message}`);
              throw new Error(`Event insert failed: ${insertError.message}`);
            }
            console.log(`[pipeline] Chunk ${i + 1} (p${range.start}-${range.end}): ${eventRows.length} events saved in ${Date.now() - extractionStartMs}ms`);
            return { count: eventRows.length };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Extraction failed';
            console.error(`[pipeline] Chunk ${i + 1} failed: ${message}`);
            return { count: 0 };
          }
        }),
      );

      // All chunks run in parallel
      const chunkResults = await Promise.all(chunkPromises);
      const totalEvents = chunkResults.reduce((sum, r) => sum + r.count, 0);

      if (totalEvents === 0) {
        await step.run(`mark-error-${ocrResult.documentId}`, async () => {
          const supabase = createAdminClient();
          await supabase.from('documents').update({
            processing_status: 'errore',
            processing_error: 'Nessun evento estratto',
            updated_at: new Date().toISOString(),
          }).eq('id', ocrResult.documentId);
        });
      } else {
        extractionResults.push({
          documentId: ocrResult.documentId,
        });
      }

      console.log(`[pipeline] Doc ${ocrResult.documentId}: ${totalEvents} total events from ${chunkRanges.length} chunks`);
    }

    // Step 4: Read all events from DB (already inserted by extraction steps)
    // Renumber order and prepare for analysis
    const consolidationResult = await step.run('consolidate-events', async () => {
      const supabase = createAdminClient();

      // Events are already in DB — just fetch and organize
      // Sanity check: extraction steps reported saving events
      const expectedEvents = extractionResults.length > 0;
      const { data: existingRaw } = await supabase
        .from('events')
        .select('*')
        .eq('case_id', caseId)
        .eq('is_deleted', false)
        .order('event_date', { ascending: true });

      const allEvents: ConsolidatedEvent[] = (existingRaw ?? []).map((e, idx) => ({
        orderNumber: idx + 1,
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

      // Update order numbers in DB
      for (const event of allEvents) {
        const dbId = (existingRaw ?? [])[event.orderNumber - 1]?.id;
        if (dbId) {
          await supabase.from('events').update({ order_number: event.orderNumber }).eq('id', dbId);
        }
      }

      // Update document statuses
      for (const docResult of extractionResults) {
        await supabase
          .from('documents')
          .update({ processing_status: 'validazione_in_corso', updated_at: new Date().toISOString() })
          .eq('id', docResult.documentId);
      }

      if (expectedEvents && allEvents.length === 0) {
        console.error(`[pipeline] Step 4: CRITICAL — extraction reported events but DB has 0! Insert likely failed silently.`);
      }
      console.log(`[pipeline] Step 4: ${allEvents.length} total events in DB`);
      return { allEvents, newEventsCount: allEvents.length };
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

      const synthesisStartMs = Date.now();
      console.log(`[pipeline] Step 7: Starting synthesis (full case, ${consolidationResult.allEvents.length} events, role: ${metadata.caseRole})`);

      // Calculate medico-legal periods for report integration
      const calcEvents = consolidationResult.allEvents.map((e) => ({
        event_date: e.eventDate,
        event_type: e.eventType,
        title: e.title,
        description: e.description,
      }));
      const calculations = calculateMedicoLegalPeriods(calcEvents);

      const result = await generateSynthesis({
        caseType: metadata.caseType,
        caseRole: metadata.caseRole,
        patientInitials: metadata.patientInitials,
        events: consolidationResult.allEvents,
        anomalies,
        missingDocuments: missingDocs,
        calculations,
      });

      console.log(`[pipeline] Step 7: Synthesis completed in ${Date.now() - synthesisStartMs}ms (${result.wordCount} words)`);

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

      // Audit log (no sensitive data)
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

