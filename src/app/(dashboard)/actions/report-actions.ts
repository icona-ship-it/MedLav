'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateCase } from '@/lib/cache';
import { replaceSectionContent } from '@/lib/section-parser-client';
import { logger } from '@/lib/logger';

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
    logger.error('report', 'Query failed for getCaseReport', { caseId, errorMessage: error.message, errorCode: error.code });
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
 * Update a single section of the report synthesis by sectionId.
 */
export async function updateReportSection(params: {
  caseId: string;
  reportId: string;
  sectionId: string;
  sectionContent: string;
  expectedUpdatedAt?: string;
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

  // Fetch current report to get full synthesis
  const { data: report } = await supabase
    .from('reports')
    .select('synthesis, updated_at')
    .eq('id', params.reportId)
    .eq('case_id', params.caseId)
    .single();

  if (!report?.synthesis) return { error: 'Report non trovato' };

  // Optimistic locking: reject if report was modified since editor opened
  if (params.expectedUpdatedAt && report.updated_at) {
    const expected = new Date(params.expectedUpdatedAt).getTime();
    const actual = new Date(report.updated_at as string).getTime();
    if (actual > expected) {
      return { error: 'Il report è stato modificato da un\'altra operazione. Ricarica la pagina e riprova.' };
    }
  }

  const updatedSynthesis = replaceSectionContent(
    report.synthesis,
    params.sectionId,
    params.sectionContent,
  );

  if (updatedSynthesis === report.synthesis) {
    return { error: 'Sezione non trovata nel report. Ricarica la pagina e riprova.' };
  }

  const { error } = await supabase
    .from('reports')
    .update({
      synthesis: updatedSynthesis,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.reportId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento sezione' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'report.section_edited',
    entity_type: 'report',
    entity_id: params.reportId,
    metadata: { caseId: params.caseId, sectionId: params.sectionId },
  });

  revalidateCase(params.caseId);
  return { success: true };
}

/**
 * Fetch the most recent export audit entry for a case.
 */
export async function getLastExport(caseId: string): Promise<{
  format: string;
  exportedAt: string;
} | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('audit_log')
    .select('metadata, created_at')
    .eq('action', 'report.exported')
    .eq('entity_type', 'case')
    .eq('entity_id', caseId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const metadata = data.metadata as Record<string, unknown> | null;
  return {
    format: (metadata?.format as string) ?? 'unknown',
    exportedAt: data.created_at as string,
  };
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
