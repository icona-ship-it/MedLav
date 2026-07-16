import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSignedUrl } from '@/lib/supabase/storage';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/cases/[id]/documents/[docId]/view
 * Apre il DOCUMENTO ORIGINALE caricato (redirect a signed URL Storage), così dal
 * pannello "Da controllare" il perito verifica la fonte. Auth + ownership caso +
 * appartenenza del documento al caso (nessun path arbitrario dal client).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `doc-view:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  const { id: caseId, docId } = await params;

  // Su errore NON mostrare JSON crudo (il link apre una scheda nuova): torna
  // alla pagina del caso — l'utente capisce che il documento non è disponibile.
  const fallback = () => NextResponse.redirect(new URL(`/cases/${caseId}`, request.url));

  // Verifica ownership del caso E appartenenza del documento al caso: lo
  // storage_path viene dal DB, MAI dal client (nessun path traversal possibile).
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path, case_id, cases!inner(user_id)')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();

  const ownerId = (doc?.cases as { user_id?: string } | { user_id?: string }[] | null);
  const uid = Array.isArray(ownerId) ? ownerId[0]?.user_id : ownerId?.user_id;
  if (!doc || !doc.storage_path || uid !== user.id) {
    return fallback();
  }

  try {
    const signedUrl = await getSignedUrl(doc.storage_path as string);
    return NextResponse.redirect(signedUrl);
  } catch {
    return fallback();
  }
}
