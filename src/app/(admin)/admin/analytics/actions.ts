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

export interface AnalyticsData {
  casesLast30Days: Array<{ date: string; count: number }>;
  pipelineSuccessRate: { total: number; completed: number; failed: number; rate: number };
  avgProcessingTimeMinutes: number | null;
  avgRating: number | null;
  ratingCount: number;
  topErrors: Array<{ error: string; count: number }>;
  activeUsersLast7Days: number;
  casesByType: Array<{ type: string; count: number }>;
  casesByRole: Array<{ role: string; count: number }>;
}

export async function getAnalyticsData(): Promise<AnalyticsData> {
  await verifyAdmin();
  const admin = createAdminClient();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    casesResult,
    docsCompletedResult,
    docsFailedResult,
    docsAllResult,
    ratingsResult,
    errorsResult,
    auditResult,
    caseTypesResult,
    caseRolesResult,
  ] = await Promise.all([
    // Cases created last 30 days
    admin
      .from('cases')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: true }),

    // Completed documents (for pipeline success rate + avg time)
    admin
      .from('documents')
      .select('created_at, updated_at')
      .eq('processing_status', 'completato'),

    // Failed documents
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'errore'),

    // All processed documents
    admin
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('processing_status', ['completato', 'errore']),

    // Ratings
    admin.from('report_ratings').select('rating'),

    // Errors (top 5)
    admin
      .from('documents')
      .select('processing_error')
      .eq('processing_status', 'errore')
      .not('processing_error', 'is', null)
      .limit(200),

    // Active users last 7 days (from audit log)
    admin
      .from('audit_log')
      .select('user_id')
      .gte('created_at', sevenDaysAgo),

    // Cases by type
    admin.from('cases').select('case_type'),

    // Cases by role
    admin.from('cases').select('case_role'),
  ]);

  // Cases per day
  const casesPerDay = new Map<string, number>();
  for (const c of casesResult.data ?? []) {
    const day = (c.created_at as string).slice(0, 10);
    casesPerDay.set(day, (casesPerDay.get(day) ?? 0) + 1);
  }
  const casesLast30Days = Array.from(casesPerDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Pipeline success rate
  const totalProcessed = docsAllResult.count ?? 0;
  const completedCount = docsCompletedResult.data?.length ?? 0;
  const failedCount = docsFailedResult.count ?? 0;
  const pipelineSuccessRate = {
    total: totalProcessed,
    completed: completedCount,
    failed: failedCount,
    rate: totalProcessed > 0 ? (completedCount / totalProcessed) * 100 : 0,
  };

  // Avg processing time
  let avgProcessingTimeMinutes: number | null = null;
  if (docsCompletedResult.data && docsCompletedResult.data.length > 0) {
    const durations = docsCompletedResult.data
      .map((d) => {
        const start = new Date(d.created_at as string).getTime();
        const end = new Date(d.updated_at as string).getTime();
        return (end - start) / 1000 / 60; // minutes
      })
      .filter((d) => d > 0 && d < 60); // filter outliers
    if (durations.length > 0) {
      avgProcessingTimeMinutes = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
  }

  // Ratings
  const ratingsData = ratingsResult.data ?? [];
  const ratingCount = ratingsData.length;
  const avgRating = ratingCount > 0
    ? ratingsData.reduce((sum, r) => sum + (r.rating as number), 0) / ratingCount
    : null;

  // Top errors
  const errorCounts = new Map<string, number>();
  for (const doc of errorsResult.data ?? []) {
    const err = (doc.processing_error as string).slice(0, 100);
    errorCounts.set(err, (errorCounts.get(err) ?? 0) + 1);
  }
  const topErrors = Array.from(errorCounts.entries())
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Active users
  const uniqueUsers = new Set((auditResult.data ?? []).map((a) => a.user_id).filter(Boolean));
  const activeUsersLast7Days = uniqueUsers.size;

  // Cases by type
  const typeCounts = new Map<string, number>();
  for (const c of caseTypesResult.data ?? []) {
    const t = c.case_type as string;
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const casesByType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Cases by role
  const roleCounts = new Map<string, number>();
  for (const c of caseRolesResult.data ?? []) {
    const r = c.case_role as string;
    roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
  }
  const casesByRole = Array.from(roleCounts.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);

  return {
    casesLast30Days,
    pipelineSuccessRate,
    avgProcessingTimeMinutes,
    avgRating,
    ratingCount,
    topErrors,
    activeUsersLast7Days,
    casesByType,
    casesByRole,
  };
}
