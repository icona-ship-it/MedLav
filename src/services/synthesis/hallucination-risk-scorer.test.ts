import { describe, it, expect } from 'vitest';
import { computeHrs, getHrsLevel } from './hallucination-risk-scorer';
import type { ReportValidation } from './report-validator';

function makeValidation(issues: ReportValidation['issues']): ReportValidation {
  return {
    valid: !issues.some((i) => i.severity === 'error'),
    issues,
    eventCoverage: 100,
  };
}

describe('computeHrs', () => {
  it('should return 100 for a clean report with no issues', () => {
    expect(computeHrs(makeValidation([]))).toBe(100);
  });

  it('should subtract penalty for a phantom_date warning', () => {
    const v = makeValidation([
      { type: 'phantom_date', severity: 'warning', message: 'fake date' },
    ]);
    expect(computeHrs(v)).toBe(85); // 100 - 15
  });

  it('should subtract heavy penalty for sentinel_date_leak error', () => {
    const v = makeValidation([
      { type: 'sentinel_date_leak', severity: 'error', message: '01/01/1900 found' },
    ]);
    expect(computeHrs(v)).toBe(40); // 100 - 60
  });

  it('should aggregate multiple penalties', () => {
    const v = makeValidation([
      { type: 'phantom_date', severity: 'warning', message: 'date 1' },
      { type: 'unverified_citation', severity: 'warning', message: 'quote 1' },
      { type: 'numerical_mismatch', severity: 'warning', message: 'ITT' },
    ]);
    expect(computeHrs(v)).toBe(55); // 100 - 15 - 10 - 20
  });

  it('should cap at 3 occurrences per type', () => {
    const issues: ReportValidation['issues'] = [];
    for (let i = 0; i < 10; i++) {
      issues.push({ type: 'phantom_date', severity: 'warning', message: `date ${i}` });
    }
    const v = makeValidation(issues);
    // Capped at 3: 100 - 3*15 = 55
    expect(computeHrs(v)).toBe(55);
  });

  it('should never go below 0', () => {
    const v = makeValidation([
      { type: 'empty_report', severity: 'error', message: 'empty' },
      { type: 'truncated_response', severity: 'error', message: 'truncated' },
      { type: 'sentinel_date_leak', severity: 'error', message: '1900' },
    ]);
    expect(computeHrs(v)).toBe(0);
  });

  it('should treat unknown issue types with default 5-point penalty', () => {
    const v = makeValidation([
      // @ts-expect-error — testing fallback for unknown type
      { type: 'completely_new_type_not_in_map', severity: 'warning', message: 'foo' },
    ]);
    expect(computeHrs(v)).toBe(95); // 100 - 5 (default fallback)
  });
});

describe('getHrsLevel', () => {
  it('should classify scores into qualitative levels', () => {
    expect(getHrsLevel(95)).toBe('eccellente');
    expect(getHrsLevel(85)).toBe('buono');
    expect(getHrsLevel(60)).toBe('da_rivedere');
    expect(getHrsLevel(30)).toBe('critico');
  });

  it('should handle boundary values', () => {
    expect(getHrsLevel(90)).toBe('eccellente');
    expect(getHrsLevel(89)).toBe('buono');
    expect(getHrsLevel(70)).toBe('buono');
    expect(getHrsLevel(69)).toBe('da_rivedere');
    expect(getHrsLevel(50)).toBe('da_rivedere');
    expect(getHrsLevel(49)).toBe('critico');
    expect(getHrsLevel(0)).toBe('critico');
  });
});
