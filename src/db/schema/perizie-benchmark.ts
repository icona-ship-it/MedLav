import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/**
 * Sprint 3 (Lavini quality piano 2026-05-17): perizie reali anonimizzate
 * usate come FEW-SHOT EXAMPLES nei prompt LLM. Per ogni nuovo caso, il
 * sistema recupera la perizia benchmark piu simile per (case_type +
 * lesion_type) e ne inietta la sezione corrispondente come esempio "buono"
 * nel prompt — il LLM impara lo stile e la struttura del perito reale.
 *
 * Architettura: tabella separata da `guidelines` (schema diverso, scopo
 * diverso, retrieval diverso). Migration 0025_perizie_benchmark.sql crea
 * tabelle + indice GIN + RPC match_perizie_chunks_hybrid (clone hybrid
 * RAG con filtro section_type).
 */
export const periziaBenchmark = pgTable('perizie_benchmark', {
  id: uuid('id').defaultRandom().primaryKey(),
  // FK al perito che ha prodotto la perizia (es. Dott. Lavini → profiles.id)
  peritanId: uuid('peritan_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  // Anonimizzato — es. "CASO-2026-XXX", mai nome paziente reale
  caseCodeAnonymized: text('case_code_anonymized').notNull(),
  caseType: text('case_type').notNull(), // 'ortopedica' | 'oncologica' | 'rc_auto' | etc.
  caseRole: text('case_role').notNull(), // 'ctu' | 'ctp' | 'stragiudiziale' | 'parere'
  // Array di lesioni/diagnosi principali per filtro retrieval
  // es. ['frattura olecrano', 'distorsione cervicale']
  lesionType: jsonb('lesion_type').$type<string[]>().notNull().default([]),
  // Esito conclusivo della perizia (utile per filtrare "perizie con stesso esito atteso")
  esito: text('esito'), // 'favore_ricorrente' | 'no_nesso' | 'misto' | null
  chunkCount: integer('chunk_count').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_perizie_benchmark_peritan_id').on(table.peritanId),
  index('idx_perizie_benchmark_case_type').on(table.caseType),
]);

/**
 * Chunk di perizia indicizzato per sezione standard.
 * Ogni perizia viene splittata in 6-10 chunk (uno per sezione: intestazione,
 * il_fatto, documentazione, esame_obiettivo, epicrisi, considerazioni_ml,
 * conclusioni). Retrieval: pesca il chunk col matching section_type +
 * case_type + lesion_type piu simile semanticamente (hybrid dense+BM25).
 *
 * Embedding: Mistral mistral-embed 1024 dim. Stored as text per Drizzle
 * compatibility, cast a vector(1024) nelle query.
 *
 * tsvector_content: GENERATED ALWAYS AS (to_tsvector('simple', content))
 * STORED — multilingua come migration 0023. Indice GIN per BM25.
 */
export const periziaBenchmarkChunks = pgTable('perizie_benchmark_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  periziaId: uuid('perizia_id').references(() => periziaBenchmark.id, { onDelete: 'cascade' }).notNull(),
  // Sezione canonica della perizia. Allineato con SectionSpec.id del catalog:
  // 'intestazione' | 'il_fatto_e_storia_clinica' | 'documentazione_sanitaria' |
  // 'epicrisi' | 'considerazioni_ml' | 'conclusioni' | 'altro'
  sectionType: text('section_type').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: text('embedding'), // vector(1024) in DB
  tokenCount: integer('token_count'),
  // GENERATED in migration — read-only
  tsvectorContent: text('tsvector_content'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_perizie_benchmark_chunks_perizia_id').on(table.periziaId),
  index('idx_perizie_benchmark_chunks_section_type').on(table.sectionType),
]);
