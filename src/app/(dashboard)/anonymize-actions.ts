'use server';

import { createClient } from '@/lib/supabase/server';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { logger } from '@/lib/logger';
import type { PeriziaMetadata } from '@/types';

interface AnonymizeReportResult {
  success: boolean;
  anonymizedText?: string;
  replacementCount?: number;
  error?: string;
}

/**
 * Anonymize the latest report for a case.
 * Fetches the report synthesis, applies PII anonymization, and returns the result.
 */
export async function anonymizeReport(caseId: string): Promise<AnonymizeReportResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Non autenticato' };
  }

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, perizia_metadata')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return { success: false, error: 'Caso non trovato' };
  }

  // Fetch the latest report
  const { data: report } = await supabase
    .from('reports')
    .select('id, synthesis')
    .eq('case_id', caseId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report?.synthesis) {
    return { success: false, error: 'Nessun report disponibile per questo caso' };
  }

  const periziaMetadata = (caseData.perizia_metadata ?? undefined) as PeriziaMetadata | undefined;

  const result = anonymizeText({
    text: report.synthesis as string,
    periziaMetadata,
  });

  logger.info('anonymize-report', `caseId=${caseId} reportId=${report.id} replacements=${result.replacementCount}`);

  return {
    success: true,
    anonymizedText: result.anonymizedText,
    replacementCount: result.replacementCount,
  };
}

// --- Anonymize case documents (OCR text) ---

interface AnonymizeCaseDocumentsResult {
  success: boolean;
  anonymizedText?: string;
  replacementCount?: number;
  documentCount?: number;
  error?: string;
}

/**
 * Anonymize OCR text from all documents in a case.
 * Used by the standalone Anonimizzatore module.
 * Fetches all document pages, combines their OCR text, runs anonymization.
 */
export async function anonymizeCaseDocuments(caseId: string): Promise<AnonymizeCaseDocumentsResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Non autenticato' };
  }

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id, perizia_metadata')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return { success: false, error: 'Caso non trovato' };
  }

  // Fetch all documents for the case
  const { data: docs } = await supabase
    .from('documents')
    .select('id, file_name')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });

  if (!docs || docs.length === 0) {
    return { success: false, error: 'Nessun documento trovato. Carica almeno un documento.' };
  }

  const docIds = docs.map((d) => d.id);

  // Fetch all pages with OCR text
  const { data: pages } = await supabase
    .from('pages')
    .select('document_id, page_number, ocr_text')
    .in('document_id', docIds)
    .order('page_number', { ascending: true });

  if (!pages || pages.length === 0) {
    return { success: false, error: 'Nessun testo OCR disponibile. I documenti devono prima essere elaborati (OCR).' };
  }

  // Build document name lookup
  const docNameMap = new Map(docs.map((d) => [d.id, d.file_name]));

  // Combine OCR text per document with headers
  const sections: string[] = [];
  for (const doc of docs) {
    const docPages = pages
      .filter((p) => p.document_id === doc.id && p.ocr_text)
      .sort((a, b) => a.page_number - b.page_number);

    if (docPages.length > 0) {
      const docName = docNameMap.get(doc.id) ?? 'Documento';
      const docText = docPages.map((p) => p.ocr_text).join('\n\n');
      sections.push(`--- ${docName} ---\n\n${docText}`);
    }
  }

  if (sections.length === 0) {
    return { success: false, error: 'Nessun testo OCR disponibile nei documenti.' };
  }

  const combinedText = sections.join('\n\n\n');
  const periziaMetadata = (caseData.perizia_metadata ?? undefined) as PeriziaMetadata | undefined;

  const result = anonymizeText({
    text: combinedText,
    periziaMetadata,
  });

  logger.info('anonymize-case-documents', `caseId=${caseId} docs=${docs.length} replacements=${result.replacementCount}`);

  return {
    success: true,
    anonymizedText: result.anonymizedText,
    replacementCount: result.replacementCount,
    documentCount: docs.length,
  };
}
