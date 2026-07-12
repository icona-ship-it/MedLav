import { NextRequest, NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { grantMonthlyCredits, grantCredits, revokeMonthlyCredits } from '@/services/credits/credit-service';
import { PLAN_CREDITS } from '@/services/credits/credit-costs';
import type Stripe from 'stripe';

const uuidSchema = z.string().uuid();

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ success: false, error: 'Missing signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('stripe', 'STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ success: false, error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    logger.error('stripe', `Webhook signature verification failed: ${message}`);
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // IDEMPOTENCY: Stripe delivers webhooks at-least-once. Without dedup a replayed
  // event re-grants a credit pack or re-runs grantMonthlyCredits — a money leak.
  // Record the event id (PK); un duplicato colpisce il conflitto e acchiamo senza
  // ri-processare. FAIL-CLOSED su ogni altro errore (0028 e' applicata in prod):
  // se non riusciamo a registrare l'evento non possiamo garantire l'idempotenza,
  // quindi rispondiamo 500 e lasciamo che Stripe riprovi, invece di rischiare un
  // doppio accredito.
  const { error: dedupError } = await supabase
    .from('stripe_processed_events')
    .insert({ event_id: event.id, event_type: event.type });
  if (dedupError) {
    if (dedupError.code === '23505') {
      logger.info('stripe', `Duplicate webhook event ${event.id} (${event.type}) — already processed, skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    logger.error('stripe', `Idempotency insert failed for event ${event.id} — failing closed so Stripe retries: ${dedupError.message}`);
    return NextResponse.json({ success: false, error: 'Idempotency check failed' }, { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const rawUserId = session.metadata?.userId;
        const userId = uuidSchema.safeParse(rawUserId).success ? rawUserId : null;
        if (!userId) {
          logger.warn('stripe', `Invalid or missing userId in checkout metadata: ${rawUserId}`);
          break;
        }

        // Credit pack purchase (one-time payment)
        if (session.mode === 'payment' && session.metadata?.creditPack) {
          const credits = parseInt(session.metadata.creditPack, 10);
          if (credits > 0) {
            await grantCredits(userId, credits, 'purchase', {
              stripeSessionId: session.id,
              pack: credits,
            });
            logger.info('stripe', `Credit pack purchased: ${credits} credits for user ${userId}`);
          }
          break;
        }

        // Subscription checkout
        if (session.subscription) {
          const stripe = getStripeClient();
          const subResponse = await stripe.subscriptions.retrieve(session.subscription as string);
          const sub = subResponse as unknown as { status: string; current_period_end: number };
          const { error: updateError } = await supabase.from('profiles').update({
            stripe_customer_id: session.customer as string,
            subscription_status: sub.status,
            subscription_plan: 'pro',
            subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }).eq('id', userId);
          if (updateError) {
            // throw (non return): così il catch fa il rollback dell'idempotenza e Stripe riprova.
            throw new Error(`Profile update failed after checkout for ${userId}: ${updateError.message}`);
          }

          // Grant monthly credits for new Pro subscription
          const resetAt = new Date(sub.current_period_end * 1000);
          await grantMonthlyCredits(userId, PLAN_CREDITS.pro.monthlyAllowance, resetAt);

          logger.info('stripe', `Checkout completed for user ${userId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as unknown as { customer: string; status: string; current_period_end: number };
        const customerId = subscription.customer;
        const { error: updateError } = await supabase.from('profiles').update({
          subscription_status: subscription.status,
          subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq('stripe_customer_id', customerId);
        if (updateError) {
          throw new Error(`Subscription update failed for customer ${customerId}: ${updateError.message}`);
        }

        // Refresh monthly credits on renewal
        if (subscription.status === 'active') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single();
          if (profile) {
            const resetAt = new Date(subscription.current_period_end * 1000);
            await grantMonthlyCredits(profile.id, PLAN_CREDITS.pro.monthlyAllowance, resetAt);
          }
        }

        logger.info('stripe', `Subscription updated for customer ${customerId}: ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const { error: updateError } = await supabase.from('profiles').update({
          subscription_status: 'canceled',
          subscription_plan: null,
          subscription_period_end: null,
        }).eq('stripe_customer_id', customerId);
        if (updateError) {
          throw new Error(`Subscription cancel failed for customer ${customerId}: ${updateError.message}`);
        }

        // Revoke monthly credits (purchased credits remain)
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();
        if (profile) {
          await revokeMonthlyCredits(profile.id);
        }

        logger.info('stripe', `Subscription deleted for customer ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const { error: updateError } = await supabase.from('profiles').update({
          subscription_status: 'past_due',
        }).eq('stripe_customer_id', customerId);
        if (updateError) {
          throw new Error(`Failed to mark past_due for customer ${customerId}: ${updateError.message}`);
        }
        logger.warn('stripe', `Payment failed for customer ${customerId}`);
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    logger.error('stripe', `Webhook handler error for ${event.id}: ${message}`);
    // ROLLBACK IDEMPOTENZA: l'evento era stato marcato 'processato' PRIMA di
    // eseguire l'handler; poiché l'handler NON è andato a buon fine, rimuoviamo il
    // record così la ritrasmissione at-least-once di Stripe potrà rieseguirlo.
    // Senza questo, un fallimento transitorio = provisioning perso in modo
    // permanente per un utente pagante (la retry verrebbe dedupata e saltata).
    await supabase.from('stripe_processed_events').delete().eq('event_id', event.id);
    return NextResponse.json({ success: false, error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
