'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminUser } from '@/lib/admin';

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

const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

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
