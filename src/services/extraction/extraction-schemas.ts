import { z } from 'zod';

/**
 * Zod schema for a single extracted clinical event.
 * Used for validation AFTER json_schema mode ensures structure.
 */
export const extractedEventSchema = z.object({
  eventDate: z.string(),
  datePrecision: z.enum(['giorno', 'mese', 'anno', 'sconosciuta']),
  eventType: z.enum([
    'visita', 'esame', 'diagnosi', 'intervento', 'terapia',
    'ricovero', 'follow-up', 'referto', 'prescrizione',
    'consenso', 'complicanza', 'altro',
  ]),
  title: z.string(),
  description: z.string(),
  sourceType: z.enum([
    'cartella_clinica', 'referto_controllo',
    'esame_strumentale', 'esame_ematochimico', 'altro',
  ]),
  diagnosis: z.string().nullable().optional(),
  doctor: z.string().nullable().optional(),
  facility: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100),
  requiresVerification: z.boolean(),
  reliabilityNotes: z.string().nullable().optional(),
  sourceText: z.string(),
  sourcePages: z.array(z.number().int().positive()).min(1),
});

export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

/**
 * Schema for the complete extraction response.
 */
export const extractionResponseSchema = z.object({
  events: z.array(extractedEventSchema),
  abbreviations: z.array(z.object({
    abbreviation: z.string(),
    expansion: z.string(),
  })).optional(),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

/**
 * JSON Schema for Mistral json_schema response format.
 * This is what forces the model to output the exact structure.
 */
export const extractionJsonSchema = {
  type: 'object' as const,
  properties: {
    events: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          eventDate: { type: 'string' as const },
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
