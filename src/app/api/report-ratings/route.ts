import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const ratingSchema = z.object({
  reportId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).nullable().optional(),
});

/**
 * POST /api/report-ratings
 * Upsert a rating for a report (1-5 stars + optional comment).
 */
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = ratingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
    }

    const { reportId, rating, comment } = parsed.data;

    // Verify the user owns the report (via case ownership)
    const { data: reportData } = await supabase
      .from('reports')
      .select('id, case_id')
      .eq('id', reportId)
      .single();

    if (!reportData) {
      return NextResponse.json({ success: false, error: 'Report non trovato' }, { status: 404 });
    }

    const { data: caseData } = await supabase
      .from('cases')
      .select('id')
      .eq('id', reportData.case_id)
      .eq('user_id', user.id)
      .single();

    if (!caseData) {
      return NextResponse.json({ success: false, error: 'Non autorizzato' }, { status: 403 });
    }

    // Upsert rating
    const { error } = await supabase
      .from('report_ratings')
      .upsert({
        report_id: reportId,
        user_id: user.id,
        rating,
        comment: comment ?? null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'report_id,user_id',
      });

    if (error) {
      logger.error('report-ratings', 'Upsert error', { code: error.code });
      return NextResponse.json({ success: false, error: 'Errore salvataggio' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Errore interno' }, { status: 500 });
  }
}

/**
 * GET /api/report-ratings?reportId=xxx
 * Fetch the current user's rating for a report.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const reportId = request.nextUrl.searchParams.get('reportId');
    if (!reportId) {
      return NextResponse.json({ success: false, error: 'reportId richiesto' }, { status: 400 });
    }

    const { data } = await supabase
      .from('report_ratings')
      .select('rating, comment')
      .eq('report_id', reportId)
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      success: true,
      data: data ?? null,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Errore interno' }, { status: 500 });
  }
}
