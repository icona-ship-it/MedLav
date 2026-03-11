import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import crypto from 'crypto';

const createShareSchema = z.object({
  label: z.string().max(100).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

/**
 * POST /api/cases/[id]/share — Create a share link
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: caseId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
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

    const body = await request.json();
    const parsed = createShareSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
    }

    const { label, expiresInDays } = parsed.data;
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: share, error } = await supabase
      .from('case_shares')
      .insert({
        case_id: caseId,
        user_id: user.id,
        token,
        label: label ?? null,
        expires_at: expiresAt,
      })
      .select('id, token, label, expires_at, created_at')
      .single();

    if (error) {
      console.error('[share] Insert error:', error.code);
      return NextResponse.json({ success: false, error: 'Errore creazione link' }, { status: 500 });
    }

    const shareUrl = `${request.nextUrl.origin}/shared/${token}`;

    return NextResponse.json({
      success: true,
      data: { ...share, url: shareUrl },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Errore interno' }, { status: 500 });
  }
}

/**
 * GET /api/cases/[id]/share — List active shares for a case
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: caseId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const { data: shares } = await supabase
      .from('case_shares')
      .select('id, token, label, expires_at, view_count, created_at')
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ success: true, data: shares ?? [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Errore interno' }, { status: 500 });
  }
}

/**
 * DELETE /api/cases/[id]/share?token=xxx — Revoke a share
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: caseId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token richiesto' }, { status: 400 });
    }

    const { error } = await supabase
      .from('case_shares')
      .delete()
      .eq('case_id', caseId)
      .eq('user_id', user.id)
      .eq('token', token);

    if (error) {
      return NextResponse.json({ success: false, error: 'Errore revoca' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Errore interno' }, { status: 500 });
  }
}
