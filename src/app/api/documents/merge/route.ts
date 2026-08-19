import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logAccess } from '@/lib/audit';
import { z } from 'zod';

const requestSchema = z.object({
  caseId: z.string().uuid(),
  /** Ordinati per pagina: il PRIMO è il documento primario (pagina 1). */
  documentIds: z.array(z.string().uuid()).min(2).max(30),
});

/**
 * POST /api/documents/merge
 * Unisce più file caricati in UN documento logico (feedback medici 2026-08-19:
 * le foto delle pagine di un referto arrivavano come documenti separati).
 * I secondari puntano al primario; l'unione ha effetto alla prossima
 * elaborazione (l'OCR di gruppo scrive tutte le pagine sotto il primario).
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
  const { caseId, documentIds } = parsed.data;

  if (new Set(documentIds).size !== documentIds.length) {
    return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
  }

  // Ownership + stato: mai toccare i documenti mentre la pipeline gira.
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
    return NextResponse.json({ success: false, error: 'Elaborazione in corso: attendi che finisca prima di unire i documenti.' }, { status: 409 });
  }

  const { data: docs } = await supabase
    .from('documents')
    .select('id, merged_into_document_id')
    .eq('case_id', caseId)
    .in('id', documentIds);
  if (!docs || docs.length !== documentIds.length) {
    return NextResponse.json({ success: false, error: 'Uno o più documenti non appartengono a questo caso.' }, { status: 400 });
  }
  if (docs.some((d) => d.merged_into_document_id)) {
    return NextResponse.json({ success: false, error: 'Uno dei documenti è già unito a un altro: separalo prima.' }, { status: 400 });
  }

  // Nessuno dei coinvolti deve essere già primario di un altro gruppo
  // (niente catene: un gruppo si scioglie e si ricompone, non si annida).
  const { data: existingSecondaries } = await supabase
    .from('documents')
    .select('id')
    .eq('case_id', caseId)
    .in('merged_into_document_id', documentIds)
    .limit(1);
  if (existingSecondaries && existingSecondaries.length > 0) {
    return NextResponse.json({ success: false, error: 'Uno dei documenti è già capofila di un gruppo unito: separa quel gruppo prima.' }, { status: 400 });
  }

  const [primaryId, ...secondaryIds] = documentIds;
  for (let i = 0; i < secondaryIds.length; i++) {
    const { error } = await supabase
      .from('documents')
      .update({
        merged_into_document_id: primaryId,
        merge_order: i + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', secondaryIds[i])
      .eq('case_id', caseId);
    if (error) {
      return NextResponse.json({ success: false, error: 'Errore durante l\'unione. Riprova.' }, { status: 500 });
    }
  }

  logAccess({
    userId: user.id,
    action: 'documents.merged',
    entityType: 'case',
    entityId: caseId,
    metadata: { primaryId, secondaryCount: secondaryIds.length },
  });

  return NextResponse.json({ success: true, data: { primaryId, mergedCount: secondaryIds.length } });
}
