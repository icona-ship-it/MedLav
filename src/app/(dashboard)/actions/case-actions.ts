'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { CASE_TYPES } from '@/lib/constants';

export async function createCase(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Non autenticato' };
  }

  const rateCheck = checkRateLimit({ key: `create-case:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  const caseType = formData.get('caseType') as CaseType;
  const caseRole = formData.get('caseRole') as CaseRole;
  const caseTypesRaw = formData.get('caseTypes') as string;
  const patientInitials = formData.get('patientInitials') as string;
  const practiceReference = formData.get('practiceReference') as string;
  const notes = formData.get('notes') as string;
  const periziaMetadataRaw = formData.get('periziaMetadata') as string;

  if (!caseType || !caseRole) {
    return { error: 'Tipo caso e tipo incarico sono obbligatori' };
  }

  // Parse and validate caseTypes (multi-select, 1-3 valid types)
  const validCaseTypeValues: Set<string> = new Set(CASE_TYPES.map((t) => t.value));
  let caseTypes: string[] = [caseType];
  if (caseTypesRaw) {
    try {
      const parsed = JSON.parse(caseTypesRaw) as unknown;
      if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= 3) {
        const allValid = parsed.every((v): v is string => typeof v === 'string' && validCaseTypeValues.has(v));
        if (allValid) {
          caseTypes = parsed;
        }
      }
    } catch {
      // Fallback to single caseType
    }
  }

  // Parse optional perizia metadata
  let periziaMetadata: PeriziaMetadata | null = null;
  if (periziaMetadataRaw) {
    try {
      const parsed = JSON.parse(periziaMetadataRaw) as unknown;
      if (parsed && typeof parsed === 'object') {
        periziaMetadata = parsed as PeriziaMetadata;
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  // Generate unique case code with retry on collision
  const year = new Date().getFullYear();
  const prefix = `CASO-${year}-`;

  // Find the highest existing code number for this user
  const { data: latestCase } = await supabase
    .from('cases')
    .select('code')
    .eq('user_id', user.id)
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNumber = 1;
  if (latestCase?.code) {
    const lastPart = (latestCase.code as string).split('-').pop();
    const parsed = parseInt(lastPart ?? '0', 10);
    if (!isNaN(parsed)) nextNumber = parsed + 1;
  }

  // Try inserting with retry on unique violation (up to 3 attempts)
  let newCaseId: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = `${prefix}${(nextNumber + attempt).toString().padStart(3, '0')}`;

    const { data: newCase, error } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        code,
        case_type: caseTypes[0],
        case_types: caseTypes,
        case_role: caseRole,
        patient_initials: patientInitials || null,
        practice_reference: practiceReference || null,
        notes: notes || null,
        perizia_metadata: periziaMetadata,
        status: 'bozza',
        document_count: 0,
      })
      .select('id')
      .single();

    if (!error && newCase) {
      newCaseId = newCase.id as string;
      break;
    }

    // If it's a unique violation, retry with next number
    if (error?.code === '23505') {
      console.error(`[createCase] Code collision on attempt ${attempt + 1}, retrying`);
      continue;
    }

    // Any other error, bail out
    console.error(`[createCase] Failed for user ${user.id}: ${error.message} (code: ${error.code})`);
    return { error: 'Errore nella creazione del caso. Riprova.' };
  }

  if (!newCaseId) {
    return { error: 'Errore nella creazione del caso. Riprova.' };
  }

  redirect(`/cases/${newCaseId}`);
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

export async function updateCase(params: {
  caseId: string;
  caseType?: CaseType;
  caseTypes?: CaseType[];
  caseRole?: CaseRole;
  patientInitials?: string | null;
  practiceReference?: string | null;
  notes?: string | null;
  periziaMetadata?: PeriziaMetadata | null;
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
  if (params.caseTypes !== undefined) updateFields.case_types = params.caseTypes;
  if (params.caseRole !== undefined) updateFields.case_role = params.caseRole;
  if (params.patientInitials !== undefined) updateFields.patient_initials = params.patientInitials;
  if (params.practiceReference !== undefined) updateFields.practice_reference = params.practiceReference;
  if (params.notes !== undefined) updateFields.notes = params.notes;
  if (params.periziaMetadata !== undefined) updateFields.perizia_metadata = params.periziaMetadata;

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
