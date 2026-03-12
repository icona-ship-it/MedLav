/**
 * LLM review step: third pass that receives already-extracted events + full text
 * and looks for missing events and errors in the extraction.
 *
 * Structurally different from extraction: acts as a reviewer/auditor.
 * Non-fatal: if it fails, the pipeline continues with existing events.
 */

import { getMistralClient, MISTRAL_MODELS, withMistralRetry } from '@/lib/mistral/client';
import { CASE_TYPE_GUIDANCE } from './extraction-prompts';
import type { ExtractedEvent } from './extraction-schemas';
import type { CaseType } from '@/types';
import { logger } from '@/lib/logger';

// Max text length to send to reviewer (Mistral Large 128k context)
const MAX_REVIEW_TEXT_CHARS = 100_000;

// Fields that corrections can modify
const CORRECTION_ALLOWED_FIELDS = new Set([
  'diagnosis',
  'doctor',
  'facility',
  'eventDate',
  'datePrecision',
]);

export interface ReviewCorrection {
  eventIndex: number;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface ReviewResult {
  missingEvents: ExtractedEvent[];
  corrections: ReviewCorrection[];
}

interface ReviewResponseJson {
  missingEvents?: Array<{
    eventDate: string;
    datePrecision: string;
    eventType: string;
    title: string;
    description: string;
    sourceType: string;
    diagnosis?: string | null;
    doctor?: string | null;
    facility?: string | null;
    confidence: number;
    sourceText: string;
    sourcePages: number[];
  }>;
  corrections?: Array<{
    eventIndex: number;
    field: string;
    oldValue: string;
    newValue: string;
    reason: string;
  }>;
}

/**
 * Review extracted events against the full text to find omissions and errors.
 * Non-fatal: returns empty result on failure.
 */
export async function reviewExtraction(params: {
  events: ExtractedEvent[];
  fullText: string;
  caseType: CaseType;
}): Promise<ReviewResult> {
  const { events, fullText, caseType } = params;

  try {
    const client = getMistralClient();

    const systemPrompt = buildReviewSystemPrompt(caseType);
    const userPrompt = buildReviewUserPrompt(events, fullText);

    const response = await withMistralRetry(
      () => client.chat.complete({
        model: MISTRAL_MODELS.MISTRAL_LARGE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        responseFormat: { type: 'json_object' },
        temperature: 0.0,
      }),
      'review',
    );

    const content = extractResponseContent(response);
    return parseReviewResponse(content, events.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Review failed';
    logger.warn('review', 'LLM review failed (non-fatal)', { error: message });
    return { missingEvents: [], corrections: [] };
  }
}

/**
 * Build the system prompt for the review step.
 */
function buildReviewSystemPrompt(caseType: CaseType): string {
  return `Sei un revisore medico-legale esperto. Il tuo compito è VERIFICARE l'estrazione di eventi clinici già effettuata.

## IL TUO RUOLO
Ricevi una lista di eventi già estratti da un documento medico e il testo originale del documento.
Devi trovare:
1. **Eventi MANCANTI**: informazioni cliniche presenti nel testo ma non estratte
2. **Errori nei dati estratti**: date errate, diagnosi incomplete, nomi sbagliati, strutture errate

## REGOLE
- Cerca SOLO eventi clinici significativi mancanti, non dettagli minori
- Per ogni evento mancante, fornisci sourceText (porzione esatta dal testo OCR) e sourcePages
- Per le correzioni, modifica SOLO questi campi: diagnosis, doctor, facility, eventDate, datePrecision
- NON duplicare eventi già presenti — se un evento è già estratto, non aggiungerlo come mancante
- Se non trovi nulla da aggiungere o correggere, restituisci arrays vuoti

## GUIDA SPECIFICA
${CASE_TYPE_GUIDANCE[caseType]}

## FORMATO OUTPUT
Rispondi con JSON:
{
  "missingEvents": [{ eventDate, datePrecision, eventType, title, description, sourceType, diagnosis, doctor, facility, confidence, sourceText, sourcePages }],
  "corrections": [{ eventIndex, field, oldValue, newValue, reason }]
}`;
}

/**
 * Build the user prompt with events summary and full text.
 */
function buildReviewUserPrompt(events: ExtractedEvent[], fullText: string): string {
  // Summarize existing events
  const eventsSummary = events.map((e, i) =>
    `[${i}] ${e.eventDate} | ${e.eventType} | ${e.title} | conf:${e.confidence}`,
  ).join('\n');

  // Truncate text if too long
  let textForReview = fullText;
  if (fullText.length > MAX_REVIEW_TEXT_CHARS) {
    textForReview = `${fullText.slice(0, MAX_REVIEW_TEXT_CHARS)}\n\n[TESTO TRONCATO a ${MAX_REVIEW_TEXT_CHARS} caratteri su ${fullText.length} totali]`;
  }

  return `## EVENTI GIA ESTRATTI (${events.length} totali)
${eventsSummary}

## TESTO ORIGINALE DEL DOCUMENTO
${textForReview}

Verifica che tutti gli eventi clinici significativi siano stati estratti. Cerca omissioni e errori.`;
}

/**
 * Parse the review response and apply safety constraints.
 */
function parseReviewResponse(content: string, existingEventCount: number): ReviewResult {
  try {
    const parsed = JSON.parse(content) as ReviewResponseJson;

    // Process missing events — cap confidence at 70, always requiresVerification
    const missingEvents: ExtractedEvent[] = (parsed.missingEvents ?? []).map((e) => ({
      eventDate: e.eventDate,
      datePrecision: validateDatePrecision(e.datePrecision),
      eventType: validateEventType(e.eventType),
      title: e.title,
      description: e.description,
      sourceType: validateSourceType(e.sourceType),
      diagnosis: e.diagnosis ?? null,
      doctor: e.doctor ?? null,
      facility: e.facility ?? null,
      confidence: Math.min(e.confidence, 70),
      requiresVerification: true,
      reliabilityNotes: 'Aggiunto dal revisore LLM — verificare manualmente',
      sourceText: e.sourceText,
      sourcePages: e.sourcePages,
    }));

    // Process corrections — only allow whitelisted fields
    const corrections: ReviewCorrection[] = (parsed.corrections ?? [])
      .filter((c) =>
        CORRECTION_ALLOWED_FIELDS.has(c.field) &&
        c.eventIndex >= 0 &&
        c.eventIndex < existingEventCount &&
        typeof c.oldValue === 'string' &&
        typeof c.newValue === 'string' &&
        c.oldValue !== c.newValue,
      )
      .map((c) => ({
        eventIndex: c.eventIndex,
        field: c.field,
        oldValue: c.oldValue,
        newValue: c.newValue,
        reason: c.reason ?? '',
      }));

    return { missingEvents, corrections };
  } catch {
    logger.warn('review', 'Failed to parse review response');
    return { missingEvents: [], corrections: [] };
  }
}

/**
 * Extract text content from Mistral response.
 */
function extractResponseContent(response: unknown): string {
  const res = response as {
    choices?: Array<{
      message?: { content?: string | null };
    }>;
  };
  return res.choices?.[0]?.message?.content ?? '{}';
}

/**
 * Validate datePrecision enum value.
 */
function validateDatePrecision(value: string): ExtractedEvent['datePrecision'] {
  const valid = ['giorno', 'mese', 'anno', 'sconosciuta'] as const;
  return valid.includes(value as typeof valid[number])
    ? (value as ExtractedEvent['datePrecision'])
    : 'sconosciuta';
}

/**
 * Validate eventType enum value.
 */
function validateEventType(value: string): ExtractedEvent['eventType'] {
  const valid = [
    'visita', 'esame', 'diagnosi', 'intervento', 'terapia',
    'ricovero', 'follow-up', 'referto', 'prescrizione',
    'consenso', 'complicanza', 'spesa_medica',
    'documento_amministrativo', 'certificato', 'altro',
  ] as const;
  return valid.includes(value as typeof valid[number])
    ? (value as ExtractedEvent['eventType'])
    : 'altro';
}

/**
 * Validate sourceType enum value.
 */
function validateSourceType(value: string): ExtractedEvent['sourceType'] {
  const valid = [
    'cartella_clinica', 'referto_controllo',
    'esame_strumentale', 'esame_ematochimico', 'altro',
  ] as const;
  return valid.includes(value as typeof valid[number])
    ? (value as ExtractedEvent['sourceType'])
    : 'altro';
}
