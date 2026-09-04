import { createClient } from '@/lib/supabase/server';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import { filterRetiredAnomalies } from '@/services/validation/anomaly-detector';

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
  /** File unito come pagina di un altro documento (migration 0033): le sue
   * pagine e i suoi eventi vivono sotto il primario. */
  mergedIntoDocumentId?: string | null;
}

/** Documenti da riprodurre negli export: primari e standalone, più i file
 * uniti che hanno ANCORA pagine proprie (unione fatta su un caso già
 * elaborato, non ancora riavviato: le loro pagine non sono state riassorbite
 * dal primario — nasconderli perderebbe testo in silenzio). Un file unito
 * senza pagine è già assorbito e non è un documento a sé. */
export function documentsForExport<T extends { mergedIntoDocumentId?: string | null; pages: ReadonlyArray<unknown> }>(docs: ReadonlyArray<T>): T[] {
  return docs.filter((d) => !d.mergedIntoDocumentId || d.pages.length > 0);
}

/** File uniti non ancora riassorbiti (hanno pagine proprie): l'export deve
 * dirlo, così il medico sa che serve riavviare l'analisi. */
export function mergedDocumentsPendingReprocess<T extends { mergedIntoDocumentId?: string | null; pages: ReadonlyArray<unknown> }>(docs: ReadonlyArray<T>): T[] {
  return docs.filter((d) => !!d.mergedIntoDocumentId && d.pages.length > 0);
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
      // Allowlist coerente con fetchAnomaliesForSynthesis: le anomalie ESCLUSE
      // dal perito (user_dismissed) e i falsi positivi auto-risolti
      // (llm_resolved) non devono comparire nel documento depositabile.
      .in('status', ['detected', 'llm_confirmed', 'user_confirmed'])
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
      .select('id, file_name, document_type, page_count, merged_into_document_id')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true }),
  ]);

  // Fetch pages for all documents (requires doc IDs from previous query)
  const docIds = (documentsRes.data ?? []).map((d) => d.id as string);
  const allPages: Array<Record<string, unknown>> = [];
  const PG_BATCH = 200;
  for (let i = 0; i < docIds.length; i += PG_BATCH) {
    const { data } = await supabase
      .from('pages')
      .select('document_id, page_number, ocr_text')
      .in('document_id', docIds.slice(i, i + PG_BATCH))
      .order('page_number', { ascending: true });
    if (data) allPages.push(...data);
  }
  const pagesRes = { data: allPages };

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

  // Fallimento RUMOROSO (giro avversariale 2026-09-04): se la select fallisce
  // (es. colonna merged_into_document_id assente in un ambiente senza la
  // migration 0033), un export con ZERO documenti e HTTP 200 sarebbe
  // un'omissione silenziosa dell'intera trascrizione.
  if (documentsRes.error) {
    throw new Error(`Failed to load documents for export: ${documentsRes.error.message}`);
  }
  const documentsWithPages: DocumentWithPages[] = (documentsRes.data ?? []).map((doc) => ({
    id: doc.id as string,
    fileName: doc.file_name as string,
    documentType: (doc.document_type as string) ?? 'altro',
    pageCount: doc.page_count as number | null,
    pages: pagesByDoc.get(doc.id as string) ?? [],
    mergedIntoDocumentId: (doc.merged_into_document_id as string | null) ?? null,
  }));

  // Calculate medico-legal periods from events. La data sinistro del form
  // perizia esclude le preesistenze dal computo (stessi numeri della pipeline).
  const eventsList = eventsRes.data ?? [];
  const pmForCalc = (caseRow.perizia_metadata ?? null) as { dataSinistro?: string } | null;
  const calculations = calculateMedicoLegalPeriods(
    eventsList.map((e) => ({
      event_date: e.event_date as string,
      event_type: e.event_type as string,
      title: e.title as string,
      description: e.description as string,
      date_precision: e.date_precision as string | null | undefined, // F-P2
      temporal_scope: (e.temporal_scope as string | null | undefined) ?? null, // 0034
    })),
    undefined,
    pmForCalc?.dataSinistro,
  );

  // Load user's signature image path
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('signature_image_path')
    .eq('id', user.id)
    .single();

  const signatureImagePath = (profileRow?.signature_image_path as string | null) ?? null;

  return {
    caseData: caseRow,
    events: eventsList,
    // Nascondi le anomalie di tipo RITIRATO (temporali/da-assenza) dei casi
    // già processati — non devono comparire nemmeno negli export.
    anomalies: filterRetiredAnomalies(anomaliesRes.data ?? []),
    missingDocs: missingRes.data ?? [],
    report: reportRes.data,
    calculations,
    periziaMetadata: (caseRow.perizia_metadata ?? null) as Record<string, unknown> | null,
    documentsWithPages,
    signatureImagePath,
  };
}
