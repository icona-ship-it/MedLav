import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';
import { DOCUMENT_TYPES } from '@/lib/constants';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

const validDocTypeValues = new Set<string>(DOCUMENT_TYPES.map((t) => t.value));

const documentTypeUpdateSchema = z.object({
  documentId: z.string().uuid(),
  documentType: z.string().refine((v) => validDocTypeValues.has(v), {
    message: 'Tipo documento non valido',
  }),
});

const requestSchema = z.object({
  caseId: z.string().uuid(),
  documentTypes: z.array(documentTypeUpdateSchema).min(1),
});

/**
 * POST /api/processing/confirm-classification
 * User confirms (or corrects) AI-suggested document classifications.
 * Saves updated types to DB and sends Inngest event to resume pipeline.
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateCheck = await checkRateLimit({ key: `confirm-class:${ip}`, ...RATE_LIMITS.API });
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

    const { caseId, documentTypes } = parsed.data;

    // Verify case ownership
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .select('id, user_id')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (caseError || !caseData) {
      return NextResponse.json(
        { success: false, error: 'Caso non trovato' },
        { status: 404 },
      );
    }

    // Verify documents belong to this case and are in the right status
    const docIds = documentTypes.map((d) => d.documentId);
    const { data: docs } = await supabase
      .from('documents')
      .select('id, processing_status')
      .eq('case_id', caseId)
      .in('id', docIds);

    if (!docs || docs.length !== docIds.length) {
      return NextResponse.json(
        { success: false, error: 'Alcuni documenti non trovati per questo caso' },
        { status: 400 },
      );
    }

    const allReady = docs.every((d) => d.processing_status === 'classificazione_completata');
    if (!allReady) {
      return NextResponse.json(
        { success: false, error: 'Non tutti i documenti sono pronti per la revisione' },
        { status: 400 },
      );
    }

    // Update document types in DB
    const now = new Date().toISOString();
    for (const dt of documentTypes) {
      await supabase
        .from('documents')
        .update({
          document_type: dt.documentType,
          updated_at: now,
        })
        .eq('id', dt.documentId);
    }

    // Send Inngest event to resume pipeline
    await inngest.send({
      name: 'case/classification.confirmed',
      data: {
        caseId,
        userId: user.id,
      },
    });

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'case.classification.confirmed',
      entity_type: 'case',
      entity_id: caseId,
      metadata: { documentsReviewed: documentTypes.length },
    });

    return NextResponse.json({
      success: true,
      data: { caseId, documentsUpdated: documentTypes.length },
    });
  } catch (error) {
    logger.error('processing/confirm-classification', 'Unexpected error', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { success: false, error: 'Errore interno. Riprova.' },
      { status: 500 },
    );
  }
}
