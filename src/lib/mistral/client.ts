import { Mistral } from '@mistralai/mistralai';

let mistralClient: Mistral | null = null;

export function getMistralClient(): Mistral {
  if (!mistralClient) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY environment variable is not set');
    }
    mistralClient = new Mistral({ apiKey });
  }
  return mistralClient;
}

// Model constants
export const MISTRAL_MODELS = {
  /** Vision model for OCR and document analysis */
  PIXTRAL_LARGE: 'pixtral-large-latest',
  /** Large model for text analysis, extraction, and synthesis */
  MISTRAL_LARGE: 'mistral-large-latest',
  /** Dedicated OCR model for document text extraction */
  OCR: 'mistral-ocr-latest',
} as const;
