import { describe, it, expect } from 'vitest';
import {
  calculateTokenCost,
  calculateOcrCost,
  createEmptyUsage,
  mergeUsage,
  buildPipelineSummary,
} from './cost-calculator';

describe('calculateTokenCost', () => {
  it('computes input + output cost using per-1M-token pricing', () => {
    // mistral-large (Large 3): $0.5/M input, $1.5/M output — verified 2026-06-11
    const cost = calculateTokenCost('mistral-large-latest', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    expect(cost).toBeCloseTo(2, 6);
  });

  it('prices the dated alias identically to -latest (model pin safety)', () => {
    const usage = { promptTokens: 500_000, completionTokens: 200_000, totalTokens: 700_000 };
    expect(calculateTokenCost('mistral-large-2512', usage))
      .toBeCloseTo(calculateTokenCost('mistral-large-latest', usage), 9);
    expect(calculateTokenCost('mistral-small-2603', usage))
      .toBeCloseTo(calculateTokenCost('mistral-small-latest', usage), 9);
  });

  it('returns 0 for unknown models', () => {
    expect(
      calculateTokenCost('not-a-model', { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 }),
    ).toBe(0);
  });
});

describe('calculateOcrCost', () => {
  it('charges $0.002 per page ($2 per 1000 pages, verified 2026-06-11)', () => {
    expect(calculateOcrCost(1000)).toBeCloseTo(2, 6);
    expect(calculateOcrCost(0)).toBe(0);
  });
});

describe('mergeUsage', () => {
  it('sums each field', () => {
    const a = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
    const b = { promptTokens: 200, completionTokens: 30, totalTokens: 230 };
    expect(mergeUsage(a, b)).toEqual({ promptTokens: 300, completionTokens: 80, totalTokens: 380 });
  });

  it('createEmptyUsage returns zeros', () => {
    expect(createEmptyUsage()).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });
});

describe('buildPipelineSummary', () => {
  it('sums step costs and appends OCR when pages > 0', () => {
    const summary = buildPipelineSummary(
      [
        { step: 'extract', model: 'mistral-large-latest', promptTokens: 100, completionTokens: 50, costUSD: 0.5 },
      ],
      10,
    );

    expect(summary.totalPromptTokens).toBe(100);
    expect(summary.totalCompletionTokens).toBe(50);
    expect(summary.totalOcrPages).toBe(10);
    expect(summary.steps).toHaveLength(2);
    expect(summary.steps[1].step).toBe('ocr');
    expect(summary.totalCostUSD).toBeCloseTo(0.52, 4); // 0.5 token + 10pp × $0.002 OCR
  });

  it('omits the OCR step when pages = 0', () => {
    const summary = buildPipelineSummary([], 0);
    expect(summary.steps).toHaveLength(0);
    expect(summary.totalCostUSD).toBe(0);
  });
});
