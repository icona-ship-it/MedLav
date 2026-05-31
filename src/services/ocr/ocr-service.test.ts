import { describe, it, expect, vi } from 'vitest';

// ocr-service imports the Mistral client at module load; stub it (we only test
// the pure coerceTableToHtml helper here).
vi.mock('@/lib/mistral/client', () => ({
  getMistralClient: vi.fn(),
  MISTRAL_MODELS: { MISTRAL_OCR: 'mistral-ocr-latest' },
  withMistralRetry: vi.fn(),
  TIMEOUT_OCR: 120_000,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { coerceTableToHtml } from './ocr-service';

describe('coerceTableToHtml — no silent lab-data loss (audit)', () => {
  it('returns a plain string table as-is', () => {
    expect(coerceTableToHtml('<table><tr><td>Na 140</td></tr></table>', 1)).toContain('Na 140');
  });

  it('extracts known string fields (html/content/markdown/text/value)', () => {
    expect(coerceTableToHtml({ html: '<table>x</table>' }, 1)).toBe('<table>x</table>');
    expect(coerceTableToHtml({ markdown: '| Na | 140 |' }, 1)).toBe('| Na | 140 |');
    expect(coerceTableToHtml({ value: 'K 5.2' }, 1)).toBe('K 5.2');
  });

  it('preserves an UNKNOWN-shape table as JSON instead of dropping it (lab data must not vanish)', () => {
    const unknown = { laboratory_data: [['Na+', '140'], ['K+', '5.2']] };
    const out = coerceTableToHtml(unknown, 3);
    expect(out).not.toBe(''); // NOT dropped
    expect(out).toContain('140');
    expect(out).toContain('5.2');
    // Never the Schönweger "[object Object]" bug
    expect(out).not.toContain('[object Object]');
  });

  it('preserves an array-shaped table as JSON', () => {
    const out = coerceTableToHtml({ rows: [{ test: 'Hb', val: '10.8' }] }, 2);
    expect(out).toContain('Hb');
    expect(out).toContain('10.8');
  });

  it('returns empty for a genuinely empty object', () => {
    expect(coerceTableToHtml({}, 1)).toBe('');
  });
});
