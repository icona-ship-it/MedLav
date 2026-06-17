import { pgTable, uuid, text, timestamp, integer, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const reportStatusEnum = pgEnum('report_status', [
  'bozza',
  'in_revisione',
  'definitivo',
]);

/** Per-section review state, keyed by the stable canonical section id.
 * Absent key = 'auto' (default, no action taken). 'stale' is NEVER persisted —
 * it is always computed at runtime from current events vs the report. */
export type SectionStatus = 'auto' | 'edited' | 'locked';

export interface SectionState {
  status: SectionStatus;
  /** ISO timestamp of the last manual edit to this section. */
  editedAt?: string;
  /** ISO timestamp of the last lock/confirm. */
  lockedAt?: string;
  /** SHA-256 (truncated) of the section's inputs at generation time (v2 staleness). */
  inputsHash?: string;
}

export type ReportSectionStates = Record<string, SectionState>;

/** Shape of reports.generation_metadata (JSONB). */
export interface ReportGenerationMetadata {
  promptVersion?: string;
  hrs?: number; // Hallucination Risk Score 0-100
  hrsLevel?: 'eccellente' | 'buono' | 'da_rivedere' | 'critico';
  eventCoverage?: number;
  issueCount?: number;
  issuesByType?: Record<string, number>;
  generationMode?: 'monolithic' | 'sectional';
  /** Per-section review state, keyed by canonical section id. */
  sections?: ReportSectionStates;
  /** Diagnostic-image analyses persisted at generation (sans token usage) so a
   * regenerate can re-embed the images instead of stripping them. Structurally a
   * subset of ImageAnalysisResult (no service import to keep the schema light). */
  imageAnalysis?: Array<{
    pageNumber: number;
    imageType: string;
    description: string;
    confidence: number;
    storagePath?: string;
    documentId?: string;
  }>;
  [key: string]: unknown;
}

export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull().default(1),
  status: reportStatusEnum('report_status').notNull().default('bozza'),
  synthesis: text('synthesis'), // sintesi medico-legale HTML
  generationMetadata: jsonb('generation_metadata').$type<ReportGenerationMetadata>(),
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
