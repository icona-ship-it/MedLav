export const PLANS = {
  trial: {
    name: 'Trial',
    casesLimit: 5,
    description: '5 casi gratuiti per provare MedLav',
  },
  pro: {
    name: 'Pro',
    casesLimit: Infinity,
    description: 'Casi illimitati, tutte le funzionalità',
    priceMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    priceYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
  },
  enterprise: {
    name: 'Enterprise',
    casesLimit: Infinity,
    description: 'Piano personalizzato per studi e organizzazioni',
  },
} as const;

export type PlanType = keyof typeof PLANS;

export function getPlanLimits(plan: string): { casesLimit: number } {
  if (plan === 'pro' || plan === 'enterprise') {
    return { casesLimit: Infinity };
  }
  return { casesLimit: PLANS.trial.casesLimit };
}
