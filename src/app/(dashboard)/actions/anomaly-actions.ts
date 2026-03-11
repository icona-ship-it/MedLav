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
