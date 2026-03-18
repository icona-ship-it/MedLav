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
