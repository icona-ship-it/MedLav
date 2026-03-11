'use server';

import { createClient } from '@/lib/supabase/server';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { logger } from '@/lib/logger';
import type { PeriziaMetadata } from '@/types';

interface AnonymizeReportResult {
  success: boolean;
  anonymizedText?: string;
  replacementCount?: number;
  error?: string;
}

/**
 * Anonymize the latest report for a case.
 * Fetches the report synthesis, applies PII anonymization, and returns the result.
 */
export async function anonymizeReport(caseId: string): Promise<AnonymizeReportResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Non autenticato' };
  }

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, perizia_metadata')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return { success: false, error: 'Caso non trovato' };
  }

  // Fetch the latest report
  const { data: report } = await supabase
    .from('reports')
    .select('id, synthesis')
    .eq('case_id', caseId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report?.synthesis) {
    return { success: false, error: 'Nessun report disponibile per questo caso' };
  }

  const periziaMetadata = (caseData.perizia_metadata ?? undefined) as PeriziaMetadata | undefined;

  const result = anonymizeText({
    text: report.synthesis as string,
    periziaMetadata,
  });

  logger.info('anonymize-report', `caseId=${caseId} reportId=${report.id} replacements=${result.replacementCount}`);

  return {
    success: true,
    anonymizedText: result.anonymizedText,
    replacementCount: result.replacementCount,
  };
}
