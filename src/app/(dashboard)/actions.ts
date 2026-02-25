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

export async function getCases() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('cases')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

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
      document_type: 'altro',
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
