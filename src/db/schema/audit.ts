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

/**
 * Forensic-grade audit archive — sopravvive a delete account/profile.
 *
 * Schema duplicato (no FK a profiles) intenzionale per GDPR Art. 17:
 * il diritto all'oblio richiede la cancellazione dei dati utente, MA per
 * software medico-legale serve mantenere traccia di azioni forensiche
 * (cancellazione account, export dati, deposito perizia) ai sensi di:
 *  - Codice Privacy Art. 6 (legittimo interesse legale)
 *  - Art. 6(1)(c) GDPR (obbligo legale di audit per Art. 9 dati sanitari)
 *  - Art. 32 GDPR (sicurezza del trattamento)
 *
 * Retention: 5 anni dalla creazione (configurabile). Solo INSERT da
 * service_role — nessuna DELETE possibile via RLS.
 *
 * Cosa NON loggare qui: dati clinici, nomi, contenuto report. Solo
 * metadata operativi (action type, entity_id come UUID opaco, timestamp).
 */
export const auditArchive = pgTable('audit_archive', {
  id: uuid('id').defaultRandom().primaryKey(),
  // NB: no .references() — sopravvive a profile delete by design
  userId: uuid('user_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
