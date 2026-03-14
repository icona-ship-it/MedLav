import { Mistral, HTTPClient } from '@mistralai/mistralai';
import { logger } from '@/lib/logger';

// ── Timeout per tipo di operazione ──
// Vercel Pro maxDuration = 800s per Inngest step.
// Each Mistral call runs in its own step, so it gets the full budget.
// Leave ~100s margin for DB ops, RAG retrieval, retries.
export const TIMEOUT_EXTRACTION = 300_000;  // 5 minuti
export const TIMEOUT_SYNTHESIS  = 660_000;  // 11 minuti (max per singola chiamata in step dedicato)
export const TIMEOUT_DEFAULT    = 120_000;  // 2 minuti (OCR e altro)

// ── Retry ──
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30_000;

// ── Deterministic seed for reproducible outputs ──
export const DETERMINISTIC_SEED = 42;

// Model constants — pinned to dated releases for reproducibility
// See https://docs.mistral.ai/getting-started/models for valid IDs
export const MISTRAL_MODELS = {
  /** Vision model for OCR and document analysis */
  PIXTRAL_LARGE: 'pixtral-large-24-11',
  /** Large model for complex reasoning (synthesis, review) */
  MISTRAL_LARGE: 'mistral-large-2-1-24-11',
  /** Small model for fast structured extraction */
  MISTRAL_SMALL: 'mistral-small-3-1-25-03',
  /** Dedicated OCR model for document text extraction */
  OCR: 'mistral-ocr-2503',
} as const;

/**
 * Custom fetcher that ensures Content-Length header is set on POST requests.
 * Mistral's OCR endpoint returns 411 if Content-Length is missing,
 * and Node.js fetch() sometimes uses Transfer-Encoding: chunked instead.
 */
async function fetchWithContentLength(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init == null) {
    // Request object — read body and ensure Content-Length
    if (input instanceof Request && input.body && !input.headers.has('content-length')) {
      const cloned = input.clone();
      const bodyBytes = await cloned.arrayBuffer();
      const headers = new Headers(input.headers);
      headers.set('content-length', String(bodyBytes.byteLength));

      return fetch(input.url, {
        method: input.method,
        headers,
        body: bodyBytes,
        signal: input.signal,
      });
    }
    return fetch(input);
  }

  // init provided — check if body needs Content-Length
  if (init.body && typeof init.body === 'string') {
    const headers = new Headers(init.headers);
    if (!headers.has('content-length')) {
      headers.set('content-length', String(new TextEncoder().encode(init.body).byteLength));
      return fetch(input, { ...init, headers });
    }
  }
  return fetch(input, init);
}

export function getMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY environment variable is not set');
  }
  return new Mistral({
    apiKey,
    timeoutMs: TIMEOUT_DEFAULT,
    httpClient: new HTTPClient({ fetcher: fetchWithContentLength }),
  });
}

// ── Circuit Breaker: fail-fast quando Mistral e' persistentemente down ──
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 10,
    private readonly resetMs: number = 60_000,
  ) {}

  check(label: string): void {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = 'half-open';
        logger.info('circuit-breaker', ` Half-open: allowing probe request (${label})`);
      } else {
        throw new Error(
          `[circuit-breaker] Circuit OPEN — Mistral API appears down. ` +
          `${this.failures} consecutive failures. Retry in ${Math.round((this.resetMs - (Date.now() - this.lastFailure)) / 1000)}s. ` +
          `Failing fast for: ${label}`,
        );
      }
    }
  }

  recordSuccess(): void {
    if (this.failures > 0) {
      logger.info('circuit-breaker', ` Success after ${this.failures} failures — circuit closed`);
    }
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.error('circuit-breaker', ` Circuit OPEN after ${this.failures} consecutive failures`);
    }
  }
}

const mistralCircuitBreaker = new CircuitBreaker(10, 60_000);

// ── Semaforo per limitare chiamate API parallele ──
class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const mistralSemaphore = new Semaphore(5);

// ── Transient error detection ──
function isTransientError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('500') || message.includes('502') ||
    message.includes('503') || message.includes('429') ||
    message.includes('Service unavailable') || message.includes('internal_server_error') ||
    message.includes('overloaded') || message.includes('Bad gateway') ||
    message.includes('fetch failed') || message.includes('ECONNRESET') ||
    message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') ||
    message.includes('socket hang up') || message.includes('network') ||
    message.includes('timeout') || message.includes('aborted') ||
    message.includes('Unexpected ending') || message.includes('Stream stalled')
  );
}

/**
 * Retry a Mistral API call with exponential backoff + jitter + circuit breaker.
 * Retries on: server errors, network failures, timeouts.
 */
export async function withMistralRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  mistralCircuitBreaker.check(label);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      mistralCircuitBreaker.recordSuccess();
      return result;
    } catch (error: unknown) {
      const isLast = attempt === MAX_RETRIES - 1;
      const message = error instanceof Error ? error.message : String(error);

      if (!isTransientError(error) || isLast) {
        mistralCircuitBreaker.recordFailure();
        logger.error('mistral-retry',
          `[retry:${label}] Final failure after ${attempt + 1} attempts: ${message.slice(0, 200)}`,
        );
        throw error;
      }

      // Retry-After header (rate limit 429)
      let delayMs: number;
      const errObj = error as Record<string, unknown>;
      const retryAfter =
        (errObj?.response as { headers?: { get?: (k: string) => string | null } })?.headers?.get?.('retry-after') ??
        (errObj?.headers as Record<string, string> | undefined)?.['retry-after'];

      if (retryAfter) {
        delayMs = (parseInt(String(retryAfter), 10) || 5) * 1000;
        logger.info('mistral-retry', `[retry:${label}] Using Retry-After header: ${retryAfter}s`);
      } else {
        const baseDelay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
        const jitter = baseDelay * (0.7 + Math.random() * 0.6);
        delayMs = Math.round(jitter);
      }

      logger.info('mistral-retry',
        `[retry:${label}] Attempt ${attempt + 1}/${MAX_RETRIES} failed, ` +
        `retry in ${delayMs}ms: ${message.slice(0, 100)}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`[retry:${label}] Unreachable`);
}

// ── Response format types ──
type JsonObjectFormat = { type: 'json_object' | 'text' };
type JsonSchemaFormat = {
  type: 'json_schema';
  jsonSchema: { name: string; schemaDefinition: Record<string, unknown> };
};
export type MistralResponseFormat = JsonObjectFormat | JsonSchemaFormat;

// ── Streaming chat with stall detection + fallback ──

export async function streamMistralChat(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: MistralResponseFormat;
  timeoutMs?: number;
  randomSeed?: number;
  label: string;
}): Promise<string> {
  await mistralSemaphore.acquire();
  try {
    return await _streamWithFallback(params);
  } finally {
    mistralSemaphore.release();
  }
}

async function _streamWithFallback(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: MistralResponseFormat;
  timeoutMs?: number;
  randomSeed?: number;
  label: string;
}): Promise<string> {
  const { label } = params;
  try {
    return await _streamMistralChatInternal(params);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isStreamSpecificError =
      message.includes('Stream stalled') ||
      message.includes('content is empty');

    if (isStreamSpecificError) {
      logger.warn('mistral',
        `[mistral:${label}] Stream-specific failure, falling back to chat.complete(): ${message.slice(0, 100)}`,
      );
      return await _completeMistralChatFallback(params);
    }
    throw error;
  }
}

async function _streamMistralChatInternal(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: MistralResponseFormat;
  timeoutMs?: number;
  randomSeed?: number;
  label: string;
}): Promise<string> {
  const { model, messages, temperature, maxTokens, responseFormat, randomSeed, label } = params;
  const timeoutMs = params.timeoutMs ?? TIMEOUT_DEFAULT;

  return withMistralRetry(async () => {
    const client = getMistralClient();
    const startMs = Date.now();

    const stream = await client.chat.stream(
      {
        model,
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        temperature,
        maxTokens,
        ...(responseFormat && { responseFormat }),
        ...(randomSeed != null && { randomSeed }),
      },
      { timeoutMs },
    );

    let content = '';
    let lastLogAt = 0;
    let lastTokenAt = Date.now();
    const STALL_TIMEOUT_MS = 90_000;

    for await (const event of stream) {
      const delta = (event.data as { choices?: Array<{ delta?: { content?: string } }> })
        ?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        content += delta;
        lastTokenAt = Date.now();
      }
      if (Date.now() - lastTokenAt > STALL_TIMEOUT_MS && content.length === 0) {
        throw new Error(
          `[mistral:${label}] Stream stalled: no tokens received for ${STALL_TIMEOUT_MS / 1000}s`,
        );
      }
      if (content.length - lastLogAt >= 2000) {
        logger.debug('mistral',
          `[mistral:${label}] Streaming... ${content.length} chars (${Date.now() - startMs}ms)`,
        );
        lastLogAt = content.length;
      }
    }

    if (content.length === 0) {
      throw new Error(`[mistral:${label}] Stream completed but content is empty`);
    }

    logger.info('mistral',
      `[mistral:${label}] Stream complete: ${content.length} chars in ${Date.now() - startMs}ms`,
    );
    return content;
  }, label);
}

async function _completeMistralChatFallback(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: MistralResponseFormat;
  timeoutMs?: number;
  randomSeed?: number;
  label: string;
}): Promise<string> {
  const { model, messages, temperature, maxTokens, responseFormat, randomSeed, label } = params;
  const timeoutMs = params.timeoutMs ?? TIMEOUT_DEFAULT;

  return withMistralRetry(async () => {
    const client = getMistralClient();
    const startMs = Date.now();

    logger.info('mistral', `[mistral:${label}] Using chat.complete() fallback (timeout: ${timeoutMs}ms)`);

    const response = await client.chat.complete(
      {
        model,
        messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        temperature,
        maxTokens,
        ...(responseFormat && { responseFormat }),
        ...(randomSeed != null && { randomSeed }),
      },
      { timeoutMs },
    );

    const content = response?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.length === 0) {
      throw new Error(`[mistral:${label}] chat.complete() returned empty content`);
    }

    logger.info('mistral',
      `[mistral:${label}] Complete fallback done: ${content.length} chars in ${Date.now() - startMs}ms`,
    );
    return content;
  }, label);
}
