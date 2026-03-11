import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { ingestGuideline, deleteGuideline } from '@/services/rag/ingestion-service';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';

export const maxDuration = 120; // ingestion can take time

const ingestSchema = z.object({
  title: z.string().min(1).max(500),
  source: z.string().min(1).max(200),
  year: z.number().int().min(1990).max(2030).optional(),
  caseTypes: z.array(z.string()).min(1),
  text: z.string().min(100).max(500_000), // guideline text, pre-extracted from PDF
});

const deleteSchema = z.object({
  guidelineId: z.string().uuid(),
});

/**
 * GET /api/admin/guidelines — List all guidelines
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: guidelines, error } = await admin
    .from('guidelines')
    .select('id, title, source, year, case_types, chunk_count, is_active, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: 'Errore caricamento linee guida' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: guidelines });
}

/**
 * POST /api/admin/guidelines — Ingest a new guideline
 * Body: { title, source, year?, caseTypes, text }
 * The text should be the full guideline content, pre-extracted from PDF.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  // Feature gate: guideline ingestion requires Pro
  const gate = await checkFeatureAccess(user.id, 'rag_guidelines');
  if (!gate.allowed) {
    return NextResponse.json(
      { success: false, error: gate.reason ?? 'Funzionalità non disponibile nel piano attuale. Passa a Pro.' },
      { status: 403 },
    );
  }

  const rateCheck = await checkRateLimit({ key: `guidelines:${user.id}`, ...RATE_LIMITS.PROCESSING });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppi tentativi.' }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      error: `Dati non validi: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    }, { status: 400 });
  }

  try {
    const result = await ingestGuideline(parsed.data);

    // Audit log
    const admin = createAdminClient();
    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'guideline.ingested',
      entity_type: 'guideline',
      entity_id: result.guidelineId,
      metadata: {
        title: parsed.data.title,
        source: parsed.data.source,
        chunksCreated: result.chunksCreated,
        totalTokens: result.totalTokens,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error('admin/guidelines', 'Ingestion failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ success: false, error: 'Errore durante l\'ingestione della linea guida.' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/guidelines — Delete a guideline
 * Body: { guidelineId }
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const body = await request.json() as unknown;
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'ID non valido' }, { status: 400 });
  }

  try {
    await deleteGuideline(parsed.data.guidelineId);

    const admin = createAdminClient();
    await admin.from('audit_log').insert({
      user_id: user.id,
      action: 'guideline.deleted',
      entity_type: 'guideline',
      entity_id: parsed.data.guidelineId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('admin/guidelines', 'Delete failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ success: false, error: 'Errore eliminazione.' }, { status: 500 });
  }
}
