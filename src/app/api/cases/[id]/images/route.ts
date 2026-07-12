import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { downloadFile } from '@/lib/supabase/storage';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * GET /api/cases/[id]/images?path=ocr-images/...
 * Proxy endpoint to serve OCR-extracted images from Supabase Storage.
 * Validates that the user owns the case before serving.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `images:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  const { id: caseId } = await params;
  const rawPath = request.nextUrl.searchParams.get('path');

  // Decode first, then validate — prevents double-encoding bypasses (%252e%252e)
  let imagePath: string;
  try {
    imagePath = rawPath ? decodeURIComponent(rawPath) : '';
  } catch {
    return NextResponse.json({ success: false, error: 'Percorso immagine non valido' }, { status: 400 });
  }

  if (!imagePath || !imagePath.startsWith('ocr-images/') || imagePath.includes('..') || imagePath.includes('\0')) {
    return NextResponse.json({ success: false, error: 'Percorso immagine non valido' }, { status: 400 });
  }

  // Verify the user owns this case
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!caseData) {
    return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
  }

  // Verify the image belongs to a document in this case.
  // FAIL-CLOSED sul docId mancante: un path tipo `ocr-images//p1.png` passa il
  // controllo startsWith ma ha docId vuoto — prima saltava del tutto il check di
  // appartenenza al documento (bypass dell'autorizzazione per-documento).
  const docId = imagePath.split('/')[1]; // ocr-images/{docId}/p{N}-f{M}.png
  if (!docId) {
    return NextResponse.json({ success: false, error: 'Percorso immagine non valido' }, { status: 400 });
  }
  const { data: docData } = await supabase
    .from('documents')
    .select('id')
    .eq('id', docId)
    .eq('case_id', caseId)
    .maybeSingle();

  if (!docData) {
    return NextResponse.json({ success: false, error: 'Immagine non trovata' }, { status: 404 });
  }

  try {
    // Check ETag — if browser already has this image, skip download
    const etag = `"${Buffer.from(imagePath).toString('base64url')}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304 });
    }

    const blob = await downloadFile(imagePath);
    const arrayBuffer = await blob.arrayBuffer();

    // Detect content type: new uploads are JPEG, old ones may be PNG
    const isJpeg = imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg');
    const contentType = isJpeg ? 'image/jpeg' : (blob.type || 'image/png');

    return new NextResponse(new Uint8Array(arrayBuffer), {
      headers: {
        'Content-Type': contentType,
        // OCR images never change — cache aggressively (30 days, immutable)
        'Cache-Control': 'private, max-age=2592000, immutable',
        'ETag': etag,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Immagine non disponibile' }, { status: 404 });
  }
}
