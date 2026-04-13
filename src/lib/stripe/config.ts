export const PLANS = {
  trial: {
    name: 'Trial',
    casesLimit: Infinity,
    description: '30 crediti gratuiti per provare LegMed',
    credits: 30,
  },
  pro: {
    name: 'Pro',
    casesLimit: Infinity,
    description: '900 crediti/mese, tutte le funzionalità',
    priceMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    priceYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
    monthlyPrice: 69,
    yearlyPrice: 660,
    yearlyMonthlyEquivalent: 55,
    credits: 900,
  },
  enterprise: {
    name: 'Enterprise',
    casesLimit: Infinity,
    description: 'Piano personalizzato per studi e organizzazioni',
    credits: 0,
  },
} as const;

export type PlanType = keyof typeof PLANS;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getPlanLimits(plan: string): { casesLimit: number } {
  // All plans now have unlimited cases — gated by credits instead
  return { casesLimit: Infinity };
}
