import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripeClient, isStripeMockMode } from '@/lib/stripe/client';
import { validateCsrfToken } from '@/lib/csrf';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { CREDIT_PACKS } from '@/services/credits/credit-costs';
import { grantCredits } from '@/services/credits/credit-service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const requestSchema = z.object({
  credits: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  const csrfError = validateCsrfToken(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `credits-purchase:${user.id}`, ...RATE_LIMITS.PROCESSING });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  const body = await request.json() as unknown;
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dati non validi' }, { status: 400 });
  }

  // Find matching pack
  const pack = CREDIT_PACKS.find((p) => p.credits === parsed.data.credits);
  if (!pack) {
    return NextResponse.json(
      { success: false, error: 'Pacchetto crediti non valido' },
      { status: 400 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://legmed.it';

  // ─── Mock mode: grant credits directly without Stripe ───
  if (isStripeMockMode()) {
    // Defense-in-depth: never grant unpaid credits in production, even if the
    // predicate above were ever to regress. isStripeMockMode() already returns
    // false in production, so this branch is unreachable there — this is the
    // second independent guard on the free-credit path.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Pagamenti non disponibili al momento. Riprova più tardi.' },
        { status: 503 },
      );
    }
    await grantCredits(user.id, pack.credits, 'purchase', {
      mockMode: true,
      pack: pack.credits,
    });

    return NextResponse.json({
      success: true,
      data: { url: `${siteUrl}/settings?purchase=success&credits=${pack.credits}` },
    });
  }

  // ─── Real Stripe mode ───
  const priceId = process.env[pack.stripePriceEnv];
  if (!priceId) {
    return NextResponse.json(
      { success: false, error: 'Pacchetto non configurato' },
      { status: 500 },
    );
  }

  // Le chiamate Stripe possono lanciare (rete, chiave, rate limit): senza guard
  // diventavano un 500 non gestito con stato potenzialmente parziale.
  try {
    const stripe = getStripeClient();

    // Get or create Stripe customer
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
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/settings?purchase=success&credits=${pack.credits}`,
      cancel_url: `${siteUrl}/settings?purchase=cancelled`,
      metadata: {
        userId: user.id,
        creditPack: String(pack.credits),
      },
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    logger.error('credits/purchase', `Stripe checkout failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json(
      { success: false, error: 'Errore nell\'avvio dell\'acquisto. Riprova.' },
      { status: 500 },
    );
  }
}
