import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

/**
 * Returns true when Stripe runs in mock mode (credits/subscriptions granted
 * directly, WITHOUT payment).
 *
 * SECURITY: mock mode must NEVER be active in production. A missing
 * STRIPE_SECRET_KEY in production is a misconfiguration, not a license to hand
 * out free credits, so here we always report "not mock" in production — the real
 * Stripe path then fails closed (getStripeClient throws / priceId missing) and no
 * unpaid credits are ever granted. Mock mode exists only for local/dev/preview.
 */
export function isStripeMockMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return !process.env.STRIPE_SECRET_KEY;
}

export function getStripeClient(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripeInstance = new Stripe(key, { apiVersion: '2026-02-25.clover' });
  }
  return stripeInstance;
}
