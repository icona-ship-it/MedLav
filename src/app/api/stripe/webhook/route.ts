import { NextRequest, NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
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
            logger.error('stripe', `Failed to update profile after checkout for user ${userId}: ${updateError.message}`);
            return NextResponse.json({ success: false, error: 'Profile update failed' }, { status: 500 });
          }
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
          logger.error('stripe', `Failed to update subscription for customer ${customerId}: ${updateError.message}`);
          return NextResponse.json({ success: false, error: 'Subscription update failed' }, { status: 500 });
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
          logger.error('stripe', `Failed to cancel subscription for customer ${customerId}: ${updateError.message}`);
          return NextResponse.json({ success: false, error: 'Subscription cancel failed' }, { status: 500 });
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
          logger.error('stripe', `Failed to mark past_due for customer ${customerId}: ${updateError.message}`);
          return NextResponse.json({ success: false, error: 'Payment status update failed' }, { status: 500 });
        }
        logger.warn('stripe', `Payment failed for customer ${customerId}`);
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    logger.error('stripe', `Webhook handler error: ${message}`);
    return NextResponse.json({ success: false, error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
