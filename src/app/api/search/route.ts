import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export interface GlobalSearchResult {
  type: 'event' | 'report' | 'anomaly' | 'case';
  id: string;
  title: string;
  excerpt: string;
  caseId: string;
  caseCode: string;
  caseType: string;
  date: string | null;
}

const CONTEXT_CHARS = 80;
const MAX_RESULTS_PER_TYPE = 10;

const searchSchema = z.object({
  q: z.string().min(2).max(200),
  limit: z.coerce.number().min(1).max(50).default(20),
});

/**
 * Sanitize search query to prevent PostgREST filter injection.
 */
function sanitizeSearchQuery(query: string): string {
  return query.replace(/[,.()\[\]{}\\%_]/g, ' ').trim();
}

/**
 * GET /api/search?q=termine&limit=20
 * Cross-case full-text search across events, reports, anomalies, and cases.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  // Rate limiting
  const rateLimitResult = await checkRateLimit({
    key: `global-search:${user.id}`,
    ...RATE_LIMITS.API,
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: 'Troppe richieste. Riprova tra poco.' },
      { status: 429 },
    );
  }

  const rawQ = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const rawLimit = request.nextUrl.searchParams.get('limit') ?? '20';

  const parsed = searchSchema.safeParse({ q: rawQ, limit: rawLimit });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Query non valida (min 2 caratteri)' }, { status: 400 });
  }

  const query = sanitizeSearchQuery(parsed.data.q);
  if (!query || query.length < 2) {
    return NextResponse.json({ success: false, error: 'Query troppo corta' }, { status: 400 });
  }

  const limit = parsed.data.limit;
  const lowerQuery = query.toLowerCase();

  // 1. Fetch all user's cases (for joining)
  const { data: userCases } = await supabase
    .from('cases')
    .select('id, code, case_type, patient_initials, practice_reference, notes')
    .eq('user_id', user.id);

  if (!userCases || userCases.length === 0) {
    return NextResponse.json({ success: true, data: { results: [], total: 0, query } });
  }

  const caseMap = new Map(userCases.map((c) => [
    c.id as string,
    { code: c.code as string, caseType: c.case_type as string },
  ]));
  const caseIds = Array.from(caseMap.keys());

  const results: GlobalSearchResult[] = [];

  // 2. Search cases by code, patient_initials, practice_reference, notes
  for (const c of userCases) {
    const searchable = `${c.code} ${c.patient_initials ?? ''} ${c.practice_reference ?? ''} ${c.notes ?? ''}`;
    if (searchable.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'case',
        id: c.id as string,
        title: `Caso ${c.code}${c.patient_initials ? ` — ${c.patient_initials}` : ''}`,
        excerpt: extractExcerpt(searchable, lowerQuery),
        caseId: c.id as string,
        caseCode: c.code as string,
        caseType: c.case_type as string,
        date: null,
      });
    }
  }

  // 3. Search events across all user cases
  const { data: eventsData } = await supabase
    .from('events')
    .select('id, case_id, title, description, diagnosis, event_date, event_type')
    .in('case_id', caseIds)
    .eq('is_deleted', false)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%,diagnosis.ilike.%${query}%`)
    .limit(MAX_RESULTS_PER_TYPE);

  for (const event of eventsData ?? []) {
    const caseInfo = caseMap.get(event.case_id as string);
    if (!caseInfo) continue;
    const searchableText = `${event.title} ${event.description} ${event.diagnosis ?? ''}`;
    results.push({
      type: 'event',
      id: event.id as string,
      title: `[${(event.event_type as string).toUpperCase()}] ${event.title as string}`,
      excerpt: extractExcerpt(searchableText, lowerQuery),
      caseId: event.case_id as string,
      caseCode: caseInfo.code,
      caseType: caseInfo.caseType,
      date: event.event_date as string,
    });
  }

  // 4. Search reports (synthesis text)
  const { data: reportsData } = await supabase
    .from('reports')
    .select('id, case_id, version, synthesis')
    .in('case_id', caseIds)
    .ilike('synthesis', `%${query}%`)
    .limit(MAX_RESULTS_PER_TYPE);

  for (const report of reportsData ?? []) {
    const caseInfo = caseMap.get(report.case_id as string);
    if (!caseInfo) continue;
    const synth = (report.synthesis ?? '') as string;
    results.push({
      type: 'report',
      id: report.id as string,
      title: `Report v${report.version} — Caso ${caseInfo.code}`,
      excerpt: extractExcerpt(synth.replace(/<[^>]+>/g, ''), lowerQuery),
      caseId: report.case_id as string,
      caseCode: caseInfo.code,
      caseType: caseInfo.caseType,
      date: null,
    });
  }

  // 5. Search anomalies
  const { data: anomaliesData } = await supabase
    .from('anomalies')
    .select('id, case_id, anomaly_type, description, suggestion')
    .in('case_id', caseIds)
    .or(`description.ilike.%${query}%,suggestion.ilike.%${query}%`)
    .limit(MAX_RESULTS_PER_TYPE);

  for (const anomaly of anomaliesData ?? []) {
    const caseInfo = caseMap.get(anomaly.case_id as string);
    if (!caseInfo) continue;
    const searchableText = `${anomaly.description} ${anomaly.suggestion ?? ''}`;
    results.push({
      type: 'anomaly',
      id: anomaly.id as string,
      title: `Anomalia: ${anomaly.anomaly_type as string}`,
      excerpt: extractExcerpt(searchableText, lowerQuery),
      caseId: anomaly.case_id as string,
      caseCode: caseInfo.code,
      caseType: caseInfo.caseType,
      date: null,
    });
  }

  // Trim to limit
  const trimmed = results.slice(0, limit);

  return NextResponse.json({
    success: true,
    data: { results: trimmed, total: results.length, query },
  });
}

/**
 * Extract a text excerpt around the search match with context.
 */
function extractExcerpt(text: string, lowerQuery: string): string {
  const lowerText = text.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text.slice(0, CONTEXT_CHARS * 2) + (text.length > CONTEXT_CHARS * 2 ? '...' : '');

  const start = Math.max(0, matchIndex - CONTEXT_CHARS);
  const end = Math.min(text.length, matchIndex + lowerQuery.length + CONTEXT_CHARS);

  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt;
}
