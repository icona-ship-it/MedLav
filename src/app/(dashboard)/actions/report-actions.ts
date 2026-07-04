'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidateCase } from '@/lib/cache';
import { replaceSectionContent } from '@/lib/section-parser-client';
import { markSectionState } from '@/lib/section-state';
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
 * Attesta il report ("verify before sign") e lo approva come definitivo.
 * L'attestazione lega la conferma allo sha256 del synthesis corrente: ogni
 * modifica successiva la invalida e l'export depositabile chiede di riapprovare.
 */
export async function attestAndApproveReport(params: {
  caseId: string;
  reportId: string;
  confirmedSectionIds: string[];
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

  const { data: report } = await supabase
    .from('reports')
    .select('synthesis, generation_metadata')
    .eq('id', params.reportId)
    .eq('case_id', params.caseId)
    .single();

  if (!report?.synthesis) return { error: 'Report non trovato' };

  const { buildReportAttestation } = await import('@/services/export/attestation');
  const result = buildReportAttestation({
    userId: user.id,
    synthesis: report.synthesis,
    confirmedSectionIds: params.confirmedSectionIds,
  });
  if ('error' in result) return { error: result.error };

  const metadata = (report.generation_metadata ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from('reports')
    .update({
      report_status: 'definitivo',
      generation_metadata: { ...metadata, attestation: result.attestation },
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.reportId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore durante l\'approvazione' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'report.attested',
    entity_type: 'report',
    entity_id: params.reportId,
    metadata: {
      caseId: params.caseId,
      confirmedSectionIds: result.attestation.confirmedSectionIds,
      synthesisSha256: result.attestation.synthesisSha256,
    },
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

  // Diff bozza→firmato sull'intero report (baseline: originalSynthesis, se presente).
  const { data: currentReport } = await supabase
    .from('reports')
    .select('generation_metadata')
    .eq('id', params.reportId)
    .eq('case_id', params.caseId)
    .single();
  const metadata = (currentReport?.generation_metadata ?? null) as { originalSynthesis?: string } | null;
  let metadataUpdate: Record<string, unknown> | undefined;
  if (metadata?.originalSynthesis) {
    const { computeEditRatePercent } = await import('@/lib/edit-metrics');
    metadataUpdate = {
      ...metadata,
      overallEditRatePercent: computeEditRatePercent(metadata.originalSynthesis, params.synthesis),
      lastFullEditAt: new Date().toISOString(),
    };
  }

  const { error } = await supabase
    .from('reports')
    .update({
      synthesis: params.synthesis,
      ...(metadataUpdate ? { generation_metadata: metadataUpdate } : {}),
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
  /** Stable canonical id (from parseSections) — keys the per-section state. */
  sectionCanonicalId?: string;
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

  // Fetch current report to get full synthesis + per-section state
  const { data: report } = await supabase
    .from('reports')
    .select('synthesis, updated_at, generation_metadata')
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

  // Diff bozza→firmato: scostamento della sezione editata dalla bozza AI
  // (baseline: generation_metadata.originalSynthesis, assente sui report
  // legacy → metrica omessa, mai inventata).
  let editRatePercent: number | undefined;
  const originalSynthesis = (report.generation_metadata as { originalSynthesis?: string } | null)?.originalSynthesis;
  if (originalSynthesis && params.sectionCanonicalId) {
    const { parseSections } = await import('@/lib/section-parser-client');
    const { computeEditRatePercent } = await import('@/lib/edit-metrics');
    const originalSection = parseSections(originalSynthesis)
      .find((s) => s.canonicalId === params.sectionCanonicalId || s.id === params.sectionId);
    if (originalSection) {
      editRatePercent = computeEditRatePercent(originalSection.content, params.sectionContent);
    }
  }

  // Mark the section as manually edited so regeneration won't silently
  // overwrite it. A locked section stays locked (max protection).
  const nextMetadata = markSectionState(
    report.generation_metadata,
    params.sectionCanonicalId,
    (prev) => ({
      ...prev,
      status: prev?.status === 'locked' ? 'locked' : 'edited',
      editedAt: new Date().toISOString(),
      ...(editRatePercent !== undefined ? { editRatePercent } : {}),
    }),
  );

  const { error } = await supabase
    .from('reports')
    .update({
      synthesis: updatedSynthesis,
      ...(nextMetadata ? { generation_metadata: nextMetadata } : {}),
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
    metadata: { caseId: params.caseId, sectionId: params.sectionId, canonicalId: params.sectionCanonicalId },
  });

  revalidateCase(params.caseId);
  return { success: true };
}

/**
 * Lock (confirm) or unlock a report section. A locked section is protected
 * from regeneration. Unlocking returns it to 'edited' (if it was edited) or
 * 'auto'. State is keyed by the stable canonical id.
 */
export async function setSectionLock(params: {
  caseId: string;
  reportId: string;
  sectionCanonicalId: string;
  locked: boolean;
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

  const { data: report } = await supabase
    .from('reports')
    .select('updated_at, generation_metadata')
    .eq('id', params.reportId)
    .eq('case_id', params.caseId)
    .single();

  if (!report) return { error: 'Report non trovato' };

  if (params.expectedUpdatedAt && report.updated_at) {
    const expected = new Date(params.expectedUpdatedAt).getTime();
    const actual = new Date(report.updated_at as string).getTime();
    if (actual > expected) {
      return { error: 'Il report è stato modificato da un\'altra operazione. Ricarica la pagina e riprova.' };
    }
  }

  const now = new Date().toISOString();
  const nextMetadata = markSectionState(
    report.generation_metadata,
    params.sectionCanonicalId,
    (prev) => params.locked
      ? { ...prev, status: 'locked', lockedAt: now }
      : { ...prev, status: prev?.editedAt ? 'edited' : 'auto' },
  );

  const { error } = await supabase
    .from('reports')
    .update({
      ...(nextMetadata ? { generation_metadata: nextMetadata } : {}),
      updated_at: now,
    })
    .eq('id', params.reportId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento stato sezione' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: params.locked ? 'report.section_locked' : 'report.section_unlocked',
    entity_type: 'report',
    entity_id: params.reportId,
    metadata: { caseId: params.caseId, canonicalId: params.sectionCanonicalId },
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
