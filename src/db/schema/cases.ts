import { pgTable, uuid, text, timestamp, integer, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import type { PeriziaMetadata } from '@/types';
import type { ModuleId } from '@/types/modules';

// --- Legacy enums (kept for backward compatibility) ---

export const caseTypeEnum = pgEnum('case_type', [
  'ortopedica',
  'oncologica',
  'ostetrica',
  'anestesiologica',
  'infezione_nosocomiale',
  'errore_diagnostico',
  'rc_auto',
  'previdenziale',
  'previdenziale_dlgs62',
  'previdenziale_inv_civile',
  'infortuni',
  'inail_malattia_prof',
  'inail_infortunio',
  'perizia_assicurativa',
  'analisi_spese_mediche',
  'opinione_prognostica',
  'generica',
]);

export const caseRoleEnum = pgEnum('case_role', [
  'ctu',
  'ctp',
  'stragiudiziale',
]);

export const caseStatusEnum = pgEnum('case_status', [
  'bozza',
  'in_revisione',
  'definitivo',
  'archiviato',
]);

// --- New module enums ---

export const pipelineModeEnum = pgEnum('pipeline_mode', [
  'full',
  'extraction_only',
  'expenses_only',
  'anonymize_only',
]);

export const cases = pgTable('cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }).notNull(),
  code: text('code').notNull().unique(), // es. CASO-2026-001
  patientInitials: text('patient_initials'), // solo iniziali per GDPR
  practiceReference: text('practice_reference'), // riferimento pratica

  // New module system
  moduleId: text('module_id').$type<ModuleId>(),
  moduleCategory: integer('module_category'),
  pipelineMode: pipelineModeEnum('pipeline_mode').default('full'),

  // Legacy fields (kept for backward compatibility, derived from moduleId for new cases)
  caseType: caseTypeEnum('case_type').notNull().default('generica'),
  caseTypes: jsonb('case_types').$type<string[]>(),
  caseRole: caseRoleEnum('case_role').notNull().default('ctu'),

  status: caseStatusEnum('status').notNull().default('bozza'),
  notes: text('notes'),
  periziaMetadata: jsonb('perizia_metadata').$type<PeriziaMetadata>(),
  processingStage: text('processing_stage').notNull().default('idle'),
  documentCount: integer('document_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
