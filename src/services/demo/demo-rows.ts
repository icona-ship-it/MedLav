/**
 * Righe DB del caso dimostrativo: funzioni PURE (testabili senza Supabase).
 * `createDemoCase` le inserisce; qui vive la mappatura fixture → colonne,
 * allineata a `buildEventInsertRow` della pipeline (temporal_scope, source_pages
 * JSON, confidence 0-100).
 */

import { moduleToCategory, moduleToPipelineMode } from '@/types/modules';
import { DEMO_CASE, DEMO_DOCUMENTS, DEMO_EVENTS, DEMO_CODE_PREFIX, type DemoDocument } from './demo-case-data';

export const DEMO_MODULE_ID = 'analisi_doc_sanitari' as const;

export function buildDemoCaseCode(year: number, sequence: number): string {
  return `${DEMO_CODE_PREFIX}${year}-${String(sequence).padStart(3, '0')}`;
}

export function buildDemoCaseRow(params: { userId: string; code: string }): Record<string, unknown> {
  return {
    user_id: params.userId,
    code: params.code,
    case_type: DEMO_CASE.caseType,
    case_types: [DEMO_CASE.caseType],
    case_role: 'stragiudiziale',
    patient_initials: DEMO_CASE.patientInitials,
    practice_reference: DEMO_CASE.practiceReference,
    notes: DEMO_CASE.notes,
    perizia_metadata: { patientFullName: DEMO_CASE.patientFullName },
    status: 'bozza',
    document_count: DEMO_DOCUMENTS.length,
    module_id: DEMO_MODULE_ID,
    module_category: moduleToCategory(DEMO_MODULE_ID).id,
    pipeline_mode: moduleToPipelineMode(DEMO_MODULE_ID),
    processing_stage: 'completato',
  };
}

export interface DemoDocumentRef {
  key: string;
  id: string;
}

export function buildDemoDocumentRow(params: {
  caseId: string;
  doc: DemoDocument;
  storagePath: string;
  fileSize: number;
}): Record<string, unknown> {
  return {
    case_id: params.caseId,
    file_name: params.doc.fileName,
    file_type: 'application/pdf',
    file_size: params.fileSize,
    storage_path: params.storagePath,
    document_type: params.doc.documentType,
    processing_status: 'completato',
    page_count: params.doc.pages.length,
    classification_metadata: null,
  };
}

export function buildDemoPageRows(documentId: string, doc: DemoDocument): Record<string, unknown>[] {
  return doc.pages.map((p) => ({
    document_id: documentId,
    page_number: p.pageNumber,
    ocr_text: p.text,
    ocr_confidence: 97,
    has_handwriting: null,
  }));
}

export function buildDemoEventRows(caseId: string, docs: ReadonlyArray<DemoDocumentRef>): Record<string, unknown>[] {
  const idByKey = new Map(docs.map((d) => [d.key, d.id]));
  return DEMO_EVENTS.map((e) => {
    const documentId = idByKey.get(e.documentKey);
    if (!documentId) throw new Error(`Demo: documento sconosciuto ${e.documentKey}`);
    return {
      case_id: caseId,
      document_id: documentId,
      order_number: e.orderNumber,
      event_date: e.eventDate,
      date_precision: e.datePrecision,
      event_type: e.eventType,
      title: e.title,
      description: e.description,
      source_type: e.sourceType,
      diagnosis: e.diagnosis ?? null,
      doctor: e.doctor ?? null,
      facility: e.facility ?? null,
      confidence: e.confidence,
      requires_verification: e.requiresVerification,
      reliability_notes: e.reliabilityNotes ?? null,
      source_text: e.sourceText,
      source_pages: JSON.stringify([...e.sourcePages]),
      extraction_pass: 'both',
      is_deleted: false,
      is_relevant_for_chronology: true,
      temporal_scope: e.temporalScope,
    };
  });
}
