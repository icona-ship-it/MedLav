import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { cases } from './cases';
import { profiles } from './profiles';

export const caseShares = pgTable('case_shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(),
  label: text('label'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  viewCount: integer('view_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
