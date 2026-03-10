import { createClient } from '@/lib/supabase/server';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';

export interface DocumentPage {
  pageNumber: number;
  ocrText: string;
}

export interface DocumentWithPages {
  id: string;
  fileName: string;
  documentType: string;
  pageCount: number | null;
  pages: DocumentPage[];
}

/**
 * Load all case data needed for export.
 * Verifies auth and ownership.
 * Includes medico-legal calculations and documents with OCR pages.
 */
export async function loadCaseDataForExport(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: caseRow } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseRow) return null;

  const [eventsRes, anomaliesRes, missingRes, reportRes, documentsRes] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('case_id', caseId)
      .eq('is_deleted', false)
      .order('order_number', { ascending: true }),
    supabase
      .from('anomalies')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true }),
    supabase
      .from('missing_documents')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true }),
    supabase
      .from('reports')
      .select('*')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('id, file_name, document_type, page_count')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true }),
  ]);

  // Fetch pages for all documents (requires doc IDs from previous query)
  const docIds = (documentsRes.data ?? []).map((d) => d.id as string);
  const pagesRes = docIds.length > 0
    ? await supabase
      .from('pages')
      .select('document_id, page_number, ocr_text')
      .in('document_id', docIds)
      .order('page_number', { ascending: true })
    : { data: [] };

  // Group pages by document
  const pagesByDoc = new Map<string, DocumentPage[]>();
  for (const page of pagesRes.data ?? []) {
    const docId = page.document_id as string;
    if (!pagesByDoc.has(docId)) {
      pagesByDoc.set(docId, []);
    }
    pagesByDoc.get(docId)!.push({
      pageNumber: page.page_number as number,
      ocrText: (page.ocr_text as string) ?? '',
    });
  }

  const documentsWithPages: DocumentWithPages[] = (documentsRes.data ?? []).map((doc) => ({
    id: doc.id as string,
    fileName: doc.file_name as string,
    documentType: (doc.document_type as string) ?? 'altro',
    pageCount: doc.page_count as number | null,
    pages: pagesByDoc.get(doc.id as string) ?? [],
  }));

  // Calculate medico-legal periods from events
  const eventsList = eventsRes.data ?? [];
  const calculations = calculateMedicoLegalPeriods(
    eventsList.map((e) => ({
      event_date: e.event_date as string,
      event_type: e.event_type as string,
      title: e.title as string,
      description: e.description as string,
    })),
  );

  return {
    caseData: caseRow,
    events: eventsList,
    anomalies: anomaliesRes.data ?? [],
    missingDocs: missingRes.data ?? [],
    report: reportRes.data,
    calculations,
    periziaMetadata: (caseRow.perizia_metadata ?? null) as Record<string, unknown> | null,
    documentsWithPages,
  };
}
