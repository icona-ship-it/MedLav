import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // es. 'case.create', 'document.upload', 'event.edit', 'report.generate'
  entityType: text('entity_type').notNull(), // es. 'case', 'document', 'event', 'report'
  entityId: uuid('entity_id'), // ID dell'entita coinvolta
  metadata: jsonb('metadata'), // dettagli aggiuntivi (NO dati sensibili)
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
