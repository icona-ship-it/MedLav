import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // matches Supabase auth.users.id
  email: text('email').notNull(),
  fullName: text('full_name'),
  studio: text('studio'), // nome studio medico-legale
  // Stripe subscription fields
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionStatus: text('subscription_status').default('trial'),
  subscriptionPlan: text('subscription_plan'),
  subscriptionPeriodEnd: timestamp('subscription_period_end', { withTimezone: true }),
  // User preferences
  emailNotifications: boolean('email_notifications').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
