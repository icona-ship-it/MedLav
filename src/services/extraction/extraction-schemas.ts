import { z } from 'zod';

/**
 * Schema for a single extracted clinical event.
 * Simple types, no transforms — normalization happens in the parser.
 */
export const extractedEventSchema = z.object({
  eventDate: z.string(),
  datePrecision: z.string(),
  eventType: z.string(),
  title: z.string(),
  description: z.string(),
  sourceType: z.string(),
  diagnosis: z.string().nullable(),
  doctor: z.string().nullable(),
  facility: z.string().nullable(),
  confidence: z.number(),
  requiresVerification: z.boolean(),
  reliabilityNotes: z.string().nullable(),
  sourceText: z.string(),
  sourcePages: z.array(z.number()),
});

export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

export type ExtractionResponse = {
  events: ExtractedEvent[];
  abbreviations?: Array<{ abbreviation: string; expansion: string }>;
  /** True quando il JSON LLM NON è stato parsato pulito (Livello 1) ma RIPARATO
   * (jsonrepair) o RECUPERATO da troncatura: in entrambi i casi la coda incompleta
   * può essere stata scartata → gli eventi sono flaggati requiresVerification e va
   * emesso un warning doc-level "verificare completezza" ("mai perdere un fatto"). */
  partialRecovery?: boolean;
};
