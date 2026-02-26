import { Mistral } from '@mistralai/mistralai';

// Timeout for individual Mistral API calls (2 minutes)
const API_TIMEOUT_MS = 120_000;

export function getMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY environment variable is not set');
  }
  return new Mistral({
    apiKey,
    timeoutMs: API_TIMEOUT_MS,
  });
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

/**
 * Retry a Mistral API call with exponential backoff.
 * Retries on: server errors, network failures, timeouts.
 */
export async function withMistralRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTransient = message.includes('500') || message.includes('503') ||
        message.includes('Service unavailable') || message.includes('internal_server_error') ||
        message.includes('overloaded') ||
        message.includes('fetch failed') || message.includes('ECONNRESET') ||
        message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') ||
        message.includes('socket hang up') || message.includes('network') ||
        message.includes('timeout') || message.includes('aborted') ||
        message.includes('Unexpected ending');

      if (isTransient && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[mistral:${label}] Error: "${message.slice(0, 100)}", retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error(`[mistral:${label}] Final error after ${attempt + 1} attempts: ${message.slice(0, 200)}`);
      throw err;
    }
  }
  throw new Error(`[mistral:${label}] Max retries exceeded`);
}

// Model constants
export const MISTRAL_MODELS = {
  /** Vision model for OCR and document analysis */
  PIXTRAL_LARGE: 'pixtral-large-latest',
  /** Large model for complex reasoning (synthesis, review) */
  MISTRAL_LARGE: 'mistral-large-latest',
  /** Small model for fast structured extraction */
  MISTRAL_SMALL: 'mistral-small-latest',
  /** Dedicated OCR model for document text extraction */
  OCR: 'mistral-ocr-latest',
} as const;
