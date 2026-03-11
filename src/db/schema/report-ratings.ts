import { pgTable, uuid, text, timestamp, integer, unique } from 'drizzle-orm/pg-core';
import { reports } from './reports';
import { profiles } from './profiles';

export const reportRatings = pgTable('report_ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('report_ratings_report_user_unique').on(table.reportId, table.userId),
]);
