'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const uuidSchema = z.string().uuid();

const anomalyIdSchema = z.object({
  anomalyId: z.string().uuid(),
  caseId: z.string().uuid(),
});

const updateAnomalySchema = z.object({
  anomalyId: z.string().uuid(),
  caseId: z.string().uuid(),
  description: z.string().min(1).max(2000),
  suggestion: z.string().max(2000).nullable(),
});

/**
 * Fetch all detected anomalies for a case.
 */
export async function getCaseAnomalies(caseId: string) {
  const parsed = uuidSchema.safeParse(caseId);
  if (!parsed.success) return [];

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('anomalies')
    .select('*')
    .eq('case_id', parsed.data)
    .order('created_at', { ascending: true });

  return data ?? [];
}

/**
 * Fetch all missing document alerts for a case.
 */
export async function getCaseMissingDocs(caseId: string) {
  const parsed = uuidSchema.safeParse(caseId);
  if (!parsed.success) return [];

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('missing_documents')
    .select('*')
    .eq('case_id', parsed.data)
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
  const parsed = updateAnomalySchema.safeParse(params);
  if (!parsed.success) return { error: 'Parametri non validi' };

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', parsed.data.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const { error } = await supabase
    .from('anomalies')
    .update({
      description: parsed.data.description,
      suggestion: parsed.data.suggestion,
    })
    .eq('id', parsed.data.anomalyId)
    .eq('case_id', parsed.data.caseId);

  if (error) return { error: 'Errore aggiornamento anomalia' };

  return { success: true };
}

/**
 * Confirm an anomaly — marks as user_confirmed (stays in report as a flagged issue).
 */
export async function confirmAnomaly(params: {
  anomalyId: string;
  caseId: string;
}) {
  const parsed = anomalyIdSchema.safeParse(params);
  if (!parsed.success) return { error: 'Parametri non validi' };

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', parsed.data.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Defensive check: only confirm anomalies that are actionable
  const { data: anomalyRow } = await supabase
    .from('anomalies')
    .select('status')
    .eq('id', parsed.data.anomalyId)
    .eq('case_id', parsed.data.caseId)
    .single();

  if (!anomalyRow) return { error: 'Anomalia non trovata' };

  const actionableStatuses = ['detected', 'llm_confirmed'];
  if (!actionableStatuses.includes(anomalyRow.status)) {
    return { error: 'Anomalia gia risolta o ignorata' };
  }

  const { error } = await supabase
    .from('anomalies')
    .update({
      status: 'user_confirmed',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.anomalyId)
    .eq('case_id', parsed.data.caseId);

  if (error) return { error: 'Errore conferma anomalia' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'anomaly.confirmed',
    entity_type: 'anomaly',
    entity_id: parsed.data.anomalyId,
    metadata: { caseId: parsed.data.caseId },
  });

  return { success: true };
}

/**
 * Dismiss (soft-delete) an anomaly — marks as user_dismissed instead of deleting.
 */
export async function dismissAnomaly(params: {
  anomalyId: string;
  caseId: string;
}) {
  const parsed = anomalyIdSchema.safeParse(params);
  if (!parsed.success) return { error: 'Parametri non validi' };

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', parsed.data.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Defensive check: only dismiss anomalies that are actionable
  const { data: anomalyRow } = await supabase
    .from('anomalies')
    .select('status')
    .eq('id', parsed.data.anomalyId)
    .eq('case_id', parsed.data.caseId)
    .single();

  if (!anomalyRow) return { error: 'Anomalia non trovata' };

  const dismissableStatuses = ['detected', 'llm_confirmed', 'user_confirmed'];
  if (!dismissableStatuses.includes(anomalyRow.status)) {
    return { error: 'Anomalia gia risolta o ignorata' };
  }

  const { error } = await supabase
    .from('anomalies')
    .update({
      status: 'user_dismissed',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.anomalyId)
    .eq('case_id', parsed.data.caseId);

  if (error) return { error: 'Errore archiviazione anomalia' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'anomaly.dismissed',
    entity_type: 'anomaly',
    entity_id: parsed.data.anomalyId,
    metadata: { caseId: parsed.data.caseId },
  });

  return { success: true };
}
