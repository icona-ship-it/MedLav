'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CaseType, CaseRole, PeriziaMetadata } from '@/types';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { CASE_TYPES } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { getSelectableSections } from '@/services/synthesis/section-catalog';
import { revalidateCase, revalidateCases } from '@/lib/cache';
import { isEmptyOrValidItalianDate } from '@/lib/validators/date-format';
import { z } from 'zod';
import {
  ALL_MODULE_IDS,
  moduleToRole,
  moduleToCaseTypes,
  moduleToPipelineMode,
  moduleToCategory,
} from '@/types/modules';
import type { ModuleId } from '@/types/modules';

// --- Zod Schemas ---

const validCaseTypes = CASE_TYPES.map((t) => t.value);

const caseTypeSchema = z.enum(validCaseTypes as [string, ...string[]]);
const caseRoleSchema = z.enum(['ctu', 'ctp', 'stragiudiziale']);
const caseStatusSchema = z.enum(['bozza', 'in_revisione', 'definitivo', 'archiviato']);
const moduleIdSchema = z.enum(ALL_MODULE_IDS as unknown as [string, ...string[]]);

/**
 * Date destinate all'intestazione formale della perizia (dataIncarico, termini...).
 * Vuoto/assente = valido (il form resta facoltativo); se valorizzata deve essere
 * una data reale in formato GG/MM/AAAA o GG.MM.AAAA — un refuso tipo "15/13/2025"
 * non deve mai finire in una perizia depositata in tribunale.
 */
const DATE_FORMAT_ERROR = 'Data non valida: usa il formato GG/MM/AAAA (es. 15/01/2025)';
const headerDateSchema = z.string().max(20)
  .refine((s) => isEmptyOrValidItalianDate(s), { message: DATE_FORMAT_ERROR });

const periziaMetadataSchema = z.object({
  patientFullName: z.string().max(200).optional(),
  patientDateOfBirth: z.string().max(40).optional(),
  patientAddress: z.string().max(300).optional(),
  patientFiscalCode: z.string().max(20).optional(),
  patientPhone: z.string().max(40).optional(),
  specialita: z.string().max(200).optional(),
  alboNumber: z.string().max(80).optional(),
  ctuEmail: z.string().max(200).optional(),
  ctuPec: z.string().max(200).optional(),
  tribunale: z.string().max(200).optional(),
  sezione: z.string().max(200).optional(),
  rgNumber: z.string().max(50).optional(),
  tipoProcedimento: z.string().max(200).optional(),
  judgeName: z.string().max(100).optional(),
  giudiceQualifica: z.string().max(60).optional(),
  ctuName: z.string().max(100).optional(),
  ctuTitle: z.string().max(200).optional(),
  collaboratoreName: z.string().max(100).optional(),
  collaboratoreTitle: z.string().max(200).optional(),
  coCtuName: z.string().max(100).optional(),
  coCtuTitle: z.string().max(200).optional(),
  oggettoIncarico: z.string().max(300).optional(),
  ctpRicorrente: z.string().max(100).optional(),
  ctpResistente: z.string().max(100).optional(),
  parteRicorrente: z.string().max(200).optional(),
  parteResistente: z.string().max(200).optional(),
  dataIncarico: headerDateSchema.optional(),
  dataOperazioni: headerDateSchema.optional(),
  dataDeposito: headerDateSchema.optional(),
  termineBozza: headerDateSchema.optional(),
  termineOsservazioni: headerDateSchema.optional(),
  provvedimentiOrdinanza: z.string().max(3000).optional(),
  quesiti: z.array(z.string().max(2000)).max(20).optional(),
  speseMediche: z.string().max(5000).optional(),
  esameObiettivo: z.string().max(10000).optional(),
  fondoSpese: z.string().max(100).optional(),
  // Anamnesi (perizie RC medico-legali — compilata dal perito)
  ilFattoEStoriaClinica: z.string().max(20000).optional(),
  anamnesiFamiliare: z.string().max(5000).optional(),
  anamnesiFisiologica: z.string().max(5000).optional(),
  pesoKg: z.number().positive().max(500).optional(),
  altezzaCm: z.number().positive().max(300).optional(),
  anamnesiPatologicaRemota: z.string().max(10000).optional(),
  anamnesiPatologicaProssima: z.string().max(10000).optional(),
  anamnesiFarmacologica: z.string().max(5000).optional(),
  anamnesiLavorativa: z.string().max(5000).optional(),
  excludedReportSections: z.array(z.string().max(80)).max(50).optional(),
  ambitoPenale: z.boolean().optional(),
  decesso: z.boolean().optional(),
}).strict().nullable().optional();

const createCaseSchema = z.object({
  caseType: caseTypeSchema.optional(),
  caseRole: caseRoleSchema.optional(),
  caseTypes: z.array(caseTypeSchema).min(1).max(7).optional(),
  moduleId: moduleIdSchema.optional(),
  patientInitials: z.string().max(10).optional(),
  practiceReference: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  periziaMetadata: periziaMetadataSchema,
});

const updateCaseSchema = z.object({
  caseId: z.string().uuid(),
  caseType: caseTypeSchema.optional(),
  caseTypes: z.array(caseTypeSchema).min(1).max(7).optional(),
  caseRole: caseRoleSchema.optional(),
  patientInitials: z.string().max(10).nullable().optional(),
  practiceReference: z.string().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  periziaMetadata: periziaMetadataSchema,
});

const updateCaseStatusSchema = z.object({
  caseId: z.string().uuid(),
  newStatus: caseStatusSchema,
});

const deleteCaseSchema = z.string().uuid();

/**
 * Se la validazione fallisce per una data di intestazione malformata, restituisce
 * il messaggio italiano specifico (user-friendly); altrimenti null → messaggio generico.
 */
function firstDateIssueMessage(error: z.ZodError): string | null {
  const issue = error.issues.find((i) => i.message === DATE_FORMAT_ERROR);
  return issue ? issue.message : null;
}

export async function createCase(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Non autenticato' };
  }

  const rateCheck = await checkRateLimit({ key: `create-case:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  // Parse and validate all form inputs with Zod
  let parsedCaseTypes: string[] | undefined;
  try {
    const raw = formData.get('caseTypes') as string | null;
    parsedCaseTypes = raw ? (JSON.parse(raw) as unknown as string[]) : undefined;
  } catch {
    // Fallback — validated below
  }

  let parsedPeriziaMetadata: PeriziaMetadata | null | undefined;
  try {
    const raw = formData.get('periziaMetadata') as string | null;
    parsedPeriziaMetadata = raw ? (JSON.parse(raw) as unknown as PeriziaMetadata) : undefined;
  } catch {
    // Ignore invalid JSON
  }

  const validated = createCaseSchema.safeParse({
    caseType: formData.get('caseType') || undefined,
    caseRole: formData.get('caseRole') || undefined,
    caseTypes: parsedCaseTypes,
    moduleId: formData.get('moduleId') || undefined,
    patientInitials: formData.get('patientInitials') || undefined,
    practiceReference: formData.get('practiceReference') || undefined,
    notes: formData.get('notes') || undefined,
    periziaMetadata: parsedPeriziaMetadata,
  });

  if (!validated.success) {
    return {
      error: firstDateIssueMessage(validated.error)
        ?? 'Dati non validi. Verifica tipo caso e tipo incarico.',
    };
  }

  const { patientInitials, practiceReference, notes, periziaMetadata } = validated.data;

  // Derive role, type(s), and pipeline mode from module or legacy fields
  let caseRole: string;
  let caseType: string;
  let caseTypes: string[];
  let moduleIdValue: ModuleId | undefined;
  let moduleCategoryValue: number | undefined;
  let pipelineModeValue: string = 'full';

  if (validated.data.moduleId) {
    const mid = validated.data.moduleId as ModuleId;
    moduleIdValue = mid;
    caseRole = moduleToRole(mid) ?? 'ctu';
    const legacyTypes = moduleToCaseTypes(mid);
    caseType = legacyTypes[0] ?? 'generica';
    caseTypes = legacyTypes.length > 0 ? legacyTypes : ['generica'];
    pipelineModeValue = moduleToPipelineMode(mid);
    moduleCategoryValue = moduleToCategory(mid).id;
  } else {
    // Legacy flow — require caseType and caseRole
    if (!validated.data.caseType || !validated.data.caseRole) {
      return { error: 'Dati non validi. Verifica tipo caso e tipo incarico.' };
    }
    caseRole = validated.data.caseRole;
    caseType = validated.data.caseType;
    caseTypes = validated.data.caseTypes ?? [caseType];
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
        ...(moduleIdValue ? {
          module_id: moduleIdValue,
          module_category: moduleCategoryValue,
          pipeline_mode: pipelineModeValue,
        } : {
          // Auto-derive pipeline_mode from case_type for legacy case creation (no module selected)
          ...(caseType === 'analisi_spese_mediche' ? { pipeline_mode: 'expenses_only' } : {}),
        }),
      })
      .select('id')
      .single();

    if (!error && newCase) {
      newCaseId = newCase.id as string;
      break;
    }

    // If it's a unique violation, retry with next number
    if (error?.code === '23505') {
      logger.warn('createCase', `Code collision on attempt ${attempt + 1}, retrying`);
      continue;
    }

    // Any other error, bail out
    logger.error('createCase', 'Failed to create case', { userId: user.id, code: error.code });
    return { error: 'Errore nella creazione del caso. Riprova.' };
  }

  if (!newCaseId) {
    return { error: 'Errore nella creazione del caso. Riprova.' };
  }

  revalidateCases(user.id);
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
  const validated = updateCaseSchema.safeParse(params);
  if (!validated.success) {
    return { error: firstDateIssueMessage(validated.error) ?? 'Dati non validi' };
  }

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

  revalidateCase(params.caseId);
  return { success: true };
}

export async function updateCaseStatus(params: { caseId: string; newStatus: string }) {
  const validated = updateCaseStatusSchema.safeParse(params);
  if (!validated.success) return { error: 'Dati non validi' };

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

  revalidateCase(params.caseId);
  return { success: true };
}

export async function deleteCase(caseId: string) {
  const validatedId = deleteCaseSchema.safeParse(caseId);
  if (!validatedId.success) return { error: 'ID caso non valido' };

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
    .in('processing_status', ['in_coda', 'ocr_in_corso', 'classificazione_completata', 'estrazione_in_corso', 'validazione_in_corso']);

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

  revalidateCases(user.id);
  return { success: true };
}

/** I 6 campi del professionista prefillabili dall'ultimo caso. MAI dati del paziente. */
const PERITO_DEFAULT_FIELDS = [
  'ctuName', 'ctuTitle', 'specialita', 'alboNumber', 'ctuEmail', 'ctuPec',
] as const;

export type PeritoDefaults = Partial<Record<(typeof PERITO_DEFAULT_FIELDS)[number], string>>;

/**
 * Dati del professionista (nome, qualifica, specialità, albo, email, PEC) presi
 * dall'ULTIMO caso dell'utente che li ha valorizzati, per prefillare il form
 * perizia di un nuovo caso (oggi il perito li ricompila a mano a ogni caso).
 *
 * Senza migration (debt journal Drizzle): legge `cases.perizia_metadata` con
 * whitelist rigorosa dei SOLI 6 campi del perito — MAI dati del paziente
 * (GDPR Art. 9). Ownership garantita da filtro user_id + RLS.
 */
export async function getLastPeritoDefaults(): Promise<{ defaults: PeritoDefaults | null }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { defaults: null };

  const { data, error } = await supabase
    .from('cases')
    .select('perizia_metadata')
    .eq('user_id', user.id)
    .not('perizia_metadata->>ctuName', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('getLastPeritoDefaults', 'Query failed', { userId: user.id, code: error.code });
    return { defaults: null };
  }

  const metadata = (data?.perizia_metadata ?? null) as Record<string, unknown> | null;
  if (!metadata) return { defaults: null };

  // Whitelist default-deny: only the 6 professional fields, strings only.
  const defaults: PeritoDefaults = {};
  for (const field of PERITO_DEFAULT_FIELDS) {
    const value = metadata[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      defaults[field] = value.slice(0, 200);
    }
  }

  return { defaults: Object.keys(defaults).length > 0 ? defaults : null };
}

/**
 * Elenco delle sezioni selezionabili per il report di un caso (selettore
 * "Sezioni del report" nel form info-perizia). Restituisce id + titolo + flag
 * mandatory in base a ruolo/modulo del caso.
 */
export async function getReportSectionOptions(
  caseId: string,
): Promise<{ sections: Array<{ id: string; title: string; mandatory: boolean }>; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sections: [], error: 'Non autenticato' };

  const { data: caseRow } = await supabase
    .from('cases')
    .select('case_role, module_id, perizia_metadata')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();
  if (!caseRow) return { sections: [], error: 'Caso non trovato' };

  const ambitoPenale = (caseRow.perizia_metadata as PeriziaMetadata | null)?.ambitoPenale ?? false;
  const sections = getSelectableSections(
    (caseRow.case_role as CaseRole) ?? 'ctu',
    (caseRow.module_id as string | null) ?? undefined,
    ambitoPenale,
  );
  return { sections };
}

/**
 * Salva SOLO le sezioni del report da escludere (selettore "Sezioni del report"),
 * con merge sicuro nel perizia_metadata esistente. Usato dal pannello nello step
 * Elaborazione, dove il resto del form perizia potrebbe non essere mai stato aperto:
 * legge il metadata corrente e sovrascrive il solo campo excludedReportSections.
 */
export async function updateReportSectionExclusions(
  caseId: string,
  excludedSectionIds: string[],
): Promise<{ success: boolean; error?: string }> {
  const parsed = z
    .object({
      caseId: z.string().min(1),
      excludedSectionIds: z.array(z.string().max(80)).max(50),
    })
    .safeParse({ caseId, excludedSectionIds });
  if (!parsed.success) return { success: false, error: 'Dati non validi' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Non autenticato' };

  // Read-modify-write con verifica ownership: non sovrascrivere il resto del metadata.
  const { data: caseRow } = await supabase
    .from('cases')
    .select('perizia_metadata')
    .eq('id', parsed.data.caseId)
    .eq('user_id', user.id)
    .single();
  if (!caseRow) return { success: false, error: 'Caso non trovato' };

  const current = (caseRow.perizia_metadata as Record<string, unknown> | null) ?? {};
  const merged = { ...current, excludedReportSections: parsed.data.excludedSectionIds };

  const { error } = await supabase
    .from('cases')
    .update({ perizia_metadata: merged, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.caseId)
    .eq('user_id', user.id);
  if (error) return { success: false, error: 'Errore salvataggio sezioni' };

  revalidateCase(parsed.data.caseId);
  return { success: true };
}
