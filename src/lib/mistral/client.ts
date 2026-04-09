import { Mistral, HTTPClient } from '@mistralai/mistralai';
import { logger } from '@/lib/logger';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { createEmptyUsage } from '@/services/cost-tracking/cost-calculator';

// ── Timeout per tipo di operazione ──
// Vercel Pro maxDuration must be set to 800s in project settings (Settings → Functions).
// Default 300s is NOT enough for LLM synthesis on large cases.
export const TIMEOUT_EXTRACTION = 180_000;  // 3 minuti — 1 chunk per step con Inngest Pro
export const TIMEOUT_SYNTHESIS  = 600_000;  // 10 minuti (casi grandi richiedono tempo per generare report completi)
export const TIMEOUT_DEFAULT    = 120_000;  // 2 minuti (classificazione, embedding, altro)
export const TIMEOUT_OCR        = 300_000;  // 5 minuti (documenti grandi possono richiedere tempo)

// ── Retry ──
// With Vercel maxDuration=800s, worst case must stay under budget:
// 4 attempts × 180s extraction timeout + delays ≈ 720s + ~60s delays = ~780s (safe)
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 30_000;

// ── Deterministic seed for reproducible outputs ──
export const DETERMINISTIC_SEED = 42;

// Model constants — using -latest aliases for now.
// TODO: pin to exact version IDs after verifying with Mistral List Models API.
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

export function getMistralClient(timeoutMs?: number): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY environment variable is not set');
  }
  return new Mistral({
    apiKey,
    timeoutMs: timeoutMs ?? TIMEOUT_DEFAULT,
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

// Note: in serverless (Vercel/Inngest), each invocation has its own semaphore.
// This only limits concurrency within a single process (e.g. Promise.all in dev mode).
// Cross-process rate limiting is handled by Mistral's 429 + our retry logic above.
const mistralSemaphore = new Semaphore(10);

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

      // Detect rate limit specifically for better logging
      const isRateLimit = message.includes('429') || message.includes('rate') || message.includes('Too Many');

      // Retry-After header (rate limit 429)
      let delayMs: number;
      const errObj = error as Record<string, unknown>;
      const retryAfter =
        (errObj?.response as { headers?: { get?: (k: string) => string | null } })?.headers?.get?.('retry-after') ??
        (errObj?.headers as Record<string, string> | undefined)?.['retry-after'];

      if (retryAfter) {
        // Respect server's Retry-After, capped to avoid sleeping forever
        const retryAfterMs = Math.min((parseInt(String(retryAfter), 10) || 5) * 1000, MAX_RETRY_DELAY_MS);
        const jitter = Math.round(Math.random() * 2000);
        delayMs = retryAfterMs + jitter;
        logger.warn('mistral-retry', `[retry:${label}] Rate limited — Retry-After: ${retryAfter}s, capped delay: ${delayMs}ms`);
      } else if (isRateLimit) {
        // 429 without Retry-After: use longer backoff, capped
        const baseDelay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt + 1), MAX_RETRY_DELAY_MS);
        delayMs = Math.min(Math.round(baseDelay * (0.5 + Math.random())), MAX_RETRY_DELAY_MS);
        logger.warn('mistral-retry', `[retry:${label}] Rate limited (no Retry-After), backing off ${delayMs}ms`);
      } else {
        const baseDelay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
        delayMs = Math.min(Math.round(baseDelay * (0.7 + Math.random() * 0.6)), MAX_RETRY_DELAY_MS);
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

export interface MistralChatResult {
  content: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'error' | 'tool_calls' | null;
}

export async function streamMistralChat(params: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: MistralResponseFormat;
  timeoutMs?: number;
  randomSeed?: number;
  label: string;
}): Promise<MistralChatResult> {
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
}): Promise<MistralChatResult> {
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
}): Promise<MistralChatResult> {
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
    let usage: TokenUsage = createEmptyUsage();
    let finishReason: MistralChatResult['finishReason'] = null;
    const STALL_TIMEOUT_MS = 90_000;

    for await (const event of stream) {
      const data = event.data as {
        choices?: Array<{ delta?: { content?: string }; finishReason?: string }>;
        usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
      };
      const delta = data?.choices?.[0]?.delta?.content;
      const chunkFinishReason = data?.choices?.[0]?.finishReason;
      if (chunkFinishReason) {
        finishReason = chunkFinishReason as MistralChatResult['finishReason'];
      }
      if (typeof delta === 'string' && delta.length > 0) {
        content += delta;
        lastTokenAt = Date.now();
      }
      // Capture usage from the last chunk (Mistral sends it in the final event)
      if (data?.usage) {
        usage = {
          promptTokens: data.usage.promptTokens ?? 0,
          completionTokens: data.usage.completionTokens ?? 0,
          totalTokens: data.usage.totalTokens ?? 0,
        };
      }
      if (Date.now() - lastTokenAt > STALL_TIMEOUT_MS) {
        throw new Error(
          `[mistral:${label}] Stream stalled: no tokens received for ${STALL_TIMEOUT_MS / 1000}s (${content.length} chars so far)`,
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

    if (finishReason === 'length') {
      logger.error('mistral',
        `[mistral:${label}] Response TRUNCATED: finishReason=length, ${content.length} chars. ` +
        `Output hit maxTokens limit — report may be incomplete.`,
      );
    }

    logger.info('mistral',
      `[mistral:${label}] Stream complete: ${content.length} chars in ${Date.now() - startMs}ms (finishReason: ${finishReason ?? 'unknown'})`,
    );
    return { content, usage, finishReason };
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
}): Promise<MistralChatResult> {
  const { model, messages, temperature, maxTokens, responseFormat, randomSeed, label } = params;
  const timeoutMs = params.timeoutMs ?? TIMEOUT_DEFAULT;

  // No withMistralRetry here — the stream path already exhausted its retry budget.
  // This is a single-shot fallback attempt.
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
  const finishReason = (response?.choices?.[0]?.finishReason ?? null) as MistralChatResult['finishReason'];

  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`[mistral:${label}] chat.complete() fallback returned empty content`);
  }

  const usage: TokenUsage = response?.usage
    ? {
      promptTokens: response.usage.promptTokens ?? 0,
      completionTokens: response.usage.completionTokens ?? 0,
      totalTokens: response.usage.totalTokens ?? 0,
    }
    : createEmptyUsage();

  if (finishReason === 'length') {
    logger.error('mistral',
      `[mistral:${label}] Response TRUNCATED: finishReason=length, ${content.length} chars. ` +
      `Output hit maxTokens limit — report may be incomplete.`,
    );
  }

  logger.info('mistral',
    `[mistral:${label}] Complete fallback done: ${content.length} chars in ${Date.now() - startMs}ms (finishReason: ${finishReason ?? 'unknown'})`,
  );
  return { content, usage, finishReason };
}
