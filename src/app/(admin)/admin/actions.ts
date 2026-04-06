'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin';
import { logger } from '@/lib/logger';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isAdminUser(user.email)) {
    throw new Error('Non autorizzato');
  }

  return user;
}

export async function getSystemStats() {
  await verifyAdmin();
  const admin = createAdminClient();

  const [usersResult, casesResult, documentsResult, eventsResult] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('cases').select('*', { count: 'exact', head: true }),
    admin.from('documents').select('*', { count: 'exact', head: true }),
    admin.from('events').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
  ]);

  return {
    totalUsers: usersResult.count ?? 0,
    totalCases: casesResult.count ?? 0,
    totalDocuments: documentsResult.count ?? 0,
    totalEvents: eventsResult.count ?? 0,
  };
}

const INTERMEDIATE_STATUSES = [
  'in_coda',
  'ocr_in_corso',
  'estrazione_in_corso',
  'validazione_in_corso',
];

const STUCK_THRESHOLD_MS = 30 * 60 * 1000;

function formatDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function timeAgo(isoDate: string, now: Date): string {
  const diffMs = now.getTime() - new Date(isoDate).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

export async function getProcessingDocuments() {
  await verifyAdmin();
  const admin = createAdminClient();
  const now = new Date();

  const { data } = await admin
    .from('documents')
    .select('id, file_name, file_type, file_size, processing_status, processing_error, updated_at, created_at, case_id')
    .in('processing_status', INTERMEDIATE_STATUSES)
    .order('updated_at', { ascending: true });

  if (!data || data.length === 0) return [];

  // Fetch associated case codes
  const caseIds = [...new Set(data.map((d) => d.case_id))];
  const { data: casesData } = await admin
    .from('cases')
    .select('id, code')
    .in('id', caseIds);

  const caseMap = new Map(casesData?.map((c) => [c.id, c.code]) ?? []);

  return data.map((doc) => {
    const elapsedMs = now.getTime() - new Date(doc.updated_at).getTime();
    const isStuck = elapsedMs > STUCK_THRESHOLD_MS;
    return {
      ...doc,
      caseCode: caseMap.get(doc.case_id) ?? 'N/A',
      isStuck,
      lastUpdateAgo: timeAgo(doc.updated_at, now),
      elapsedLabel: isStuck
        ? `${formatDuration(doc.updated_at, now.toISOString())} - Potenzialmente bloccato`
        : formatDuration(doc.created_at, now.toISOString()),
    };
  });
}

export async function getRecentErrors() {
  await verifyAdmin();
  const admin = createAdminClient();
  const now = new Date();

  const { data } = await admin
    .from('documents')
    .select('id, file_name, processing_status, processing_error, updated_at, case_id')
    .eq('processing_status', 'errore')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return [];

  const caseIds = [...new Set(data.map((d) => d.case_id))];
  const { data: casesData } = await admin
    .from('cases')
    .select('id, code')
    .in('id', caseIds);

  const caseMap = new Map(casesData?.map((c) => [c.id, c.code]) ?? []);

  return data.map((doc) => ({
    ...doc,
    caseCode: caseMap.get(doc.case_id) ?? 'N/A',
    updatedAgo: timeAgo(doc.updated_at, now),
  }));
}

export async function getRecentCompletions() {
  await verifyAdmin();
  const admin = createAdminClient();
  const now = new Date();

  const { data } = await admin
    .from('documents')
    .select('id, file_name, processing_status, updated_at, created_at, case_id')
    .eq('processing_status', 'completato')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return [];

  const caseIds = [...new Set(data.map((d) => d.case_id))];
  const { data: casesData } = await admin
    .from('cases')
    .select('id, code')
    .in('id', caseIds);

  const caseMap = new Map(casesData?.map((c) => [c.id, c.code]) ?? []);

  return data.map((doc) => ({
    ...doc,
    caseCode: caseMap.get(doc.case_id) ?? 'N/A',
    durationLabel: formatDuration(doc.created_at, doc.updated_at),
    completedAgo: timeAgo(doc.updated_at, now),
  }));
}

/**
 * Get cases stuck in processing (elaborazione/generazione_report) for admin reset.
 */
export async function getStuckCases() {
  await verifyAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('cases')
    .select('id, code, processing_stage, patient_initials, updated_at, user_id')
    .in('processing_stage', ['elaborazione', 'generazione_report', 'revisione_classificazione', 'revisione_anomalie'])
    .order('updated_at', { ascending: true });

  if (error) {
    logger.error('admin', `Failed to fetch stuck cases: ${error.message}`);
    return [];
  }

  return (data ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    processingStage: c.processing_stage as string,
    patientInitials: c.patient_initials as string | null,
    updatedAt: c.updated_at as string,
  }));
}

/**
 * Force-reset a stuck case back to idle or errore.
 */
export async function forceResetCase(caseId: string, targetStage: 'idle' | 'errore' = 'idle') {
  const user = await verifyAdmin();
  const admin = createAdminClient();

  const { data: caseRow, error: fetchError } = await admin
    .from('cases')
    .select('id, code, processing_stage')
    .eq('id', caseId)
    .single();

  if (fetchError || !caseRow) {
    return { success: false, error: 'Caso non trovato' };
  }

  const { error: updateError } = await admin
    .from('cases')
    .update({
      processing_stage: targetStage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (updateError) {
    logger.error('admin', `Failed to reset case ${caseId}: ${updateError.message}`);
    return { success: false, error: 'Errore durante il reset' };
  }

  logger.info('admin', `Case ${caseRow.code} force-reset from ${caseRow.processing_stage} to ${targetStage} by admin ${user.id}`);
  return { success: true };
}

/**
 * Force-reset ALL stuck cases back to idle.
 */
export async function forceResetAllStuckCases() {
  const user = await verifyAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('cases')
    .update({
      processing_stage: 'idle',
      updated_at: new Date().toISOString(),
    })
    .in('processing_stage', ['elaborazione', 'generazione_report', 'revisione_classificazione', 'revisione_anomalie'])
    .select('id, code');

  if (error) {
    logger.error('admin', `Failed to reset all stuck cases: ${error.message}`);
    return { success: false, count: 0 };
  }

  const count = data?.length ?? 0;
  logger.info('admin', `Force-reset ${count} stuck cases by admin ${user.id}`);
  return { success: true, count };
}

/**
 * Reset all data EXCEPT user accounts.
 * Deletes: events, anomalies, missing_documents, reports, pages,
 * event_images, documents, cases, audit_log.
 * Also clears Supabase Storage (uploaded files).
 */
export async function resetAllData() {
  const user = await verifyAdmin();
  const admin = createAdminClient();

  logger.info('admin', ` Reset all data requested by user ${user.id}`);

  // Delete in correct order (foreign key dependencies)
  await admin.from('event_images').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('anomalies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('missing_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('pages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('cases').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Clear storage bucket
  try {
    const { data: files } = await admin.storage.from('documents').list('', { limit: 1000 });
    if (files && files.length > 0) {
      // List all folders (user IDs)
      for (const folder of files) {
        if (folder.name) {
          const { data: userFiles } = await admin.storage.from('documents').list(folder.name, { limit: 10000 });
          if (userFiles && userFiles.length > 0) {
            const paths = userFiles.map((f) => `${folder.name}/${f.name}`);
            await admin.storage.from('documents').remove(paths);
          }
        }
      }
    }
  } catch (storageErr) {
    logger.error('admin', ` Storage cleanup error: ${storageErr instanceof Error ? storageErr.message : 'unknown'}`);
  }

  logger.info('admin', ' All data reset successfully');
  return { success: true };
}

export async function getAverageRating(): Promise<{ avg: number | null; count: number }> {
  await verifyAdmin();
  const admin = createAdminClient();

  const { data } = await admin
    .from('report_ratings')
    .select('rating');

  if (!data || data.length === 0) return { avg: null, count: 0 };

  const sum = data.reduce((acc, r) => acc + (r.rating as number), 0);
  return { avg: sum / data.length, count: data.length };
}

export interface RecentCosts {
  totalCostUSD: number;
  avgCostPerCase: number;
  casesWithCostData: number;
}

export async function getRecentCosts(): Promise<RecentCosts> {
  await verifyAdmin();
  const admin = createAdminClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data } = await admin
    .from('audit_log')
    .select('metadata')
    .eq('action', 'case.processing.completed')
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (!data || data.length === 0) {
    return { totalCostUSD: 0, avgCostPerCase: 0, casesWithCostData: 0 };
  }

  let totalCost = 0;
  let casesWithCost = 0;

  for (const row of data) {
    const meta = row.metadata as Record<string, unknown> | null;
    const apiUsage = meta?.apiUsage as Record<string, unknown> | undefined;
    const cost = apiUsage?.totalCostUSD;
    if (typeof cost === 'number' && cost > 0) {
      totalCost += cost;
      casesWithCost++;
    }
  }

  return {
    totalCostUSD: totalCost,
    avgCostPerCase: casesWithCost > 0 ? totalCost / casesWithCost : 0,
    casesWithCostData: casesWithCost,
  };
}

export async function getAuditLogs(page: number = 1) {
  await verifyAdmin();
  const admin = createAdminClient();

  const limit = 50;
  const offset = (page - 1) * limit;

  const [{ data, count }, { data: profilesData }] = await Promise.all([
    admin
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    admin
      .from('profiles')
      .select('id, email'),
  ]);

  const userMap = new Map(profilesData?.map((p) => [p.id, p.email]) ?? []);

  const logs = (data ?? []).map((log) => ({
    ...log,
    userEmail: log.user_id ? userMap.get(log.user_id) ?? 'N/A' : 'system',
  }));

  return {
    logs,
    total: count ?? 0,
    page,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  casesCount: number;
  subscriptionPlan: string | null;
  isActive: boolean;
}

export async function getUsers(): Promise<AdminUser[]> {
  await verifyAdmin();
  const admin = createAdminClient();

  // Fetch all profiles
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, email, full_name, subscription_plan, is_active')
    .order('created_at', { ascending: false });

  if (profilesError || !profiles) {
    logger.error('admin', `Failed to fetch users: ${profilesError?.message ?? 'no data'}`);
    return [];
  }

  // Count cases per user
  const { data: casesData } = await admin
    .from('cases')
    .select('user_id');

  const casesCountMap = new Map<string, number>();
  for (const c of casesData ?? []) {
    const uid = c.user_id as string;
    casesCountMap.set(uid, (casesCountMap.get(uid) ?? 0) + 1);
  }

  return profiles.map((p) => ({
    id: p.id as string,
    email: p.email as string,
    fullName: (p.full_name ?? null) as string | null,
    casesCount: casesCountMap.get(p.id as string) ?? 0,
    subscriptionPlan: (p.subscription_plan ?? null) as string | null,
    isActive: (p.is_active ?? true) as boolean,
  }));
}

export async function toggleUserActive(userId: string): Promise<{ success: boolean; isActive: boolean }> {
  const adminUser = await verifyAdmin();
  const admin = createAdminClient();

  // Fetch current status
  const { data: profile, error: fetchError } = await admin
    .from('profiles')
    .select('is_active')
    .eq('id', userId)
    .single();

  if (fetchError || !profile) {
    throw new Error('Utente non trovato');
  }

  const newIsActive = !(profile.is_active as boolean);

  const { error: updateError } = await admin
    .from('profiles')
    .update({ is_active: newIsActive, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`Aggiornamento fallito: ${updateError.message}`);
  }

  logger.info('admin', `User ${userId} toggled to is_active=${newIsActive} by admin ${adminUser.id}`);

  // Audit log
  await admin.from('audit_log').insert({
    user_id: adminUser.id,
    action: newIsActive ? 'admin.user.activated' : 'admin.user.deactivated',
    entity_type: 'profile',
    entity_id: userId,
    metadata: { newIsActive },
  });

  return { success: true, isActive: newIsActive };
}
