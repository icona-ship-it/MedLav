import { createAdminClient } from '@/lib/supabase/admin';
import { extractEventsFromChunk } from '@/services/extraction/extraction-service';
import type { CaseType } from '@/types';
import type { OcrResult } from './types';
import { logger } from '@/lib/logger';

export const PAGES_PER_CHUNK = 10;

// Enum validation — LLM can produce values outside the enum
const VALID_EVENT_TYPES = new Set([
  'visita', 'esame', 'diagnosi', 'intervento', 'terapia', 'ricovero',
  'follow-up', 'referto', 'prescrizione', 'consenso', 'complicanza', 'altro',
]);

const VALID_SOURCE_TYPES = new Set([
  'cartella_clinica', 'referto_controllo', 'esame_strumentale', 'esame_ematochimico', 'altro',
]);

const VALID_DATE_PRECISIONS = new Set(['giorno', 'mese', 'anno', 'sconosciuta']);

// Fuzzy normalization for event types the LLM may produce
const EVENT_TYPE_ALIASES: Record<string, string> = {
  'surgery': 'intervento', 'chirurgia': 'intervento', 'operazione': 'intervento',
  'procedure': 'intervento', 'biopsia': 'intervento',
  'exam': 'esame', 'examination': 'esame', 'laboratorio': 'esame', 'lab': 'esame',
  'imaging': 'esame', 'radiologia': 'esame', 'analisi': 'esame',
  'visit': 'visita', 'consultation': 'visita', 'consulenza': 'visita', 'accesso_ps': 'visita',
  'pronto_soccorso': 'visita', 'ambulatoriale': 'visita',
  'diagnosis': 'diagnosi', 'diagnostic': 'diagnosi', 'staging': 'diagnosi',
  'therapy': 'terapia', 'treatment': 'terapia', 'trattamento': 'terapia',
  'chemioterapia': 'terapia', 'radioterapia': 'terapia', 'farmaco': 'terapia',
  'farmacologica': 'terapia', 'trasfusione': 'terapia', 'fisioterapia': 'terapia',
  'hospitalization': 'ricovero', 'admission': 'ricovero', 'accettazione': 'ricovero',
  'dimissione': 'referto', 'lettera_dimissione': 'referto', 'report': 'referto',
  'certificato': 'referto', 'relazione': 'referto',
  'followup': 'follow-up', 'follow_up': 'follow-up', 'controllo': 'follow-up',
  'rivalutazione': 'follow-up',
  'prescription': 'prescrizione', 'richiesta': 'prescrizione',
  'consent': 'consenso', 'consenso_informato': 'consenso', 'informativa': 'consenso',
  'complication': 'complicanza', 'evento_avverso': 'complicanza', 'infezione': 'complicanza',
  'reazione': 'complicanza',
};

const SOURCE_TYPE_ALIASES: Record<string, string> = {
  'cartella': 'cartella_clinica', 'clinical_record': 'cartella_clinica', 'diario': 'cartella_clinica',
  'dimissione': 'cartella_clinica', 'lettera': 'cartella_clinica', 'operatoria': 'cartella_clinica',
  'referto': 'referto_controllo', 'certificato': 'referto_controllo', 'visita': 'referto_controllo',
  'rx': 'esame_strumentale', 'tac': 'esame_strumentale', 'rm': 'esame_strumentale',
  'ecografia': 'esame_strumentale', 'ecg': 'esame_strumentale', 'radiologia': 'esame_strumentale',
  'strumentale': 'esame_strumentale', 'imaging': 'esame_strumentale',
  'ematochimico': 'esame_ematochimico', 'laboratorio': 'esame_ematochimico',
  'emocromo': 'esame_ematochimico', 'sangue': 'esame_ematochimico', 'lab': 'esame_ematochimico',
};

function normalizeEventType(raw: string): string {
  if (VALID_EVENT_TYPES.has(raw)) return raw;
  const lower = raw.toLowerCase().replace(/[\s_-]+/g, '_');
  return EVENT_TYPE_ALIASES[lower] ?? 'altro';
}

function normalizeSourceType(raw: string): string {
  if (VALID_SOURCE_TYPES.has(raw)) return raw;
  const lower = raw.toLowerCase().replace(/[\s_-]+/g, '_');
  return SOURCE_TYPE_ALIASES[lower] ?? 'altro';
}

/**
 * Step 3a: Calculate chunk ranges for a document's pages.
 * Marks the document as estrazione_in_corso.
 */
export async function planChunks(
  documentId: string,
  pageCount: number,
): Promise<Array<{ start: number; end: number }>> {
  const supabase = createAdminClient();
  await supabase.from('documents').update({
    processing_status: 'estrazione_in_corso',
    updated_at: new Date().toISOString(),
  }).eq('id', documentId);

  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 1; i <= pageCount; i += PAGES_PER_CHUNK) {
    ranges.push({ start: i, end: Math.min(i + PAGES_PER_CHUNK - 1, pageCount) });
  }
  logger.info('pipeline', ` Doc ${documentId}: ${ranges.length} chunk(s) for ${pageCount} pages`);
  return ranges;
}

interface ExtractChunkParams {
  caseId: string;
  ocrResult: OcrResult;
  range: { start: number; end: number };
  chunkIndex: number;
  totalChunks: number;
  caseType: CaseType;
  caseTypes: CaseType[];
}

/**
 * Step 3b: Extract events from a single chunk of pages.
 * Reads pages from DB, calls Mistral extraction, saves events to DB.
 */
export async function extractChunkEvents(params: ExtractChunkParams): Promise<{ count: number }> {
  const { caseId, ocrResult, range, chunkIndex, totalChunks, caseType, caseTypes } = params;
  const supabase = createAdminClient();

  try {
    const extractionStartMs = Date.now();
    logger.info('pipeline', ` Starting extraction for pages ${range.start}-${range.end} of doc ${ocrResult.documentId}`);

    // Read pages from DB (no large data from Inngest)
    const { data: pages } = await supabase
      .from('pages')
      .select('page_number, ocr_text')
      .eq('document_id', ocrResult.documentId)
      .gte('page_number', range.start)
      .lte('page_number', range.end)
      .order('page_number', { ascending: true });

    if (!pages || pages.length === 0) return { count: 0 };

    const chunkText = pages.map((p) =>
      `[PAGE_START:${p.page_number}]\n${p.ocr_text}\n[PAGE_END:${p.page_number}]`,
    ).join('\n\n');

    const chunkLabel = totalChunks > 1
      ? `${ocrResult.fileName} [pag ${range.start}-${range.end}]`
      : ocrResult.fileName;

    const result = await extractEventsFromChunk({
      chunkText,
      chunkLabel,
      documentType: ocrResult.documentType,
      caseType: caseTypes.length > 1 ? caseTypes : caseType,
      temperature: 0.2,
      chunkIndex,
      totalChunks,
      documentName: ocrResult.fileName,
      pageRange: `pag ${range.start}-${range.end}`,
    });

    if (result.events.length === 0) return { count: 0 };

    // Save events directly to DB with enum normalization
    const eventRows = result.events.map((e, idx) => ({
      case_id: caseId,
      document_id: ocrResult.documentId,
      order_number: (range.start - 1) * 100 + idx + 1,
      event_date: e.eventDate,
      date_precision: VALID_DATE_PRECISIONS.has(e.datePrecision) ? e.datePrecision : 'sconosciuta',
      event_type: normalizeEventType(e.eventType),
      title: e.title,
      description: e.description,
      source_type: normalizeSourceType(e.sourceType),
      diagnosis: e.diagnosis ?? null,
      doctor: e.doctor ?? null,
      facility: e.facility ?? null,
      confidence: e.confidence,
      requires_verification: e.requiresVerification,
      reliability_notes: e.reliabilityNotes ?? null,
      source_text: e.sourceText ?? null,
      source_pages: e.sourcePages ? JSON.stringify(e.sourcePages) : null,
      extraction_pass: 'pass1_only',
    }));

    const { error: insertError } = await supabase.from('events').insert(eventRows);
    if (insertError) {
      logger.error('pipeline', ` Chunk ${chunkIndex + 1} INSERT FAILED: ${insertError.message}`);
      throw new Error(`Event insert failed: ${insertError.message}`);
    }
    logger.info('pipeline', ` Chunk ${chunkIndex + 1} (p${range.start}-${range.end}): ${eventRows.length} events saved in ${Date.now() - extractionStartMs}ms`);
    return { count: eventRows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed';
    logger.error('pipeline', ` Chunk ${chunkIndex + 1} failed: ${message}`);
    return { count: 0 };
  }
}

/**
 * Mark a document as errore when no events were extracted.
 */
export async function markDocumentExtractionError(
  documentId: string,
  pageCount: number,
): Promise<void> {
  const supabase = createAdminClient();
  const reason = pageCount === 0
    ? 'Il documento non contiene testo leggibile (0 pagine estratte dall\'OCR). Verificare che il file non sia corrotto o protetto.'
    : `Nessun evento clinico individuato nelle ${pageCount} pagine analizzate. Il documento potrebbe non contenere dati clinici strutturati (es. documento amministrativo, modulo vuoto, copertina) oppure il testo potrebbe essere di qualità insufficiente.`;
  await supabase.from('documents').update({
    processing_status: 'errore',
    processing_error: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', documentId);
}
