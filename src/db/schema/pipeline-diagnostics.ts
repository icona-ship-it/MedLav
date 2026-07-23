import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { cases } from './cases';

/**
 * Registro di diagnostica per-caso (post-incidente CASO-2026-235, 2026-07-24):
 * ogni rallentamento, retry esaurito, fallimento di step o annullamento lascia
 * una riga con CODICE e contatori — mai testo clinico (GDPR Art. 9: qui vivono
 * solo codici macchina, conteggi, range di pagine e messaggi tecnici troncati).
 *
 * Obiettivo: quando qualcosa sembra "bloccato" o fallisce, il PERCHÉ deve
 * stare in una query, non in un'indagine sui log effimeri di Vercel.
 * Una riga per (caso, step, codice): `count` si incrementa, `last_at` avanza,
 * `detail` tiene l'ultimo contesto utile.
 */
export const pipelineDiagnostics = pgTable('pipeline_diagnostics', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  /** Fase della pipeline: 'ocr' | 'extraction' | 'section' | 'monitor' | 'refund' | 'cancel'. */
  step: text('step').notNull(),
  /** Codice macchina della causa: 'rate_limited' | 'timeout' | 'truncated' |
   * 'insert_failed' | 'pages_missing' | 'stream_stalled' | 'validator_blocked' |
   * 'stuck_auto_fail' | 'cancelled_by_user' | 'refund_failed' | 'unknown'. */
  code: text('code').notNull(),
  /** Occorrenze accumulate per questa tripla (caso, step, codice). */
  count: integer('count').notNull().default(1),
  /** Contesto NON clinico: { attempt, pageRange, docId, stage, minutes, error(≤300) }. */
  detail: jsonb('detail').$type<Record<string, unknown> | null>(),
  lastAt: timestamp('last_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('pipeline_diagnostics_case_id_idx').on(t.caseId),
  uniqueIndex('pipeline_diagnostics_case_step_code_uq').on(t.caseId, t.step, t.code),
]);
