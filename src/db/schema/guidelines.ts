import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Clinical guidelines metadata.
 * Each guideline is a source document (e.g., "Linee Guida AIOM Carcinoma Mammario 2024").
 */
export const guidelines = pgTable('guidelines', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  source: text('source').notNull(), // e.g., "AIOM", "SIOT", "SIAARTI"
  year: integer('year'),
  caseTypes: jsonb('case_types').notNull().$type<string[]>(), // which case types this applies to
  chunkCount: integer('chunk_count').notNull().default(0),
  isActive: integer('is_active').notNull().default(1), // 1 = active, 0 = disabled
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Chunks of guideline text with vector embeddings for semantic search.
 * Requires pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
 *
 * NOTE: The embedding column uses text storage for the vector because Drizzle ORM
 * doesn't natively support the pgvector `vector(1024)` type. The actual column
 * in the migration uses `vector(1024)`. We cast to/from text in queries.
 */
export const guidelineChunks = pgTable('guideline_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  guidelineId: uuid('guideline_id').references(() => guidelines.id, { onDelete: 'cascade' }).notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  sectionTitle: text('section_title'), // optional heading context
  // embedding stored as text — actual column is vector(1024) in migration
  // queries use ::vector cast
  embedding: text('embedding'),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_guideline_chunks_guideline_id').on(table.guidelineId),
]);
