import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const requestSchema = z.object({
  caseId: z.string().uuid(),
});

/**
 * POST /api/processing/confirm-anomaly-review
 * User confirms anomaly review is complete. Sends Inngest event to resume pipeline.
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateCheck = await checkRateLimit({ key: `confirm-anomaly:${ip}`, ...RATE_LIMITS.API });
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Non autenticato' },
        { status: 401 },
      );
    }

    // Validate request body
    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dati non validi' },
        { status: 400 },
      );
    }

    const { caseId } = parsed.data;

    // Verify case ownership and processing stage
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, user_id, processing_stage')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (caseError || !caseData) {
      return NextResponse.json(
        { success: false, error: 'Caso non trovato' },
        { status: 404 },
      );
    }

    if ((caseData.processing_stage as string) !== 'revisione_anomalie') {
      return NextResponse.json(
        { success: false, error: 'Il caso non è in fase di revisione anomalie' },
        { status: 400 },
      );
    }

    // Send Inngest event to resume pipeline
    await inngest.send({
      name: 'case/anomaly-review.confirmed',
      data: {
        caseId,
        userId: user.id,
      },
    });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'case.anomaly-review.confirmed',
      entity_type: 'case',
      entity_id: caseId,
      metadata: {},
    });

    return NextResponse.json({
      success: true,
      data: { caseId },
    });
  } catch (error) {
    logger.error('processing/confirm-anomaly-review', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
