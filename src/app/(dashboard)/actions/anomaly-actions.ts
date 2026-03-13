'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Fetch all detected anomalies for a case.
 */
export async function getCaseAnomalies(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('anomalies')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  return data ?? [];
}

/**
 * Fetch all missing document alerts for a case.
 */
export async function getCaseMissingDocs(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('missing_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  return data ?? [];
}

/**
 * Update an anomaly's description and/or suggestion.
 */
export async function updateAnomaly(params: {
  anomalyId: string;
  caseId: string;
  description: string;
  suggestion: string | null;
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

  const { error } = await supabase
    .from('anomalies')
    .update({
      description: params.description,
      suggestion: params.suggestion,
    })
    .eq('id', params.anomalyId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento anomalia' };

  return { success: true };
}

/**
 * Dismiss (soft-delete) an anomaly — marks as user_dismissed instead of deleting.
 */
export async function dismissAnomaly(params: {
  anomalyId: string;
  caseId: string;
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

  const { error } = await supabase
    .from('anomalies')
    .update({
      status: 'user_dismissed',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', params.anomalyId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore archiviazione anomalia' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'anomaly.dismissed',
    entity_type: 'anomaly',
    entity_id: params.anomalyId,
    metadata: { caseId: params.caseId },
  });

  return { success: true };
}
