import { createAdminClient } from '@/lib/supabase/admin';
import { extractEventsFromChunk } from '@/services/extraction/extraction-service';
import type { CaseType } from '@/types';
import type { OcrResult } from './types';
import { logger } from '@/lib/logger';

export const PAGES_PER_CHUNK = 10;

// Enum validation — LLM can produce values outside the enum
const VALID_EVENT_TYPES = new Set([
  'visita', 'esame', 'diagnosi', 'intervento', 'terapia', 'ricovero',
  'follow-up', 'referto', 'prescrizione', 'consenso', 'complicanza',
  'spesa_medica', 'documento_amministrativo', 'certificato', 'altro',
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
  'relazione': 'referto',
  'certificato': 'certificato', 'certificato_medico': 'certificato', 'certificato_inail': 'certificato',
  'invalidita': 'certificato', 'idoneita': 'certificato',
  'fattura': 'spesa_medica', 'ricevuta': 'spesa_medica', 'nota_spese': 'spesa_medica',
  'spesa': 'spesa_medica', 'parcella': 'spesa_medica',
  'comunicazione': 'documento_amministrativo', 'modulo': 'documento_amministrativo',
  'lettera': 'documento_amministrativo', 'amministrativo': 'documento_amministrativo',
  'memoria': 'documento_amministrativo', 'memoria_difensiva': 'documento_amministrativo',
  'ricorso': 'documento_amministrativo', 'atto_giudiziario': 'documento_amministrativo',
  'perizia': 'documento_amministrativo', 'ctu': 'documento_amministrativo',
  'ctp': 'documento_amministrativo', 'relazione_peritale': 'documento_amministrativo',
  'conclusioni': 'documento_amministrativo', 'comparsa': 'documento_amministrativo',
  'spese': 'spesa_medica', 'elenco_spese': 'spesa_medica', 'documentazione_spese': 'spesa_medica',
  'riepilogo_spese': 'spesa_medica', 'prospetto_spese': 'spesa_medica',
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
    let { data: pages } = await supabase
      .from('pages')
      .select('page_number, ocr_text')
      .eq('document_id', ocrResult.documentId)
      .gte('page_number', range.start)
      .lte('page_number', range.end)
      .order('page_number', { ascending: true });

    if (!pages || pages.length === 0) {
      // Bug #2: Pages may not be committed yet — retry once after 2s
      logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: no pages found in DB for doc ${ocrResult.documentId} range ${range.start}-${range.end}, retrying after 2s`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const { data: retryPages } = await supabase
        .from('pages')
        .select('page_number, ocr_text')
        .eq('document_id', ocrResult.documentId)
        .gte('page_number', range.start)
        .lte('page_number', range.end)
        .order('page_number', { ascending: true });
      if (!retryPages || retryPages.length === 0) {
        throw new Error(`Pages not found for doc ${ocrResult.documentId} range ${range.start}-${range.end} after retry — will be retried by Inngest`);
      }
      pages = retryPages;
    }

    // Bug #10: Filter out pages with empty/null OCR text before sending to Mistral
    const nonEmptyPages = pages.filter((p) => p.ocr_text && p.ocr_text.trim().length > 0);
    if (nonEmptyPages.length === 0) {
      logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: all ${pages.length} pages have empty OCR text for doc ${ocrResult.documentId}`);
      return { count: 0 };
    }
    if (nonEmptyPages.length < pages.length) {
      logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: ${pages.length - nonEmptyPages.length} pages with empty OCR text filtered out`);
    }

    const chunkText = nonEmptyPages.map((p) =>
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
      temperature: 0,
      chunkIndex,
      totalChunks,
      documentName: ocrResult.fileName,
      pageRange: `pag ${range.start}-${range.end}`,
    });

    // If Mistral returned 0 events but the text has substantial content, retry with a simpler prompt
    if (result.events.length === 0 && chunkText.length > 50) {
      logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: 0 events from ${chunkText.length} chars — retrying with simplified extraction`);
      const retryResult = await extractEventsFromChunk({
        chunkText: `IMPORTANTE: Questo documento contiene informazioni rilevanti per una perizia medico-legale. Può essere un documento clinico, legale (memoria difensiva, ricorso, perizia), amministrativo, o di spese mediche. Estrai TUTTI gli eventi, fatti clinici, date, interventi, diagnosi, spese e informazioni menzionate. Anche se è un atto giudiziario, estrai i fatti clinici citati al suo interno. NON restituire un array vuoto — ogni documento ha contenuto estraibile.\n\n${chunkText}`,
        chunkLabel: `${chunkLabel} [retry]`,
        documentType: ocrResult.documentType,
        caseType: caseTypes.length > 1 ? caseTypes : caseType,
        temperature: 0,
        chunkIndex,
        totalChunks,
        documentName: ocrResult.fileName,
        pageRange: `pag ${range.start}-${range.end}`,
      });
      if (retryResult.events.length > 0) {
        logger.info('pipeline', ` Retry succeeded: ${retryResult.events.length} events recovered`);
        const retryRows = retryResult.events.map((e, idx) => ({
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
          extraction_pass: 'retry',
        }));
        const { error: retryInsertError } = await supabase.from('events').insert(retryRows);
        if (retryInsertError) {
          logger.error('pipeline', ` Retry INSERT FAILED: ${retryInsertError.message}`);
          return { count: 0 };
        }
        return { count: retryRows.length };
      }
      logger.warn('pipeline', ` Retry also returned 0 events for doc ${ocrResult.documentId}`);
      return { count: 0 };
    }

    if (result.events.length === 0) {
      return { count: 0 };
    }

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

    // Bug #6: Rethrow transient errors so Inngest retries the step
    const lowerMsg = message.toLowerCase();
    const isTransient = ['timeout', 'fetch failed', 'econnreset', 'socket hang up', 'enotfound'].some((t) => lowerMsg.includes(t))
      || /\b(502|503|429)\b/.test(message);
    if (isTransient) {
      throw error;
    }

    return { count: 0 };
  }
}

/**
 * Mark a document when no events were extracted.
 * - pageCount === 0: true error (corrupt/empty file)
 * - pageCount > 0 but 0 events: completed with warning (OCR text still available)
 */
export async function markDocumentExtractionError(
  documentId: string,
  pageCount: number,
): Promise<void> {
  const supabase = createAdminClient();

  if (pageCount === 0) {
    // Truly empty/corrupt document — mark as error
    await supabase.from('documents').update({
      processing_status: 'errore',
      processing_error: 'Il documento non contiene testo leggibile (0 pagine estratte dall\'OCR). Verificare che il file non sia corrotto o protetto.',
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
  } else {
    // Document has text but no structured events — mark as completed with warning
    // The OCR text is still available for the user to review
    await supabase.from('documents').update({
      processing_status: 'completato',
      processing_error: `Documento analizzato ma nessun evento strutturato individuato nelle ${pageCount} pagine. Il testo OCR è comunque disponibile.`,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
  }
}
