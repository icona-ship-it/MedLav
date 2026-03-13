import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getMistralClient, MISTRAL_MODELS, withMistralRetry } from '@/lib/mistral/client';
import { z } from 'zod';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

const requestSchema = z.object({
  quesito: z.string().min(10, 'Quesito troppo corto'),
});

interface MappedPoint {
  point: string;
  relevantEvents: Array<{ orderNumber: number; date: string; title: string; relevance: string }>;
  relevantAnomalies: string[];
  hasDocumentation: boolean;
  notes: string;
}

const mappingJsonSchema = {
  type: 'object' as const,
  properties: {
    points: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          point: { type: 'string' as const },
          relevantEvents: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                orderNumber: { type: 'number' as const },
                date: { type: 'string' as const },
                title: { type: 'string' as const },
                relevance: { type: 'string' as const },
              },
              required: ['orderNumber', 'date', 'title', 'relevance'],
            },
          },
          relevantAnomalies: { type: 'array' as const, items: { type: 'string' as const } },
          hasDocumentation: { type: 'boolean' as const },
          notes: { type: 'string' as const },
        },
        required: ['point', 'relevantEvents', 'relevantAnomalies', 'hasDocumentation', 'notes'],
      },
    },
  },
  required: ['points'],
};

/**
 * POST /api/cases/[id]/quesito
 * Map a legal question (quesito peritale) to case events and anomalies.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const { id: caseId } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const rateCheck = await checkRateLimit({ key: `quesito:${user.id}`, ...RATE_LIMITS.PROCESSING });
    if (!rateCheck.success) {
      return NextResponse.json({ success: false, error: 'Troppe richieste. Riprova tra poco.' }, { status: 429 });
    }

    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Quesito non valido' }, { status: 400 });
    }

    // Verify ownership
    const { data: caseData } = await supabase
      .from('cases')
      .select('id')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseData) {
      return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
    }

    // Load events and anomalies
    const [eventsRes, anomaliesRes] = await Promise.all([
      supabase
        .from('events')
        .select('order_number, event_date, event_type, title, description, diagnosis')
        .eq('case_id', caseId)
        .eq('is_deleted', false)
        .order('order_number', { ascending: true }),
      supabase
        .from('anomalies')
        .select('anomaly_type, severity, description')
        .eq('case_id', caseId),
    ]);

    const events = eventsRes.data ?? [];
    const anomalies = anomaliesRes.data ?? [];

    // Build events summary for the prompt
    const eventsSummary = events.map((e) =>
      `#${e.order_number} ${e.event_date} [${e.event_type}] ${e.title}: ${(e.description as string).slice(0, 200)}${e.diagnosis ? ` | Diagnosi: ${e.diagnosis}` : ''}`,
    ).join('\n');

    const anomaliesSummary = anomalies.map((a) =>
      `[${(a.severity as string).toUpperCase()}] ${a.anomaly_type}: ${a.description}`,
    ).join('\n');

    const client = getMistralClient();

    const response = await withMistralRetry(
      () => client.chat.complete({
        model: MISTRAL_MODELS.MISTRAL_LARGE,
        messages: [
          {
            role: 'system',
            content: `Sei un medico legale esperto. Analizza il quesito peritale e mappa ogni punto alle evidenze disponibili.
Per ogni punto del quesito:
1. Identifica gli eventi della cronologia rilevanti (citando numero d'ordine, data, titolo)
2. Indica le anomalie correlate
3. Specifica se la documentazione è sufficiente per rispondere
4. Aggiungi note su eventuali lacune documentali

Rispondi in JSON strutturato.`,
          },
          {
            role: 'user',
            content: `QUESITO PERITALE:
${parsed.data.quesito}

EVENTI CLINICI:
${eventsSummary}

ANOMALIE RILEVATE:
${anomaliesSummary || 'Nessuna'}

Mappa ogni punto del quesito agli eventi e anomalie rilevanti.`,
          },
        ],
        responseFormat: {
          type: 'json_schema',
          jsonSchema: {
            name: 'quesito_mapping',
            schemaDefinition: mappingJsonSchema,
          },
        },
        temperature: 0.2,
      }),
      'quesito',
    );

    const content = (response as { choices?: Array<{ message?: { content?: string } }> })
      .choices?.[0]?.message?.content ?? '{"points":[]}';

    let mapping: { points: MappedPoint[] };
    try {
      mapping = JSON.parse(content) as { points: MappedPoint[] };
    } catch {
      mapping = { points: [] };
    }

    return NextResponse.json({
      success: true,
      data: { mapping: mapping.points, quesito: parsed.data.quesito },
    });
  } catch (error) {
    logger.error('quesito', 'Quesito mapping failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ success: false, error: 'Errore mappatura quesito' }, { status: 500 });
  }
}
