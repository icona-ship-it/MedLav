import { createClient } from '@/lib/supabase/server';

/**
 * Load all case data needed for export.
 * Verifies auth and ownership.
 * Returns null if unauthorized or not found.
 */
export async function loadCaseDataForExport(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: caseRow } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseRow) return null;

  const [eventsRes, anomaliesRes, missingRes, reportRes] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('case_id', caseId)
      .eq('is_deleted', false)
      .order('order_number', { ascending: true }),
    supabase
      .from('anomalies')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true }),
    supabase
      .from('missing_documents')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true }),
    supabase
      .from('reports')
      .select('*')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    caseData: caseRow,
    events: eventsRes.data ?? [],
    anomalies: anomaliesRes.data ?? [],
    missingDocs: missingRes.data ?? [],
    report: reportRes.data,
  };
}
