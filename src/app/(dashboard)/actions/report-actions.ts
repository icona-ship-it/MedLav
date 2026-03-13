'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateCase } from '@/lib/cache';

/**
 * Fetch the latest report for a case.
 */
export async function getCaseReport(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('case_id', caseId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[getCaseReport] Query failed for case ${caseId}:`, error.message, error.code);
    return null;
  }

  return data;
}

/**
 * Update report status (bozza -> in_revisione -> definitivo).
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

  revalidateCase(params.caseId);
  return { success: true };
}

/**
 * Update report synthesis text in-place (no new version).
 */
export async function updateReportSynthesis(params: {
  caseId: string;
  reportId: string;
  synthesis: string;
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
      synthesis: params.synthesis,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.reportId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento report' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'report.synthesis_edited',
    entity_type: 'report',
    entity_id: params.reportId,
    metadata: { caseId: params.caseId },
  });

  revalidateCase(params.caseId);
  return { success: true };
}

/**
 * Fetch all report versions for a case, ordered by version DESC.
 */
export async function getCaseReportVersions(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('reports')
    .select('id, version, report_status, synthesis')
    .eq('case_id', caseId)
    .order('version', { ascending: false });

  return data ?? [];
}
