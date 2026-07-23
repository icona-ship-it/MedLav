import { describe, it, expect } from 'vitest';
import { classifyPipelineError, sanitizeErrorForDetail, DIAGNOSTIC_CODE_LABELS } from './pipeline-diagnostics';

describe('classifyPipelineError — la causa del 235 diventa un codice consultabile', () => {
  it('429/rate limit → rate_limited (la classe del CASO-2026-235)', () => {
    expect(classifyPipelineError('Mistral API error 429 Too Many Requests')).toBe('rate_limited');
    expect(classifyPipelineError('rate limit exceeded, retry later')).toBe('rate_limited');
  });

  it('transitori di rete → timeout', () => {
    expect(classifyPipelineError('fetch failed: ETIMEDOUT')).toBe('timeout');
    expect(classifyPipelineError('upstream 503 unavailable')).toBe('timeout');
  });

  it('troncamenti/stallo/insert/pagine → codici dedicati', () => {
    expect(classifyPipelineError('truncation detected finishReason=length')).toBe('truncated');
    expect(classifyPipelineError('Stream stalled after 120s')).toBe('stream_stalled');
    expect(classifyPipelineError('Event insert failed: duplicate key')).toBe('insert_failed');
    expect(classifyPipelineError('Pages not found for doc x range 1-10')).toBe('pages_missing');
  });

  it('validatore → validator_blocked; resto → unknown', () => {
    expect(classifyPipelineError('Report non valido: 3 sezioni vuote')).toBe('validator_blocked');
    expect(classifyPipelineError('boh')).toBe('unknown');
  });

  it('ogni codice ha un\'etichetta italiana leggibile', () => {
    for (const code of ['rate_limited', 'timeout', 'truncated', 'stuck_auto_fail', 'cancelled_by_user'] as const) {
      expect(DIAGNOSTIC_CODE_LABELS[code]).toBeTruthy();
      expect(DIAGNOSTIC_CODE_LABELS[code]).not.toMatch(/[a-z]_[a-z]/); // niente snake_case a schermo
    }
  });

  it('sanitizeErrorForDetail tronca a 300 e normalizza gli spazi', () => {
    const out = sanitizeErrorForDetail(`errore\n\n${'x'.repeat(500)}`);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).not.toContain('\n');
  });
});
