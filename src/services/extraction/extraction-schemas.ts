import { z } from 'zod';

// Allowed values with fallback
const EVENT_TYPES = [
  'visita', 'esame', 'diagnosi', 'intervento', 'terapia',
  'ricovero', 'follow-up', 'referto', 'prescrizione',
  'consenso', 'complicanza', 'altro',
] as const;

const SOURCE_TYPES = [
  'cartella_clinica', 'referto_controllo',
  'esame_strumentale', 'esame_ematochimico', 'altro',
] as const;

const DATE_PRECISIONS = ['giorno', 'mese', 'anno', 'sconosciuta'] as const;

/**
 * Lenient Zod schema for a single extracted clinical event.
 * Uses coercion and defaults to handle LLM output variations.
 */
export const extractedEventSchema = z.object({
  eventDate: z.string().default('1900-01-01'),
  datePrecision: z.string().transform((v) => {
    const normalized = v.toLowerCase().replace(/\s+/g, '');
    if ((DATE_PRECISIONS as readonly string[]).includes(normalized)) return normalized as typeof DATE_PRECISIONS[number];
    return 'sconosciuta' as const;
  }).default('sconosciuta'),
  eventType: z.string().transform((v) => {
    const normalized = v.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
    if ((EVENT_TYPES as readonly string[]).includes(normalized)) return normalized as typeof EVENT_TYPES[number];
    return 'altro' as const;
  }).default('altro'),
  title: z.string().default('Evento clinico'),
  description: z.string().default(''),
  sourceType: z.string().transform((v) => {
    const normalized = v.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
    if ((SOURCE_TYPES as readonly string[]).includes(normalized)) return normalized as typeof SOURCE_TYPES[number];
    return 'altro' as const;
  }).default('altro'),
  diagnosis: z.string().nullable().optional(),
  doctor: z.string().nullable().optional(),
  facility: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100).default(70),
  requiresVerification: z.boolean().default(false),
  reliabilityNotes: z.string().nullable().optional(),
  sourceText: z.string().default(''),
  sourcePages: z.array(z.number().int().positive()).default([1]),
}).passthrough();

export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

/**
 * Schema for the complete extraction response from Mistral.
 * Handles common LLM variations: "events" vs "Events" vs "eventi".
 */
export const extractionResponseSchema = z.object({
  events: z.array(extractedEventSchema).optional(),
  Events: z.array(extractedEventSchema).optional(),
  eventi: z.array(extractedEventSchema).optional(),
  abbreviations: z.array(z.object({
    abbreviation: z.string(),
    expansion: z.string(),
  })).optional(),
}).passthrough().transform((data) => {
  // Normalize: accept events/Events/eventi
  const events = data.events ?? data.Events ?? data.eventi ?? [];
  return {
    events,
    abbreviations: data.abbreviations,
  };
});

export type ExtractionResponse = { events: ExtractedEvent[]; abbreviations?: Array<{ abbreviation: string; expansion: string }> };

/**
 * JSON Schema representation for Mistral structured output.
 * Kept for reference, not used with json_object mode.
 */
export const extractionJsonSchema = {
  type: 'object' as const,
  properties: {
    events: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          eventDate: { type: 'string' as const, description: 'Data evento YYYY-MM-DD' },
          datePrecision: { type: 'string' as const, enum: ['giorno', 'mese', 'anno', 'sconosciuta'] },
          eventType: {
            type: 'string' as const,
            enum: [
              'visita', 'esame', 'diagnosi', 'intervento', 'terapia',
              'ricovero', 'follow-up', 'referto', 'prescrizione',
              'consenso', 'complicanza', 'altro',
            ],
          },
          title: { type: 'string' as const },
          description: { type: 'string' as const },
          sourceType: {
            type: 'string' as const,
            enum: ['cartella_clinica', 'referto_controllo', 'esame_strumentale', 'esame_ematochimico', 'altro'],
          },
          diagnosis: { type: ['string', 'null'] as const },
          doctor: { type: ['string', 'null'] as const },
          facility: { type: ['string', 'null'] as const },
          confidence: { type: 'number' as const, minimum: 0, maximum: 100 },
          requiresVerification: { type: 'boolean' as const },
          reliabilityNotes: { type: ['string', 'null'] as const },
          sourceText: { type: 'string' as const },
          sourcePages: {
            type: 'array' as const,
            items: { type: 'integer' as const, minimum: 1 },
            minItems: 1,
          },
        },
        required: [
          'eventDate', 'datePrecision', 'eventType', 'title',
          'description', 'sourceType', 'confidence', 'requiresVerification',
          'sourceText', 'sourcePages',
        ],
      },
    },
    abbreviations: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          abbreviation: { type: 'string' as const },
          expansion: { type: 'string' as const },
        },
        required: ['abbreviation', 'expansion'],
      },
    },
  },
  required: ['events'],
};
