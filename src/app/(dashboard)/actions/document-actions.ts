'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedUrl } from '@/lib/supabase/storage';
import { revalidateCase } from '@/lib/cache';

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
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Non autenticato' };
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

  const { error } = await supabase
    .from('documents')
    .insert({
      case_id: params.caseId,
      file_name: params.fileName,
      file_type: params.fileType,
      file_size: params.fileSize,
      storage_path: params.storagePath,
      document_type: params.documentType ?? 'altro',
      processing_status: 'caricato',
    });

  if (error) {
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

  // Get pages with images
  const { data: pages } = await supabase
    .from('pages')
    .select('document_id, image_path')
    .in('document_id', docIds)
    .not('image_path', 'is', null);

  if (!pages || pages.length === 0) return {};

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

  const { data: pages } = await supabase
    .from('pages')
    .select('id, document_id, page_number, ocr_text, ocr_confidence, has_handwriting')
    .in('document_id', docIds)
    .order('page_number', { ascending: true });

  return (pages ?? []) as DocumentPage[];
}
