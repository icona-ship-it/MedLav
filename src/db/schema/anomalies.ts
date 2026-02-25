import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const anomalyTypeEnum = pgEnum('anomaly_type', [
  'ritardo_diagnostico',
  'gap_post_chirurgico',
  'gap_documentale',
  'complicanza_non_gestita',
  'consenso_non_documentato',
  'diagnosi_contraddittoria',
  'terapia_senza_followup',
]);

export const anomalySeverityEnum = pgEnum('anomaly_severity', [
  'critica',
  'alta',
  'media',
  'bassa',
]);

export const anomalies = pgTable('anomalies', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  anomalyType: anomalyTypeEnum('anomaly_type').notNull(),
  severity: anomalySeverityEnum('severity').notNull(),
  description: text('description').notNull(),
  involvedEvents: text('involved_events'), // JSON array of event IDs and descriptions
  suggestion: text('suggestion'), // suggerimento per il perito
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const missingDocuments = pgTable('missing_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  documentName: text('document_name').notNull(),
  reason: text('reason').notNull(), // perche e rilevante
  relatedEvent: text('related_event'), // evento correlato
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
