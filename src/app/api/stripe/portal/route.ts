import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripeClient, isStripeMockMode } from '@/lib/stripe/client';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { validateCsrfToken } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  const csrfError = await validateCsrfToken(request);
  if (csrfError) return csrfError;

  if (isStripeMockMode()) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://legmed.it';
    return NextResponse.json({ success: true, data: { url: `${siteUrl}/settings` } });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const rateCheck = await checkRateLimit({ key: `portal:${user.id}`, ...RATE_LIMITS.API });
    if (!rateCheck.success) {
      return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    const customerId = profile?.stripe_customer_id as string | null;
    if (!customerId) {
      return NextResponse.json(
        { success: false, error: 'Nessun abbonamento attivo' },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://legmed.it';

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/settings`,
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Errore interno' },
      { status: 500 },
    );
  }
}
