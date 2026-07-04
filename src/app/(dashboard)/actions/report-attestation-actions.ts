'use server';

/**
 * Attestazione "verify before sign" del report (ricerca 2026-07-04).
 * Separata da report-actions.ts (file già oltre soglia): qui vive solo il
 * confine di sistema dell'approvazione con attestazione.
 */

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidateCase } from '@/lib/cache';
import { buildReportAttestation } from '@/services/export/attestation';

// Confine di sistema: le server action sono endpoint POST invocabili con
// payload arbitrario — la validazione Zod è obbligatoria (security.md).
const attestParamsSchema = z.object({
  caseId: z.string().uuid(),
  reportId: z.string().uuid(),
  confirmedSectionIds: z.array(z.string().min(1).max(80)).max(50),
});

/**
 * Attesta il report ("verify before sign") e lo approva come definitivo.
 * L'attestazione lega la conferma allo sha256 del synthesis corrente: ogni
 * modifica successiva riporta il report in bozza e richiede di riapprovare.
 */
export async function attestAndApproveReport(rawParams: {
  caseId: string;
  reportId: string;
  confirmedSectionIds: string[];
}) {
  const parsed = attestParamsSchema.safeParse(rawParams);
  if (!parsed.success) return { error: 'Parametri non validi' };
  const params = parsed.data;

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
      // Continuità con lo storico 'report.status_changed': la transizione di
      // stato resta ricostruibile dall'audit trail (review 2026-07-04).
      newStatus: 'definitivo',
      confirmedSectionIds: result.attestation.confirmedSectionIds,
      synthesisSha256: result.attestation.synthesisSha256,
    },
  });

  revalidateCase(params.caseId);
  return { success: true };
}
