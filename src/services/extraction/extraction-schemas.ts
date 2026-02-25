import { z } from 'zod';

/**
 * Zod schema for a single extracted clinical event.
 * Matches the database events table structure.
 */
export const extractedEventSchema = z.object({
  eventDate: z.string().describe('Data evento in formato YYYY-MM-DD'),
  datePrecision: z.enum(['giorno', 'mese', 'anno', 'sconosciuta']),
  eventType: z.enum([
    'visita', 'esame', 'diagnosi', 'intervento', 'terapia',
    'ricovero', 'follow-up', 'referto', 'prescrizione',
    'consenso', 'complicanza', 'altro',
  ]),
  title: z.string().min(3).describe('Titolo descrittivo breve'),
  description: z.string().min(10).describe('Descrizione COMPLETA e dettagliata, copia fedele del testo originale'),
  sourceType: z.enum([
    'cartella_clinica', 'referto_controllo',
    'esame_strumentale', 'esame_ematochimico', 'altro',
  ]),
  diagnosis: z.string().nullable().optional().describe('Diagnosi associata se presente'),
  doctor: z.string().nullable().optional().describe('Nome del medico/specialista'),
  facility: z.string().nullable().optional().describe('Struttura sanitaria'),
  confidence: z.number().min(0).max(100).describe('Affidabilita estrazione 0-100'),
  requiresVerification: z.boolean().describe('True se necessita revisione manuale'),
  reliabilityNotes: z.string().nullable().optional().describe('Spiegazione se affidabilita bassa'),
  sourceText: z.string().min(5).describe('Porzione esatta del testo OCR originale da cui questo evento e stato estratto'),
  sourcePages: z.array(z.number().int().positive()).min(1).describe('Numeri delle pagine sorgente del documento da cui proviene questo evento'),
});

export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

/**
 * Schema for the complete extraction response from Mistral.
 */
export const extractionResponseSchema = z.object({
  events: z.array(extractedEventSchema),
  abbreviations: z.array(z.object({
    abbreviation: z.string(),
    expansion: z.string(),
  })).optional().describe('Abbreviazioni mediche trovate con espansione'),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

/**
 * JSON Schema representation for Mistral structured output.
 * Mirrors the Zod schema above for the API call.
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
          sourceText: { type: 'string' as const, description: 'Porzione esatta del testo OCR originale da cui estratto questo evento' },
          sourcePages: {
            type: 'array' as const,
            items: { type: 'integer' as const, minimum: 1 },
            minItems: 1,
            description: 'Numeri pagine sorgente',
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
