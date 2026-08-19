import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logAccess } from '@/lib/audit';
import { z } from 'zod';

const requestSchema = z.object({
  caseId: z.string().uuid(),
  /** Primario del gruppo da sciogliere. */
  primaryDocumentId: z.string().uuid(),
});

/**
 * POST /api/documents/unmerge
 * Scioglie un gruppo di documenti uniti: i secondari tornano documenti
 * indipendenti. Ha effetto alla prossima elaborazione.
 */
export async function POST(request: NextRequest) {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `doc-merge:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste. Riprova tra poco.' }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
  }
  const { caseId, primaryDocumentId } = parsed.data;

  const { data: caseData } = await supabase
    .from('cases')
    .select('id, processing_stage')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();
  if (!caseData) {
    return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
  }
  if (caseData.processing_stage === 'elaborazione') {
    return NextResponse.json({ success: false, error: 'Elaborazione in corso: attendi che finisca prima di separare i documenti.' }, { status: 409 });
  }

  const { data: updated, error } = await supabase
    .from('documents')
    .update({
      merged_into_document_id: null,
      merge_order: null,
      updated_at: new Date().toISOString(),
    })
    .eq('case_id', caseId)
    .eq('merged_into_document_id', primaryDocumentId)
    .select('id');
  if (error) {
    return NextResponse.json({ success: false, error: 'Errore durante la separazione. Riprova.' }, { status: 500 });
  }

  logAccess({
    userId: user.id,
    action: 'documents.unmerged',
    entityType: 'case',
    entityId: caseId,
    metadata: { primaryId: primaryDocumentId, separatedCount: (updated ?? []).length },
  });

  return NextResponse.json({ success: true, data: { separatedCount: (updated ?? []).length } });
}
