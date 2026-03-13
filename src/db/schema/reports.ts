import { pgTable, uuid, text, timestamp, integer, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const reportStatusEnum = pgEnum('report_status', [
  'bozza',
  'in_revisione',
  'definitivo',
]);

export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull().default(1),
  status: reportStatusEnum('report_status').notNull().default('bozza'),
  synthesis: text('synthesis'), // sintesi medico-legale HTML
  generationMetadata: jsonb('generation_metadata').$type<{ promptVersion?: string }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reportExports = pgTable('report_exports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'cascade' }).notNull(),
  format: text('format').notNull(), // 'html', 'csv', 'docx'
  storagePath: text('storage_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
