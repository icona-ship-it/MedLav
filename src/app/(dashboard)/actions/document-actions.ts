'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl } from '@/lib/supabase/storage';
import { revalidateCase } from '@/lib/cache';
import { validateDocumentBytes } from '@/lib/file-validators';
import { logger } from '@/lib/logger';

export async function getCaseDocuments(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  return data ?? [];
}

/**
 * Pre-upload duplicate check: returns whether a file with the same SHA-256
 * content hash already exists in the same case.
 *
 * Called from the client BEFORE uploading the file, so we can avoid wasting
 * bandwidth on a duplicate. The application-level check here is paired with
 * a partial UNIQUE index on (case_id, content_hash) for race-condition
 * safety (see migration 0024).
 */
export async function checkDuplicateDocument(params: {
  caseId: string;
  contentHash: string;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership before disclosing any info about its documents
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();
  if (!caseData) return { error: 'Caso non trovato' };

  const { data } = await supabase
    .from('documents')
    .select('id, file_name')
    .eq('case_id', params.caseId)
    .eq('content_hash', params.contentHash)
    .limit(1)
    .maybeSingle();

  if (data) {
    return { duplicate: true, existingFileName: data.file_name as string };
  }
  return { duplicate: false };
}

/**
 * Save document metadata after direct browser-to-Storage upload.
 * Only metadata is sent (no file data), so no size limit issues.
 */
export async function saveDocumentMetadata(params: {
  caseId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  documentType?: string;
  contentHash?: string;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Non autenticato' };
  }

  // AUTORIZZAZIONE SUL PATH. Lo storagePath arriva dal client (file-upload lo
  // costruisce come `${user.id}/${caseId}/${uuid}.ext`) e NON è vincolato lato
  // server. Senza questo check un utente autenticato potrebbe registrare — e poi
  // far firmare un signed-URL o cancellare col service-role — un file nel namespace
  // di un ALTRO utente (dati sanitari Art. 9). Deve stare dentro `${user.id}/${caseId}/`.
  const expectedPathPrefix = `${user.id}/${params.caseId}/`;
  if (!params.storagePath.startsWith(expectedPathPrefix) || params.storagePath.includes('..')) {
    logger.warn('document-validation', 'Rejected storagePath outside user/case namespace', {
      caseId: params.caseId, // MAI loggare lo storagePath: potrebbe rivelare il path di un altro utente
    });
    return { error: 'Percorso file non valido.' };
  }

  // Server-side file validation (client-side checks are not trusted)
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
  const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Text documents (XML/TXT) — ingested via direct-text path, no OCR
    'text/xml', 'application/xml', 'text/plain',
  ]);

  // Fast pre-check on the CLIENT-DECLARED size (cheap, rejects obvious lies). The
  // authoritative check is on the real stored size (blob.size) below — the client
  // value is never trusted for the actual limit or for what we persist.
  if (params.fileSize > MAX_FILE_SIZE) {
    return { error: 'File troppo grande. Il limite è 100 MB per documento.' };
  }
  if (params.fileSize <= 0) {
    return { error: 'File vuoto o non valido.' };
  }
  if (!ALLOWED_MIME_TYPES.has(params.fileType)) {
    return { error: 'Tipo file non supportato. Formati accettati: PDF, immagini, Word, Excel, XML, TXT.' };
  }

  // Real (server-verified) byte size, captured from the downloaded blob below.
  // Used for the authoritative limit check and persisted to the DB so downstream
  // cost calculations never trust the client-declared size.
  let verifiedFileSize: number | null = null;

  // Magic-byte validation: scarica primi 256 bytes dal file appena uploadato
  // e verifica che il contenuto reale corrisponda al MIME dichiarato.
  // Difesa contro file rinominati (es. .exe -> .pdf): se i magic bytes non
  // matchano, cancelliamo il file da Storage e rifiutiamo.
  try {
    const admin = createAdminClient();
    const { data: blob, error: dlErr } = await admin.storage
      .from('documents')
      .download(params.storagePath);
    if (dlErr || !blob) {
      // Fail CLOSED: without the blob we can verify neither the REAL size nor the
      // magic bytes. An unverifiable upload must not become OCR-eligible (it could
      // be oversized/spoofed and drive OCR cost). The bucket file_size_limit
      // (migration 0030) is the durable boundary guard; this is the app-level
      // safety net. Cleanup the orphan + ask the user to retry.
      logger.warn('document-validation', 'Rejected upload — verification download failed', {
        path: params.storagePath,
        error: dlErr?.message ?? 'no blob',
      });
      await admin.storage.from('documents').remove([params.storagePath]).catch(() => { /* best-effort */ });
      return { error: 'Impossibile verificare il file caricato. Riprova.' };
    } else {
      // Authoritative file-size check on the REAL stored bytes (blob.size), not
      // the client-declared params.fileSize which an attacker can spoof to slip a
      // huge file past the cheap pre-check above (denial-of-wallet via OCR cost).
      const realSize = blob.size;
      if (realSize > MAX_FILE_SIZE) {
        await admin.storage.from('documents').remove([params.storagePath]);
        logger.warn('document-validation', 'Rejected oversized file (real stored size)', {
          path: params.storagePath,
          realSize,
          declaredSize: params.fileSize,
        });
        return { error: 'File troppo grande. Il limite è 100 MB per documento.' };
      }
      if (realSize <= 0) {
        await admin.storage.from('documents').remove([params.storagePath]);
        return { error: 'File vuoto o non valido.' };
      }
      verifiedFileSize = realSize;

      // Read first 256 bytes for magic check (enough for all formats we support)
      const head = new Uint8Array(await blob.slice(0, 256).arrayBuffer());
      const validation = validateDocumentBytes(head, params.fileType);
      if (!validation.ok) {
        // Reject + cleanup the orphan file
        await admin.storage.from('documents').remove([params.storagePath]);
        logger.warn('document-validation', 'Rejected file failing magic-byte check', {
          path: params.storagePath,
          declaredType: params.fileType,
          reason: validation.reason,
        });
        return { error: validation.reason ?? 'File non valido.' };
      }
    }
  } catch (err) {
    // Fail CLOSED (coerente col ramo download-fallito sopra): se la verifica
    // infrastrutturale lancia, non possiamo garantire né la size reale né i magic
    // bytes → il file non deve diventare OCR-eligibile. Cleanup dell'orfano + errore.
    logger.error('document-validation', 'Magic-byte check threw — failing closed', {
      caseId: params.caseId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    try {
      const admin = createAdminClient();
      await admin.storage.from('documents').remove([params.storagePath]).catch(() => { /* best-effort */ });
    } catch { /* best-effort cleanup */ }
    return { error: 'Impossibile verificare il file caricato. Riprova.' };
  }

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return { error: 'Caso non trovato' };
  }

  // Application-level dedup check (paired with DB partial UNIQUE index for
  // race-condition safety). Skipped for legacy callers that don't supply a hash.
  if (params.contentHash) {
    const { data: existing } = await supabase
      .from('documents')
      .select('file_name')
      .eq('case_id', params.caseId)
      .eq('content_hash', params.contentHash)
      .limit(1)
      .maybeSingle();
    if (existing) {
      // Best-effort cleanup of the orphan file just uploaded to Storage
      const admin = createAdminClient();
      await admin.storage.from('documents').remove([params.storagePath]);
      return {
        error: `Documento già presente nel caso (caricato come "${existing.file_name as string}"). Non duplicato.`,
      };
    }
  }

  const { error } = await supabase
    .from('documents')
    .insert({
      case_id: params.caseId,
      file_name: params.fileName,
      file_type: params.fileType,
      file_size: verifiedFileSize ?? params.fileSize,
      storage_path: params.storagePath,
      document_type: params.documentType ?? 'altro',
      processing_status: 'caricato',
      content_hash: params.contentHash ?? null,
    });

  if (error) {
    // Catch race-condition: two concurrent uploads of the same file slipped
    // past the application check above. The partial UNIQUE index in 0024
    // rejects the second one with a 23505 unique_violation.
    if (error.code === '23505' && error.message?.includes('content_hash')) {
      const admin = createAdminClient();
      await admin.storage.from('documents').remove([params.storagePath]);
      return { error: 'Documento già presente nel caso. Non duplicato.' };
    }
    return { error: 'Errore salvataggio metadati' };
  }

  revalidateCase(params.caseId);
  return { success: true };
}

/**
 * Update the document count on a case after uploads.
 */
export async function updateCaseDocumentCount(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('case_id', caseId);

  await supabase
    .from('cases')
    .update({ document_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('id', caseId);
}

/**
 * Delete a document: remove file from Storage, delete DB row (cascade deletes pages).
 * Blocks if the document is currently being processed.
 */
export async function deleteDocument(params: { documentId: string; caseId: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Fetch document details
  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path, processing_status')
    .eq('id', params.documentId)
    .eq('case_id', params.caseId)
    .single();

  if (!doc) return { error: 'Documento non trovato' };

  // Block if currently processing
  const processingStatuses = ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso'];
  if (processingStatuses.includes(doc.processing_status)) {
    return { error: 'Impossibile eliminare un documento in elaborazione' };
  }

  // Fetch pages with image_path to clean up images from Storage
  const { data: pages } = await supabase
    .from('pages')
    .select('image_path')
    .eq('document_id', params.documentId)
    .not('image_path', 'is', null);

  // Collect all storage paths to delete (document file + images)
  const admin = createAdminClient();
  const pathsToDelete: string[] = [doc.storage_path];

  if (pages) {
    for (const page of pages) {
      if (page.image_path) {
        const imagePaths = (page.image_path as string).split(';').filter(Boolean);
        pathsToDelete.push(...imagePaths);
      }
    }
  }

  // Delete files from Storage
  await admin.storage.from('documents').remove(pathsToDelete);

  // Remove cached document summaries (GDPR Art. 9 — derived clinical data)
  const { removeStoragePrefix } = await import('@/lib/supabase/storage');
  await removeStoragePrefix(`doc-summaries/${params.documentId}`);

  // Delete document from DB (cascade deletes pages)
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', params.documentId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore eliminazione documento' };

  // Update document count on case
  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('case_id', params.caseId);

  await supabase
    .from('cases')
    .update({ document_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('id', params.caseId);

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'document.deleted',
    entity_type: 'document',
    entity_id: params.documentId,
    metadata: { caseId: params.caseId },
  });

  revalidateCase(params.caseId);
  return { success: true };
}

/**
 * Fetch page images for all documents in a case.
 * Returns a map of documentId -> image storage paths.
 */
export async function getCasePageImages(caseId: string): Promise<Record<string, string[]>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return {};

  // Get all documents for this case
  const { data: docs } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId);

  if (!docs || docs.length === 0) return {};

  const docIds = docs.map((d) => d.id);

  // Get pages with images (batched for PostgREST URL limit)
  const pages: Array<Record<string, unknown>> = [];
  for (let i = 0; i < docIds.length; i += 200) {
    const { data } = await supabase
      .from('pages')
      .select('document_id, image_path')
      .in('document_id', docIds.slice(i, i + 200))
      .not('image_path', 'is', null);
    if (data) pages.push(...data);
  }

  if (pages.length === 0) return {};

  const result: Record<string, string[]> = {};
  for (const page of pages) {
    const docId = page.document_id as string;
    const paths = (page.image_path as string).split(';').filter(Boolean);
    if (!result[docId]) {
      result[docId] = [];
    }
    result[docId].push(...paths);
  }

  return result;
}

/**
 * Get a signed URL to view/download the original document file.
 */
export async function getDocumentSignedUrl(params: { documentId: string; caseId: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', params.documentId)
    .eq('case_id', params.caseId)
    .single();

  if (!doc) return { error: 'Documento non trovato' };

  try {
    const url = await getSignedUrl(doc.storage_path);
    return { url };
  } catch {
    return { error: 'Errore generazione URL' };
  }
}

/**
 * Retry a single failed document: reset to 'caricato' so next processing run picks it up.
 */
export async function retryDocument(params: { documentId: string; caseId: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Fetch document and verify it's in error state
  const { data: doc } = await supabase
    .from('documents')
    .select('id, processing_status')
    .eq('id', params.documentId)
    .eq('case_id', params.caseId)
    .single();

  if (!doc) return { error: 'Documento non trovato' };
  if (doc.processing_status !== 'errore') {
    return { error: 'Il documento non è in stato di errore' };
  }

  // Reset to 'caricato'
  const { error } = await supabase
    .from('documents')
    .update({
      processing_status: 'caricato',
      processing_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.documentId);

  if (error) return { error: 'Errore durante il reset del documento' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'document.retried',
    entity_type: 'document',
    entity_id: params.documentId,
    metadata: { caseId: params.caseId },
  });

  return { success: true };
}

/** Valid document types matching the DB enum */
const VALID_DOCUMENT_TYPES = new Set([
  'cartella_clinica', 'referto_specialistico', 'esame_strumentale',
  'esame_laboratorio', 'lettera_dimissione', 'certificato',
  'perizia_precedente', 'spese_mediche', 'memoria_difensiva',
  'perizia_ctp', 'perizia_ctu', 'altro',
]);

/**
 * Update the document_type on an already-uploaded document.
 * Free action — no credits required.
 */
export async function updateDocumentType(params: { documentId: string; caseId: string; documentType: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Validate document type against known enum values
  if (!VALID_DOCUMENT_TYPES.has(params.documentType)) {
    return { error: 'Tipo documento non valido' };
  }

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const { error } = await supabase
    .from('documents')
    .update({
      document_type: params.documentType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.documentId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento tipo documento' };

  revalidateCase(params.caseId);
  return { success: true };
}

// --- OCR Pages ---

export interface DocumentPage {
  id: string;
  document_id: string;
  page_number: number;
  ocr_text: string | null;
  ocr_confidence: number | null;
  has_handwriting: string | null;
}

export async function getCaseDocumentPages(caseId: string): Promise<DocumentPage[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return [];

  const { data: docs } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId);

  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((d) => d.id);

  const allPages: Array<Record<string, unknown>> = [];
  for (let i = 0; i < docIds.length; i += 200) {
    const { data } = await supabase
      .from('pages')
      .select('id, document_id, page_number, ocr_text, ocr_confidence, has_handwriting')
      .in('document_id', docIds.slice(i, i + 200))
      .order('page_number', { ascending: true });
    if (data) allPages.push(...data);
  }

  return allPages as unknown as DocumentPage[];
}
