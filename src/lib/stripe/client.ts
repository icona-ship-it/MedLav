import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

/**
 * Returns true when Stripe is not configured.
 * In mock mode, checkout/purchase endpoints grant credits directly
 * without going through Stripe. Set STRIPE_SECRET_KEY to switch to real mode.
 */
export function isStripeMockMode(): boolean {
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
