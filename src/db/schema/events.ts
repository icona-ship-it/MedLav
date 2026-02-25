import {
  pgTable, uuid, text, timestamp, integer, boolean, real, date, pgEnum,
} from 'drizzle-orm/pg-core';
import { cases } from './cases';
import { documents } from './documents';

export const eventTypeEnum = pgEnum('event_type', [
  'visita',
  'esame',
  'diagnosi',
  'intervento',
  'terapia',
  'ricovero',
  'follow-up',
  'referto',
  'prescrizione',
  'consenso',
  'complicanza',
  'altro',
]);

export const datePrecisionEnum = pgEnum('date_precision', [
  'giorno',
  'mese',
  'anno',
  'sconosciuta',
]);

export const sourceTypeEnum = pgEnum('source_type', [
  'cartella_clinica',
  'referto_controllo',
  'esame_strumentale',
  'esame_ematochimico',
  'altro',
]);

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  orderNumber: integer('order_number').notNull(),
  eventDate: date('event_date').notNull(),
  datePrecision: datePrecisionEnum('date_precision').notNull().default('giorno'),
  eventType: eventTypeEnum('event_type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  sourceType: sourceTypeEnum('source_type').notNull(),
  diagnosis: text('diagnosis'),
  doctor: text('doctor'),
  facility: text('facility'),
  confidence: real('confidence').notNull().default(0), // 0-100
  requiresVerification: boolean('requires_verification').notNull().default(false),
  reliabilityNotes: text('reliability_notes'),
  expertNotes: text('expert_notes'), // annotazioni del perito
  isDeleted: boolean('is_deleted').notNull().default(false), // soft delete
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
