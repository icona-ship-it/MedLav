/**
 * Credit cost constants for all AI operations.
 * FLAT pricing per operation — no per-page calculation.
 *
 * - Trial: 30 credits one-time (= 1 full analysis)
 * - Pro €69/month: 900 credits/month (= 30 full analyses)
 * - Extra packs: 100=€9, 300=€24, 1000=€69
 */

import type { PipelineMode } from '@/types/modules';

/** Fixed credit costs per operation */
export const CREDIT_COSTS = {
  /** Full analysis: OCR + extraction + report */
  elaborazione_completa: 30,
  /** Extraction only: OCR + events */
  elaborazione_estrazione: 15,
  /** Expenses only: OCR + expense table */
  elaborazione_spese: 10,
  /** Anonymization only: OCR + redact */
  elaborazione_anonimizzazione: 5,
  /** AI document classification (per document) */
  categorizzazione: 1,
  /** Regenerate a single report section */
  rigenerazione_sezione: 5,
  /** Regenerate the entire report */
  rigenerazione_report: 20,
  /** Split a mixed PDF (per resulting document) */
  split_pdf: 3,
  /** Map a legal question (quesito) to events/anomalies — single Mistral Large call */
  quesito: 1,
  /** AI document organization/analysis (per document analyzed) */
  organizzazione_documenti: 1,
  /**
   * Voice dictation (Voxtral) — flat per clip, regardless of duration.
   * The clip is capped to 5 min server-side, so worst-case Mistral cost is
   * ~$0.015 (= 1.5 credit-equivalent), well within the 1-credit price.
   */
  dettatura: 1,
} as const;

export type CreditOperation = keyof typeof CREDIT_COSTS;

/** Map pipeline_mode to credit cost */
export function getElaborationCost(pipelineMode: PipelineMode | string): number {
  switch (pipelineMode) {
    case 'full': return CREDIT_COSTS.elaborazione_completa;
    case 'extraction_only': return CREDIT_COSTS.elaborazione_estrazione;
    case 'expenses_only': return CREDIT_COSTS.elaborazione_spese;
    case 'anonymize_only': return CREDIT_COSTS.elaborazione_anonimizzazione;
    default: return CREDIT_COSTS.elaborazione_completa;
  }
}

/** Human-readable label for pipeline mode cost */
export function getElaborationLabel(pipelineMode: PipelineMode | string): string {
  switch (pipelineMode) {
    case 'full': return 'Analisi completa';
    case 'extraction_only': return 'Solo estrazione';
    case 'expenses_only': return 'Analisi spese';
    case 'anonymize_only': return 'Anonimizzazione';
    default: return 'Analisi completa';
  }
}

/** Plan credit allocations */
export const PLAN_CREDITS = {
  trial: {
    initialGrant: 30,
    monthlyAllowance: 0,
  },
  pro: {
    initialGrant: 0,
    monthlyAllowance: 900,
  },
} as const;

/** Credit packs available for purchase */
export const CREDIT_PACKS = [
  { credits: 100, priceEur: 9, stripePriceEnv: 'STRIPE_PRICE_CREDITS_100' },
  { credits: 300, priceEur: 24, stripePriceEnv: 'STRIPE_PRICE_CREDITS_300' },
  { credits: 1000, priceEur: 69, stripePriceEnv: 'STRIPE_PRICE_CREDITS_1000' },
] as const;
