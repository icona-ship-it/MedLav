import type { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Delete a case and all related data in dependency order.
 * Also removes files from Supabase Storage (documents + OCR images).
 * Used by the data-retention cron (src/inngest/functions/data-retention.ts).
 */
export async function deleteCaseAndRelatedData(
  supabase: AdminClient,
  caseId: string,
): Promise<void> {
  // 1. Get event IDs for event_images cleanup
  const { data: eventRows } = await supabase
    .from('events')
    .select('id')
    .eq('case_id', caseId);

  if (eventRows && eventRows.length > 0) {
    const eventIds = eventRows.map((e) => e.id as string);
    await supabase.from('event_images').delete().in('event_id', eventIds);
  }

  // 2. Get document IDs for pages cleanup and storage deletion
  const { data: docRows } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('case_id', caseId);

  if (docRows && docRows.length > 0) {
    const docIds = docRows.map((d) => d.id as string);
    for (let i = 0; i < docIds.length; i += 200) {
      const { error: delErr } = await supabase.from('pages').delete().in('document_id', docIds.slice(i, i + 200));
      if (delErr) logger.warn('data-retention', `Failed to delete pages batch: ${delErr.message}`);
    }

    // Remove document files from Supabase Storage
    const storagePaths = docRows
      .map((d) => d.storage_path as string)
      .filter(Boolean);

    if (storagePaths.length > 0) {
      await supabase.storage.from('documents').remove(storagePaths);
    }

    // Remove OCR-extracted images from Storage (GDPR Art. 9 — diagnostic images)
    const ocrImagePaths: string[] = [];
    for (const docId of docIds) {
      const { data: listed } = await supabase.storage
        .from('documents')
        .list(`ocr-images/${docId}`);
      if (listed && listed.length > 0) {
        ocrImagePaths.push(...listed.map((f) => `ocr-images/${docId}/${f.name}`));
      }
    }
    if (ocrImagePaths.length > 0) {
      for (let i = 0; i < ocrImagePaths.length; i += 1000) {
        await supabase.storage.from('documents').remove(ocrImagePaths.slice(i, i + 1000));
      }
    }

    // Remove cached document summaries (GDPR Art. 9 — derived clinical data)
    const { removeStoragePrefix } = await import('@/lib/supabase/storage');
    for (const docId of docIds) {
      await removeStoragePrefix(`doc-summaries/${docId}`);
    }
  }

  // Remove transient section parts (GDPR Art. 9 — testi di sezione generati,
  // bucket section-parts; scritti dalla pipeline, il report finale vive in
  // reports). Cancellazione GARANTITA con il caso.
  const { deleteCaseSectionParts } = await import('@/inngest/steps/section-part-store');
  await deleteCaseSectionParts(caseId);

  // 3. Delete remaining related tables
  await supabase.from('events').delete().eq('case_id', caseId);
  await supabase.from('anomalies').delete().eq('case_id', caseId);
  await supabase.from('missing_documents').delete().eq('case_id', caseId);
  await supabase.from('reports').delete().eq('case_id', caseId);
  await supabase.from('documents').delete().eq('case_id', caseId);

  // 4. Delete the case itself
  await supabase.from('cases').delete().eq('id', caseId);
}
