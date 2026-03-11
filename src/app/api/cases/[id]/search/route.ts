import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

interface SearchResult {
  type: 'event' | 'page';
  id: string;
  title: string;
  excerpt: string;
  date: string | null;
  documentName: string | null;
}

const CONTEXT_CHARS = 100;

const uuidSchema = z.string().uuid();

/**
 * Sanitize search query to prevent PostgREST filter injection.
 * Strips characters that have special meaning in PostgREST filter syntax.
 */
function sanitizeSearchQuery(query: string): string {
  return query.replace(/[,.()\[\]{}\\%_]/g, ' ').trim();
}

/**
 * GET /api/cases/[id]/search?q=termine
 * Full-text search across OCR pages and extracted events.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;

  // Validate caseId is a valid UUID
  const caseIdResult = uuidSchema.safeParse(caseId);
  if (!caseIdResult.success) {
    return NextResponse.json({ success: false, error: 'ID caso non valido' }, { status: 400 });
  }

  const rawQuery = request.nextUrl.searchParams.get('q')?.trim();

  if (!rawQuery || rawQuery.length < 2) {
    return NextResponse.json({ success: false, error: 'Query troppo corta (min 2 caratteri)' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  // Rate limiting per user
  const rateLimitResult = await checkRateLimit({
    key: `search:${user.id}`,
    ...RATE_LIMITS.API,
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: 'Troppe richieste. Riprova tra poco.' },
      { status: 429 },
    );
  }

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
  }

  // Sanitize query to prevent PostgREST filter injection
  const query = sanitizeSearchQuery(rawQuery);

  if (!query || query.length < 2) {
    return NextResponse.json({ success: false, error: 'Query troppo corta (min 2 caratteri)' }, { status: 400 });
  }

  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  // Search in events (title, description, diagnosis)
  const { data: eventsData } = await supabase
    .from('events')
    .select('id, title, description, diagnosis, event_date, event_type')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%,diagnosis.ilike.%${query}%`);

  for (const event of eventsData ?? []) {
    const searchableText = `${event.title} ${event.description} ${event.diagnosis ?? ''}`;
    const excerpt = extractExcerpt(searchableText, lowerQuery);

    results.push({
      type: 'event',
      id: event.id as string,
      title: `[${(event.event_type as string).toUpperCase()}] ${event.title as string}`,
      excerpt,
      date: event.event_date as string,
      documentName: null,
    });
  }

  // Search in OCR pages via documents for this case
  const { data: docsData } = await supabase
    .from('documents')
    .select('id, file_name')
    .eq('case_id', caseId);

  const docMap = new Map((docsData ?? []).map((d) => [d.id as string, d.file_name as string]));
  const docIds = Array.from(docMap.keys());

  if (docIds.length > 0) {
    const { data: matchingPages } = await supabase
      .from('pages')
      .select('id, ocr_text, page_number, document_id')
      .in('document_id', docIds)
      .ilike('ocr_text', `%${query}%`)
      .limit(50);

    for (const page of matchingPages ?? []) {
      const text = (page.ocr_text ?? '') as string;
      const excerpt = extractExcerpt(text, lowerQuery);
      const docName = docMap.get(page.document_id as string) ?? 'Documento';

      results.push({
        type: 'page',
        id: page.id as string,
        title: `${docName} - Pagina ${page.page_number}`,
        excerpt,
        date: null,
        documentName: docName,
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: { results, total: results.length, query },
  });
}

/**
 * Extract a text excerpt around the search match with context.
 */
function extractExcerpt(text: string, lowerQuery: string): string {
  const lowerText = text.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text.slice(0, CONTEXT_CHARS * 2) + '...';

  const start = Math.max(0, matchIndex - CONTEXT_CHARS);
  const end = Math.min(text.length, matchIndex + lowerQuery.length + CONTEXT_CHARS);

  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt;
}
