'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
