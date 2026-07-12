import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripeClient, isStripeMockMode } from '@/lib/stripe/client';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { PLANS } from '@/lib/stripe/config';
import { CREDIT_PACKS } from '@/services/credits/credit-costs';
import { grantMonthlyCredits } from '@/services/credits/credit-service';
import { logger } from '@/lib/logger';
import { PLAN_CREDITS } from '@/services/credits/credit-costs';
import { z } from 'zod';

const requestSchema = z.object({
  priceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrfToken(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const rateCheck = await checkRateLimit({ key: `checkout:${user.id}`, ...RATE_LIMITS.PROCESSING });
    if (!rateCheck.success) {
      return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
    }

    const body = await request.json() as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://legmed.it';

    // ─── Mock mode: grant Pro directly without Stripe ───
    if (isStripeMockMode()) {
      // Defense-in-depth: never activate a paid plan for free in production.
      // isStripeMockMode() already returns false in production, so this is the
      // second independent guard on the free-subscription path.
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { success: false, error: 'Pagamenti non disponibili al momento. Riprova più tardi.' },
          { status: 503 },
        );
      }
      const admin = createAdminClient();

      // Activate Pro subscription in profile
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      await admin.from('profiles').update({
        subscription_status: 'active',
        subscription_plan: 'pro',
        subscription_period_end: nextMonth.toISOString(),
      }).eq('id', user.id);

      // Grant monthly credits
      await grantMonthlyCredits(user.id, PLAN_CREDITS.pro.monthlyAllowance, nextMonth);

      return NextResponse.json({
        success: true,
        data: { url: `${siteUrl}/settings?checkout=success` },
      });
    }

    // ─── Real Stripe mode ───

    // Validate priceId against known prices to prevent arbitrary price injection
    const creditPackPriceIds = CREDIT_PACKS
      .map((p) => process.env[p.stripePriceEnv])
      .filter(Boolean);
    const allowedPriceIds = [
      PLANS.pro.priceMonthly,
      PLANS.pro.priceYearly,
      ...creditPackPriceIds,
    ].filter(Boolean);

    if (!allowedPriceIds.includes(parsed.data.priceId)) {
      return NextResponse.json(
        { success: false, error: 'Piano non valido. Seleziona un piano disponibile.' },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();

    // Check if user already has a Stripe customer ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: parsed.data.priceId, quantity: 1 }],
      success_url: `${siteUrl}/settings?checkout=success`,
      cancel_url: `${siteUrl}/pricing?checkout=cancelled`,
      metadata: { userId: user.id },
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    // Il dettaglio d'errore (potenziale info Stripe/interna) resta nei log server.
    logger.error('stripe/checkout', `Checkout failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json(
      { success: false, error: 'Errore nella creazione del pagamento. Riprova.' },
      { status: 500 },
    );
  }
}
