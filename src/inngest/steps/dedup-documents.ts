import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { downloadFile } from '@/lib/supabase/storage';
import type { DocumentInfo } from './types';
import { logger } from '@/lib/logger';

/**
 * In-pipeline duplicate-document guard (QA Tedesco 2026-06-11): a PDF uploaded
 * twice slipped past the upload-time dedup (legacy rows have content_hash
 * NULL — the Wave D.2 partial unique index ignores NULLs) and every duplicate
 * event/expense/verbatim page downstream doubled, producing absurd ITT totals.
 *
 * Strategy, root-cause level:
 * 1. Backfill content_hash for the case's NULL rows (download + SHA-256).
 * 2. Group by hash: the EARLIEST upload wins; the others are marked in DB
 *    ("identico a X — non rielaborato") and excluded from the pipeline run
 *    (no OCR, no extraction, no verbatim → no duplicates anywhere).
 *
 * Fail-open: any backfill error leaves that document IN the run (better a
 * potential duplicate than a silently skipped document).
 */

export interface DocumentDedupResult {
  /** documentId → fileName of the kept twin, for excluded duplicates. */
  duplicates: Array<{ documentId: string; fileName: string; duplicateOfFileName: string }>;
  backfilledHashes: number;
}

export async function dedupCaseDocuments(
  caseId: string,
  documents: DocumentInfo[],
): Promise<DocumentDedupResult> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from('documents')
    .select('id, content_hash, file_name, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  const docById = new Map(documents.map((d) => [d.id, d]));
  const hashById = new Map<string, string>();
  let backfilledHashes = 0;

  for (const row of rows ?? []) {
    const id = row.id as string;
    if (!docById.has(id)) continue; // not part of this run
    const existing = row.content_hash as string | null;
    if (existing) {
      hashById.set(id, existing);
      continue;
    }
    // Backfill: download from Storage and hash (legacy pre-0024 rows)
    try {
      const doc = docById.get(id) as DocumentInfo;
      const blob = await downloadFile(doc.storagePath);
      const buffer = Buffer.from(await blob.arrayBuffer());
      const hash = createHash('sha256').update(buffer).digest('hex');
      await supabase.from('documents').update({ content_hash: hash }).eq('id', id);
      hashById.set(id, hash);
      backfilledHashes++;
    } catch (err) {
      logger.warn('pipeline', `Hash backfill failed for doc ${id} (fail-open, resta nel run): ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // Group by hash, earliest (rows are created_at-ordered) wins
  const firstByHash = new Map<string, { id: string; fileName: string }>();
  const duplicates: DocumentDedupResult['duplicates'] = [];
  for (const row of rows ?? []) {
    const id = row.id as string;
    if (!docById.has(id)) continue;
    const hash = hashById.get(id);
    if (!hash) continue;
    const first = firstByHash.get(hash);
    if (!first) {
      firstByHash.set(hash, { id, fileName: row.file_name as string });
    } else {
      duplicates.push({
        documentId: id,
        fileName: row.file_name as string,
        duplicateOfFileName: first.fileName,
      });
    }
  }

  // Mark duplicates in DB so the documents list explains WHY they're skipped
  for (const dup of duplicates) {
    await supabase.from('documents').update({
      processing_status: 'completato',
      processing_error: `Contenuto identico a "${dup.duplicateOfFileName}" — non rielaborato (protezione doppioni: conta una volta sola).`,
      updated_at: new Date().toISOString(),
    }).eq('id', dup.documentId);
  }

  if (duplicates.length > 0) {
    logger.info('pipeline', `Dedup: ${duplicates.length} duplicate document(s) excluded from the run for case ${caseId}`);
  }

  return { duplicates, backfilledHashes };
}
