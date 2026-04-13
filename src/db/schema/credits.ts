import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const userCredits = pgTable('user_credits', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  balance: integer('balance').notNull().default(0), // crediti acquistati (non scadono)
  monthlyAllowance: integer('monthly_allowance').notNull().default(0), // crediti mensili totali del piano
  monthlyUsed: integer('monthly_used').notNull().default(0), // crediti mensili consumati questo ciclo
  monthlyResetAt: timestamp('monthly_reset_at', { withTimezone: true }), // prossimo reset mensile
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  amount: integer('amount').notNull(), // positivo = aggiunta, negativo = consumo
  balanceAfter: integer('balance_after').notNull(), // saldo totale disponibile dopo transazione
  type: text('type').notNull(), // 'monthly_grant' | 'purchase' | 'consumption' | 'refund' | 'trial_grant'
  operation: text('operation'), // 'elaborazione' | 'categorizzazione' | 'rigenerazione_sezione' | 'rigenerazione_report' | 'split_pdf'
  entityId: uuid('entity_id'), // case_id o document_id collegato
  metadata: jsonb('metadata'), // dettagli aggiuntivi (es. stripePaymentId, pageCount)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
