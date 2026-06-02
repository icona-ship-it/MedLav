import { describe, it, expect } from 'vitest';
import { validateCaseForProcessing, PIPELINE_LIMITS } from './pipeline-limits';

describe('validateCaseForProcessing', () => {
  it('should accept 0 documents as valid (empty check is elsewhere)', () => {
    const result = validateCaseForProcessing({ documentCount: 0 });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('should accept normal document count without warnings', () => {
    const result = validateCaseForProcessing({ documentCount: 50 });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('should accept exactly WARN_DOCUMENTS without warning', () => {
    const result = validateCaseForProcessing({ documentCount: PIPELINE_LIMITS.WARN_DOCUMENTS });
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('should warn when above WARN_DOCUMENTS threshold', () => {
    const result = validateCaseForProcessing({ documentCount: PIPELINE_LIMITS.WARN_DOCUMENTS + 1 });
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('più tempo');
  });

  it('should accept exactly MAX_DOCUMENTS', () => {
    const result = validateCaseForProcessing({ documentCount: PIPELINE_LIMITS.MAX_DOCUMENTS });
    expect(result.valid).toBe(true);
  });

  it('should reject above MAX_DOCUMENTS', () => {
    const result = validateCaseForProcessing({ documentCount: PIPELINE_LIMITS.MAX_DOCUMENTS + 1 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Troppi documenti');
    expect(result.error).toContain(String(PIPELINE_LIMITS.MAX_DOCUMENTS));
  });

  it('should reject very large document count', () => {
    const result = validateCaseForProcessing({ documentCount: 10000 });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('PIPELINE_LIMITS — cost caps', () => {
  it('should define a sane per-run page cap (denial-of-wallet guard)', () => {
    expect(PIPELINE_LIMITS.MAX_PAGES_PER_RUN).toBeGreaterThan(0);
    // Generous enough for a large real case, but a finite ceiling on LLM cost.
    expect(PIPELINE_LIMITS.MAX_PAGES_PER_RUN).toBeGreaterThanOrEqual(1000);
    expect(Number.isInteger(PIPELINE_LIMITS.MAX_PAGES_PER_RUN)).toBe(true);
  });

  it('should keep the per-file size cap finite', () => {
    expect(PIPELINE_LIMITS.MAX_FILE_SIZE_MB).toBeGreaterThan(0);
    expect(PIPELINE_LIMITS.MAX_FILE_SIZE_MB).toBeLessThanOrEqual(500);
  });
});
