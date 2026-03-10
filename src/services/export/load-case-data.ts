import { createClient } from '@/lib/supabase/server';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';

/**
 * Load all case data needed for export.
 * Verifies auth and ownership.
 * Includes medico-legal calculations.
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

  // Calculate medico-legal periods from events
  const eventsList = eventsRes.data ?? [];
  const calculations = calculateMedicoLegalPeriods(
    eventsList.map((e) => ({
      event_date: e.event_date as string,
      event_type: e.event_type as string,
      title: e.title as string,
      description: e.description as string,
    })),
  );

  return {
    caseData: caseRow,
    events: eventsList,
    anomalies: anomaliesRes.data ?? [],
    missingDocs: missingRes.data ?? [],
    report: reportRes.data,
    calculations,
    periziaMetadata: (caseRow.perizia_metadata ?? null) as Record<string, unknown> | null,
  };
}
