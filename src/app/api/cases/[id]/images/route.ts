import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { downloadFile } from '@/lib/supabase/storage';

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
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { id: caseId } = await params;
  const imagePath = request.nextUrl.searchParams.get('path');

  if (!imagePath || !imagePath.startsWith('ocr-images/') || imagePath.includes('..')) {
    return NextResponse.json({ error: 'Percorso immagine non valido' }, { status: 400 });
  }

  // Verify the user owns this case
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!caseData) {
    return NextResponse.json({ error: 'Caso non trovato' }, { status: 404 });
  }

  // Verify the image belongs to a document in this case
  const docId = imagePath.split('/')[1]; // ocr-images/{docId}/p{N}-f{M}.png
  if (docId) {
    const { data: docData } = await supabase
      .from('documents')
      .select('id')
      .eq('id', docId)
      .eq('case_id', caseId)
      .maybeSingle();

    if (!docData) {
      return NextResponse.json({ error: 'Immagine non trovata' }, { status: 404 });
    }
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
    return NextResponse.json({ error: 'Immagine non disponibile' }, { status: 404 });
  }
}
