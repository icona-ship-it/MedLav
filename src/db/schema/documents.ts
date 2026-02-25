import { pgTable, uuid, text, timestamp, integer, pgEnum, real } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const documentTypeEnum = pgEnum('document_type', [
  'cartella_clinica',
  'referto_specialistico',
  'esame_strumentale',
  'esame_laboratorio',
  'lettera_dimissione',
  'certificato',
  'perizia_precedente',
  'altro',
]);

export const processingStatusEnum = pgEnum('processing_status', [
  'caricato',
  'in_coda',
  'ocr_in_corso',
  'estrazione_in_corso',
  'validazione_in_corso',
  'completato',
  'errore',
]);

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(), // MIME type
  fileSize: integer('file_size').notNull(), // bytes
  storagePath: text('storage_path').notNull(), // path in Supabase Storage
  documentType: documentTypeEnum('document_type').default('altro'),
  processingStatus: processingStatusEnum('processing_status').notNull().default('caricato'),
  processingError: text('processing_error'),
  pageCount: integer('page_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pages = pgTable('pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  pageNumber: integer('page_number').notNull(),
  ocrText: text('ocr_text'),
  ocrConfidence: real('ocr_confidence'), // 0-100
  hasHandwriting: text('has_handwriting'), // null, 'yes', 'partial'
  handwritingConfidence: real('handwriting_confidence'), // 0-100
  imagePath: text('image_path'), // path to extracted medical images
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
