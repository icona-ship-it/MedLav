/**
 * API cost tracking for Mistral pipeline.
 * Calculates costs based on token usage and OCR pages.
 * All costs are in USD.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostStep {
  step: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUSD: number;
}

export interface PipelineCostSummary {
  totalCostUSD: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalOcrPages: number;
  steps: CostStep[];
}

// Pricing per 1M tokens (March 2026)
const PRICING: Record<string, { input: number; output: number }> = {
  'mistral-large-latest': { input: 2, output: 6 },
  'pixtral-large-latest': { input: 2, output: 6 },
  'mistral-small-latest': { input: 0.1, output: 0.3 },
  'mistral-embed': { input: 0.1, output: 0 },
};

// OCR pricing: ~$1 per 1000 pages
const OCR_COST_PER_PAGE = 0.001;

export function calculateTokenCost(model: string, usage: TokenUsage): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

export function calculateOcrCost(pages: number): number {
  return pages * OCR_COST_PER_PAGE;
}

export function createEmptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export function buildPipelineSummary(
  steps: CostStep[],
  ocrPages: number,
): PipelineCostSummary {
  const ocrCost = calculateOcrCost(ocrPages);
  const tokenCost = steps.reduce((sum, s) => sum + s.costUSD, 0);

  return {
    totalCostUSD: Math.round((tokenCost + ocrCost) * 10000) / 10000,
    totalPromptTokens: steps.reduce((sum, s) => sum + s.promptTokens, 0),
    totalCompletionTokens: steps.reduce((sum, s) => sum + s.completionTokens, 0),
    totalOcrPages: ocrPages,
    steps: ocrPages > 0
      ? [...steps, { step: 'ocr', model: 'mistral-ocr-latest', promptTokens: 0, completionTokens: 0, costUSD: ocrCost }]
      : steps,
  };
}
