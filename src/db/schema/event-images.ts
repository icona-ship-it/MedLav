import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { events } from './events';
import { pages } from './documents';

export const eventImages = pgTable('event_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }).notNull(),
  pageId: uuid('page_id').references(() => pages.id, { onDelete: 'cascade' }).notNull(),
  imagePath: text('image_path').notNull(),
  pageNumber: integer('page_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
