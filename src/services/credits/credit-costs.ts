/**
 * Credit cost constants for all AI operations.
 *
 * Pricing model (confirmed):
 * - Trial: 30 credits one-time
 * - Pro €69/month: 900 credits/month (no rollover)
 * - Extra packs: 100=€9, 300=€24, 1000=€69
 */

export const CREDIT_COSTS = {
  /** Fixed base cost per case elaboration */
  elaborazione_base: 5,
  /** Per-page cost for case elaboration (added to base) */
  elaborazione_per_page: 1,
  /** AI document classification (per document) */
  categorizzazione: 1,
  /** Regenerate a single report section */
  rigenerazione_sezione: 5,
  /** Regenerate the entire report */
  rigenerazione_report: 20,
  /** Split a mixed PDF (per resulting document) */
  split_pdf: 3,
} as const;

export type CreditOperation = keyof typeof CREDIT_COSTS;

/** Plan credit allocations */
export const PLAN_CREDITS = {
  trial: {
    /** One-time grant for new trial users */
    initialGrant: 30,
    /** No monthly allowance */
    monthlyAllowance: 0,
  },
  pro: {
    /** No initial grant (monthly covers it) */
    initialGrant: 0,
    /** Monthly allowance — resets each billing cycle, does NOT roll over */
    monthlyAllowance: 900,
  },
} as const;

/** Credit packs available for purchase */
export const CREDIT_PACKS = [
  { credits: 100, priceEur: 9, stripePriceEnv: 'STRIPE_PRICE_CREDITS_100' },
  { credits: 300, priceEur: 24, stripePriceEnv: 'STRIPE_PRICE_CREDITS_300' },
  { credits: 1000, priceEur: 69, stripePriceEnv: 'STRIPE_PRICE_CREDITS_1000' },
] as const;

/**
 * Estimate total credits needed for a case elaboration.
 * @param totalPages - sum of pages across all documents in the case
 */
export function estimateElaborationCredits(totalPages: number): number {
  return CREDIT_COSTS.elaborazione_base + (totalPages * CREDIT_COSTS.elaborazione_per_page);
}
