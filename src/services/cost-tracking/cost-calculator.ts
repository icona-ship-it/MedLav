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

// Pricing per 1M tokens — verified on mistral.ai/pricing 2026-06-11.
// Mistral Large 3 is $0.5/$1.5 (the old $2/$6 was Large 2 — kept stale here
// for months, overstating every case cost ~2.3×). Dated aliases included so a
// future model pin doesn't silently zero the cost tracking (unknown model → 0).
const PRICING: Record<string, { input: number; output: number }> = {
  'mistral-large-latest': { input: 0.5, output: 1.5 },
  'mistral-large-2512': { input: 0.5, output: 1.5 },
  // Medium (judge claim-verify) — listino storico Medium 3.x; il pricing
  // per-modello 2026 non è esposto in chiaro sulla pagina pubblica: da
  // RIVERIFICARE in console col prossimo check trimestrale (2026-09).
  'mistral-medium-latest': { input: 0.4, output: 2.0 },
  'mistral-small-latest': { input: 0.1, output: 0.3 },
  'mistral-small-2603': { input: 0.1, output: 0.3 },
  'mistral-embed': { input: 0.1, output: 0 },
};

// OCR pricing: $2 per 1000 pages (verified 2026-06-11 — was wrongly $1/1000)
const OCR_COST_PER_PAGE = 0.002;

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
      ? [...steps, { step: 'ocr', model: 'mistral-ocr-2512', promptTokens: 0, completionTokens: 0, costUSD: ocrCost }]
      : steps,
  };
}
