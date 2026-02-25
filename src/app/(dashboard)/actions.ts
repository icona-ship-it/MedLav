'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateCaseCode } from '@/lib/case-code';
import type { CaseType, CaseRole } from '@/types';

export async function createCase(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Non autenticato' };
  }

  const caseType = formData.get('caseType') as CaseType;
  const caseRole = formData.get('caseRole') as CaseRole;
  const patientInitials = formData.get('patientInitials') as string;
  const practiceReference = formData.get('practiceReference') as string;
  const notes = formData.get('notes') as string;

  if (!caseType || !caseRole) {
    return { error: 'Tipo caso e tipo incarico sono obbligatori' };
  }

  // Count existing cases to generate sequential code
  const { count } = await supabase
    .from('cases')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const code = generateCaseCode(count ?? 0);

  const { data: newCase, error } = await supabase
    .from('cases')
    .insert({
      user_id: user.id,
      code,
      case_type: caseType,
      case_role: caseRole,
      patient_initials: patientInitials || null,
      practice_reference: practiceReference || null,
      notes: notes || null,
      status: 'bozza',
      document_count: 0,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[createCase] Failed for user ${user.id}: ${error.message} (code: ${error.code})`);
    return { error: 'Errore nella creazione del caso. Riprova.' };
  }

  redirect(`/cases/${newCase.id}`);
}

export async function getCases(status?: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('cases')
    .select('*')
    .eq('user_id', user.id);

  if (status) {
    query = query.eq('status', status);
  }

  const { data } = await query.order('created_at', { ascending: false });

  return data ?? [];
}

export async function getCase(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  return data;
}

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
 * Fetch all extracted events for a case, ordered chronologically.
 */
export async function getCaseEvents(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .order('order_number', { ascending: true });

  return data ?? [];
}

/**
 * Fetch all detected anomalies for a case.
 */
export async function getCaseAnomalies(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('anomalies')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  return data ?? [];
}

/**
 * Fetch all missing document alerts for a case.
 */
export async function getCaseMissingDocs(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('missing_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  return data ?? [];
}

/**
 * Fetch the latest report for a case.
 */
export async function getCaseReport(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('reports')
    .select('*')
    .eq('case_id', caseId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Update an event (edit fields, add expert notes).
 * Verifies case ownership via RLS.
 */
export async function updateEvent(params: {
  eventId: string;
  caseId: string;
  title?: string;
  description?: string;
  eventType?: string;
  eventDate?: string;
  datePrecision?: string;
  sourceType?: string;
  diagnosis?: string | null;
  doctor?: string | null;
  facility?: string | null;
  expertNotes?: string | null;
  requiresVerification?: boolean;
}) {
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

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.title !== undefined) updateFields.title = params.title;
  if (params.description !== undefined) updateFields.description = params.description;
  if (params.eventType !== undefined) updateFields.event_type = params.eventType;
  if (params.eventDate !== undefined) updateFields.event_date = params.eventDate;
  if (params.datePrecision !== undefined) updateFields.date_precision = params.datePrecision;
  if (params.sourceType !== undefined) updateFields.source_type = params.sourceType;
  if (params.diagnosis !== undefined) updateFields.diagnosis = params.diagnosis;
  if (params.doctor !== undefined) updateFields.doctor = params.doctor;
  if (params.facility !== undefined) updateFields.facility = params.facility;
  if (params.expertNotes !== undefined) updateFields.expert_notes = params.expertNotes;
  if (params.requiresVerification !== undefined) updateFields.requires_verification = params.requiresVerification;

  const { error } = await supabase
    .from('events')
    .update(updateFields)
    .eq('id', params.eventId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento evento' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'event.updated',
    entity_type: 'event',
    entity_id: params.eventId,
    metadata: { caseId: params.caseId, fields: Object.keys(updateFields) },
  });

  return { success: true };
}

/**
 * Soft-delete an event (zero discard policy — never hard delete).
 */
export async function deleteEvent(params: { eventId: string; caseId: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const { error } = await supabase
    .from('events')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', params.eventId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore eliminazione evento' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'event.deleted',
    entity_type: 'event',
    entity_id: params.eventId,
    metadata: { caseId: params.caseId },
  });

  return { success: true };
}

/**
 * Add a manual event created by the expert.
 */
export async function addManualEvent(params: {
  caseId: string;
  eventDate: string;
  datePrecision: string;
  eventType: string;
  title: string;
  description: string;
  sourceType: string;
  diagnosis?: string | null;
  doctor?: string | null;
  facility?: string | null;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Get the current max order number
  const { data: lastEvent } = await supabase
    .from('events')
    .select('order_number')
    .eq('case_id', params.caseId)
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (lastEvent?.order_number ?? 0) + 1;

  const { data: newEvent, error } = await supabase
    .from('events')
    .insert({
      case_id: params.caseId,
      order_number: nextOrder,
      event_date: params.eventDate,
      date_precision: params.datePrecision,
      event_type: params.eventType,
      title: params.title,
      description: params.description,
      source_type: params.sourceType,
      diagnosis: params.diagnosis ?? null,
      doctor: params.doctor ?? null,
      facility: params.facility ?? null,
      confidence: 100,
      requires_verification: false,
      reliability_notes: 'Evento aggiunto manualmente dal perito',
    })
    .select('id')
    .single();

  if (error) return { error: 'Errore creazione evento' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'event.created_manual',
    entity_type: 'event',
    entity_id: newEvent.id,
    metadata: { caseId: params.caseId },
  });

  return { success: true, eventId: newEvent.id };
}

/**
 * Update report status (bozza → in_revisione → definitivo).
 * Creating a new version if already definitivo.
 */
export async function updateReportStatus(params: {
  caseId: string;
  reportId: string;
  newStatus: string;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const { error } = await supabase
    .from('reports')
    .update({
      report_status: params.newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.reportId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento stato report' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'report.status_changed',
    entity_type: 'report',
    entity_id: params.reportId,
    metadata: { caseId: params.caseId, newStatus: params.newStatus },
  });

  return { success: true };
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

  return { success: true };
}

/**
 * Delete a case entirely: remove all files from Storage, delete case from DB.
 * DB cascade handles documents, pages, events, anomalies, missing_documents, reports.
 * Blocks if any document is currently being processed.
 */
export async function deleteCase(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, code')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Check for documents in processing
  const { data: processingDocs } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId)
    .in('processing_status', ['in_coda', 'ocr_in_corso', 'estrazione_in_corso', 'validazione_in_corso']);

  if (processingDocs && processingDocs.length > 0) {
    return { error: 'Impossibile eliminare: alcuni documenti sono in elaborazione' };
  }

  // Audit log BEFORE delete (cascade will remove related data)
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'case.deleted',
    entity_type: 'case',
    entity_id: caseId,
    metadata: { caseCode: caseData.code },
  });

  // Remove all files from Storage for this case (documents + images)
  const admin = createAdminClient();
  const storagePath = `${user.id}/${caseId}`;
  const { data: fileList } = await admin.storage.from('documents').list(storagePath, { limit: 1000 });

  if (fileList && fileList.length > 0) {
    const filePaths = fileList.map((f) => `${storagePath}/${f.name}`);
    await admin.storage.from('documents').remove(filePaths);
  }

  // Also remove images subdirectory
  const { data: imageList } = await admin.storage.from('documents').list(`${storagePath}/images`, { limit: 1000 });
  if (imageList && imageList.length > 0) {
    const imagePaths = imageList.map((f) => `${storagePath}/images/${f.name}`);
    await admin.storage.from('documents').remove(imagePaths);
  }

  // Delete case from DB (cascade handles everything)
  const { error } = await supabase
    .from('cases')
    .delete()
    .eq('id', caseId)
    .eq('user_id', user.id);

  if (error) return { error: 'Errore eliminazione caso' };

  return { success: true };
}

/**
 * Update editable fields on a case.
 */
export async function updateCase(params: {
  caseId: string;
  caseType?: CaseType;
  caseRole?: CaseRole;
  patientInitials?: string | null;
  practiceReference?: string | null;
  notes?: string | null;
}) {
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

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.caseType !== undefined) updateFields.case_type = params.caseType;
  if (params.caseRole !== undefined) updateFields.case_role = params.caseRole;
  if (params.patientInitials !== undefined) updateFields.patient_initials = params.patientInitials;
  if (params.practiceReference !== undefined) updateFields.practice_reference = params.practiceReference;
  if (params.notes !== undefined) updateFields.notes = params.notes;

  const { error } = await supabase
    .from('cases')
    .update(updateFields)
    .eq('id', params.caseId)
    .eq('user_id', user.id);

  if (error) return { error: 'Errore aggiornamento caso' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'case.updated',
    entity_type: 'case',
    entity_id: params.caseId,
    metadata: { fields: Object.keys(updateFields) },
  });

  return { success: true };
}

/**
 * Update case status (archive / restore).
 * Valid transitions: any → archiviato, archiviato → bozza.
 */
export async function updateCaseStatus(params: { caseId: string; newStatus: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership and get current status
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, status')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Validate transitions
  const currentStatus = caseData.status as string;
  const { newStatus } = params;

  const isValidTransition =
    (newStatus === 'archiviato') ||
    (currentStatus === 'archiviato' && newStatus === 'bozza');

  if (!isValidTransition) {
    return { error: 'Transizione di stato non valida' };
  }

  const { error } = await supabase
    .from('cases')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', params.caseId)
    .eq('user_id', user.id);

  if (error) return { error: 'Errore aggiornamento stato caso' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'case.status_changed',
    entity_type: 'case',
    entity_id: params.caseId,
    metadata: { previousStatus: currentStatus, newStatus },
  });

  return { success: true };
}

/**
 * Fetch page images for all documents in a case.
 * Returns a map of documentId → image storage paths.
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
 * Fetch event-level images for a case.
 * Uses the event_images junction table (linked by sourcePages).
 * Falls back to document-level images for events without sourcePages.
 * Returns a map of eventId → image storage paths.
 */
export async function getCaseEventImages(caseId: string): Promise<Record<string, string[]>> {
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

  // Get events for this case
  const { data: events } = await supabase
    .from('events')
    .select('id, document_id, source_pages')
    .eq('case_id', caseId)
    .eq('is_deleted', false);

  if (!events || events.length === 0) return {};

  const eventIds = events.map((e) => e.id);

  // Get event_images links
  const { data: eventImagesRaw } = await supabase
    .from('event_images')
    .select('event_id, image_path')
    .in('event_id', eventIds);

  const result: Record<string, string[]> = {};

  // Group by event_id
  if (eventImagesRaw && eventImagesRaw.length > 0) {
    for (const row of eventImagesRaw) {
      const eventId = row.event_id as string;
      if (!result[eventId]) {
        result[eventId] = [];
      }
      result[eventId].push(row.image_path as string);
    }
  }

  // Fallback: for events without event_images, use document-level images
  const eventsWithoutImages = events.filter(
    (e) => !result[e.id as string] && e.document_id,
  );

  if (eventsWithoutImages.length > 0) {
    const docIds = [...new Set(eventsWithoutImages.map((e) => e.document_id as string))];

    const { data: pages } = await supabase
      .from('pages')
      .select('document_id, image_path')
      .in('document_id', docIds)
      .not('image_path', 'is', null);

    if (pages && pages.length > 0) {
      // Build docId → paths map
      const docImageMap: Record<string, string[]> = {};
      for (const page of pages) {
        const docId = page.document_id as string;
        const paths = (page.image_path as string).split(';').filter(Boolean);
        if (!docImageMap[docId]) {
          docImageMap[docId] = [];
        }
        docImageMap[docId].push(...paths);
      }

      // Assign to events
      for (const event of eventsWithoutImages) {
        const docId = event.document_id as string;
        if (docImageMap[docId] && docImageMap[docId].length > 0) {
          result[event.id as string] = docImageMap[docId];
        }
      }
    }
  }

  return result;
}
