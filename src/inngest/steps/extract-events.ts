import { createAdminClient } from '@/lib/supabase/admin';
import { extractEventsFromChunk } from '@/services/extraction/extraction-service';
import { verifySourceTexts } from '@/services/validation/source-text-verifier';
import { buildLowQualityPageSet, capEventsFromLowQualityPages } from '@/services/extraction/low-quality-page-guard';
import { buildHandwrittenPageSet, capEventsFromHandwrittenPages, applyTemporalSanityFlags } from '@/services/extraction/event-sanity';
import { normalizeItalianDateToIso } from '@/lib/validators/date-format';
import { recordDiagnostic, classifyPipelineError, sanitizeErrorForDetail } from '@/lib/pipeline-diagnostics';
import { createEmptyUsage, mergeUsage, type TokenUsage } from '@/services/cost-tracking/cost-calculator';
import type { CaseType } from '@/types';
import type { OcrResult } from './types';
import { logger } from '@/lib/logger';
import { detectLanguage } from '@/lib/language-detect';

export const PAGES_PER_CHUNK = 10;
/** Overlap pages between consecutive chunks to prevent mid-document splits. */
export const OVERLAP_PAGES = 2;

/**
 * True se un errore di estrazione va RILANCIATO (Inngest ritenta / il doc viene
 * marcato in errore) invece di ingoiato come {count:0}. Copre i transitori di rete
 * E gli errori di INTEGRITÀ dell'estrazione: output LLM troncato (assertNotTruncated
 * → finishReason=length) e JSON irrecuperabile (safeJsonParse dopo 3 livelli).
 * Ingoiare questi ultimi perderebbe in SILENZIO gli eventi clinici di un intero
 * chunk ("mai perdere un fatto"). Pura e testabile.
 */
export function isRetriableExtractionError(message: string): boolean {
  const lower = message.toLowerCase();
  // Transitori di rete. NB: 'etimedout'/'econnrefused'/'epipe' NON contengono
  // 'timeout' ('timedout' ≠ 'timeout') → vanno elencati a parte, altrimenti un
  // timeout di connessione verrebbe ingoiato come {count:0}.
  const isTransient = ['timeout', 'fetch failed', 'econnreset', 'econnrefused', 'etimedout', 'epipe', 'socket hang up', 'enotfound'].some((t) => lower.includes(t))
    || /\b(502|503|429)\b/.test(message);
  // Errori di INTEGRITÀ (perdita reale di eventi). Confini di parola su 'stalled' e
  // 'insert failed' per non matchare per sbaglio 'installed' / 'reinsert' (innocuo
  // oggi, ma il substring-match nudo è fragile).
  const isIntegrity = lower.includes('truncation detected')
    || lower.includes('finishreason=length')
    || lower.includes('irrecuperabile')
    || lower.includes('json llm')
    || /\binsert failed\b/.test(lower)     // 'Event insert failed' / 'Retry event insert failed' (NON 'reinsert')
    || lower.includes('pages not found')   // timing/replica DB — il messaggio stesso dice "will be retried"
    || /\bstalled\b/.test(lower)           // 'Stream stalled' (NON 'installed')
    || lower.includes('empty content')     // "...returned empty content"
    || lower.includes('content is empty'); // "Stream completed but content is empty"
  return isTransient || isIntegrity;
}

/** Number of chunk extraction jobs per Inngest step (batch).
 * Kept at 1 for maximum parallelism on Inngest Pro (100 concurrent steps).
 * With the neutral-retry safeguard added in P0-EXT-001, a chunk can take up to
 * 2× extraction timeout (~6 min). Batching would push step duration toward the
 * Vercel 800s ceiling with retries — 1 chunk per step is the safe choice.
 *
 * DATA-INTEGRITY INVARIANT: extractChunkBatch only rethrows when ALL jobs in the
 * batch fail; a PARTIAL failure is logged and swallowed (the failed chunk's events
 * are lost without failing the step). With BATCH_SIZE=1 "all fail" == "the one
 * fails" → every chunk failure rethrows → Inngest retries → no silent loss. If you
 * EVER raise this above 1, you MUST first make partial failures mark their
 * document as errore (or rethrow), otherwise dense multi-chunk docs can silently
 * lose events. */
export const EXTRACTION_BATCH_SIZE = 1;

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

  // A4: delegate range computation to planChunksSync so overlap is applied
  // consistently — there must be a single source of truth for chunk ranges.
  const ranges = planChunksSync(pageCount);
  logger.info('pipeline', ` Doc ${documentId}: ${ranges.length} chunk(s) for ${pageCount} pages`);
  return ranges;
}

/**
 * Pure math chunk planning — no DB call. Single source of truth for chunk
 * ranges (used by the batched extraction pipeline and by planChunks).
 *
 * Consecutive chunks overlap by OVERLAP_PAGES pages (stride = PAGES_PER_CHUNK -
 * OVERLAP_PAGES) so a referto that straddles a chunk boundary appears, in full,
 * in at least one chunk and is never split mid-document (A4).
 */
export function planChunksSync(
  pageCount: number,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const step = PAGES_PER_CHUNK - OVERLAP_PAGES; // stride with overlap
  for (let i = 1; i <= pageCount; i += step) {
    ranges.push({ start: i, end: Math.min(i + PAGES_PER_CHUNK - 1, pageCount) });
    if (i + PAGES_PER_CHUNK - 1 >= pageCount) break; // last chunk reached
  }
  return ranges;
}

export interface ChunkJob {
  caseId: string;
  ocrResult: OcrResult;
  range: { start: number; end: number };
  chunkIndex: number;
  totalChunks: number;
  caseType: CaseType;
  caseTypes: CaseType[];
}

/**
 * Extract events from a batch of chunk jobs sequentially within a single Inngest step.
 * Each job is wrapped in try/catch to prevent duplicates on Inngest retry:
 * if a batch partially succeeds then throws, Inngest retries the ENTIRE batch,
 * re-inserting events from already-successful jobs. By catching per-job errors,
 * we ensure partial success is preserved and only rethrow if ALL jobs fail.
 */
export interface ExtractionTruncationWarning {
  documentId: string;
  fileName: string;
  pageRange: string;
  originalChars: number;
  truncatedChars: number;
}

export interface ExtractionLanguageWarning {
  documentId: string;
  fileName: string;
  pageRange: string;
  language: 'de' | 'en' | 'mixed';
}

/** Il JSON LLM di questo chunk è stato riparato/recuperato (non parse pulito):
 * la coda può essere stata troncata → possibile perdita di eventi. Risale a
 * process-case come pipelineWarning visibile al perito ("mai perdere un fatto"). */
export interface ExtractionRecoveryWarning {
  documentId: string;
  fileName: string;
  pageRange: string;
  recoveredCount: number;
}

export async function extractChunkBatch(
  jobs: ChunkJob[],
): Promise<{
  totalCount: number;
  perDoc: Record<string, number>;
  truncationWarnings: ExtractionTruncationWarning[];
  languageWarnings: ExtractionLanguageWarning[];
  recoveryWarnings: ExtractionRecoveryWarning[];
  /** Aggregated LLM token usage across all chunk jobs — feeds cost tracking. */
  usage: TokenUsage;
}> {
  let totalCount = 0;
  let failedCount = 0;
  const perDoc: Record<string, number> = {};
  const truncationWarnings: ExtractionTruncationWarning[] = [];
  const languageWarnings: ExtractionLanguageWarning[] = [];
  const recoveryWarnings: ExtractionRecoveryWarning[] = [];
  let usage = createEmptyUsage();

  for (const job of jobs) {
    try {
      const result = await extractChunkEvents({
        caseId: job.caseId,
        ocrResult: job.ocrResult,
        range: job.range,
        chunkIndex: job.chunkIndex,
        totalChunks: job.totalChunks,
        caseType: job.caseType,
        caseTypes: job.caseTypes,
      });
      totalCount += result.count;
      perDoc[job.ocrResult.documentId] = (perDoc[job.ocrResult.documentId] ?? 0) + result.count;
      if (result.usage) {
        usage = mergeUsage(usage, result.usage);
      }
      if (result.truncationWarning) {
        truncationWarnings.push(result.truncationWarning);
      }
      if (result.languageWarning) {
        languageWarnings.push(result.languageWarning);
      }
      if (result.recoveryWarning) {
        recoveryWarnings.push(result.recoveryWarning);
      }
    } catch (error) {
      failedCount++;
      const message = error instanceof Error ? error.message : 'unknown';
      logger.error('pipeline', `Chunk batch job failed (doc ${job.ocrResult.documentId} p${job.range.start}-${job.range.end}): ${message}`);
      // Registro diagnostica (post-235): la CAUSA resta consultabile per caso,
      // non muore nei log. Best-effort, mai bloccante.
      await recordDiagnostic({
        caseId: job.caseId,
        step: 'extraction',
        code: classifyPipelineError(message),
        detail: {
          docId: job.ocrResult.documentId,
          pageRange: `${job.range.start}-${job.range.end}`,
          error: sanitizeErrorForDetail(message),
        },
      });
    }
  }

  // Rethrow only if ALL jobs failed (systemic error — worth retrying the whole batch)
  if (failedCount === jobs.length && jobs.length > 0) {
    throw new Error(`All ${jobs.length} extraction chunk jobs in batch failed`);
  }

  return { totalCount, perDoc, truncationWarnings, languageWarnings, recoveryWarnings, usage };
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
export async function extractChunkEvents(params: ExtractChunkParams): Promise<{
  count: number;
  truncationWarning?: ExtractionTruncationWarning;
  languageWarning?: ExtractionLanguageWarning;
  recoveryWarning?: ExtractionRecoveryWarning;
  usage?: TokenUsage;
}> {
  const { caseId, ocrResult, range, chunkIndex, totalChunks, caseType, caseTypes } = params;
  const supabase = createAdminClient();
  let llmUsage = createEmptyUsage();

  try {
    const extractionStartMs = Date.now();
    logger.info('pipeline', ` Starting extraction for pages ${range.start}-${range.end} of doc ${ocrResult.documentId}`);

    // Read pages from DB (no large data from Inngest)
    let { data: pages } = await supabase
      .from('pages')
      .select('page_number, ocr_text, ocr_confidence, has_handwriting')
      .eq('document_id', ocrResult.documentId)
      .gte('page_number', range.start)
      .lte('page_number', range.end)
      .order('page_number', { ascending: true });

    if (!pages || pages.length === 0) {
      // Pages may not be visible yet due to replication lag — retry with backoff
      for (const delayMs of [3000, 5000]) {
        logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: no pages in DB for doc ${ocrResult.documentId} range ${range.start}-${range.end}, retrying after ${delayMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const { data: retryPages } = await supabase
          .from('pages')
          .select('page_number, ocr_text, ocr_confidence, has_handwriting')
          .eq('document_id', ocrResult.documentId)
          .gte('page_number', range.start)
          .lte('page_number', range.end)
          .order('page_number', { ascending: true });
        if (retryPages && retryPages.length > 0) {
          pages = retryPages;
          break;
        }
      }
      if (!pages || pages.length === 0) {
        // Check if ANY pages exist for this document (distinguish total absence from range issue)
        const { count } = await supabase
          .from('pages')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', ocrResult.documentId);
        throw new Error(
          `Pages not found for doc ${ocrResult.documentId} range ${range.start}-${range.end} after 2 retries. ` +
          `Total pages in DB for this doc: ${count ?? 0}. OCR may have failed to save pages — will be retried by Inngest`,
        );
      }
    }

    // Bug #10: Filter out pages with empty/null OCR text before sending to Mistral
    const nonEmptyPages = pages.filter((p) => p.ocr_text && p.ocr_text.trim().length > 0);
    let truncationWarning: ExtractionTruncationWarning | undefined;
    if (nonEmptyPages.length === 0) {
      logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: all ${pages.length} pages have empty OCR text for doc ${ocrResult.documentId}`);
      return { count: 0, truncationWarning, usage: llmUsage };
    }
    if (nonEmptyPages.length < pages.length) {
      logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: ${pages.length - nonEmptyPages.length} pages with empty OCR text filtered out`);
    }

    // Pagine sotto soglia di qualità OCR: gli eventi che ne derivano verranno
    // cappati (LOW_QUALITY_PAGE_CONFIDENCE_CAP) e marcati per la revisione.
    const lowQualityPages = buildLowQualityPageSet(nonEmptyPages);
    // Pagine manoscritte (OCR): gli eventi che ne derivano vengono cappati e
    // marcati per la revisione — mai piena confidenza su un manoscritto.
    const handwrittenPages = buildHandwrittenPageSet(nonEmptyPages);

    let chunkText = nonEmptyPages.map((p) =>
      `[PAGE_START:${p.page_number}]\n${p.ocr_text}\n[PAGE_END:${p.page_number}]`,
    ).join('\n\n');

    // Safety cap — Mistral Large 3 supports 262K token context (~780K chars).
    // With PAGES_PER_CHUNK=10, typical chunks are 15-25K chars (well under cap).
    // Cap at 100K to handle even extremely dense documents without truncation.
    // Each chunk is a separate Inngest step, so long LLM responses don't cause timeout.
    // Wave C.4: detect non-Italian content so we can give the LLM a
    // language hint. We sample the first ~4K chars; for German/English
    // documents (typical Alto Adige / English referrals) this lets the
    // extractor translate concepts while keeping source citations intact.
    const detection = detectLanguage(chunkText);
    const languageHint: 'de' | 'en' | 'mixed' | undefined =
      detection.language === 'de' || detection.language === 'en' || detection.language === 'mixed'
        ? detection.language
        : undefined;
    let languageWarning: ExtractionLanguageWarning | undefined;
    if (languageHint) {
      logger.info(
        'pipeline',
        ` Chunk ${chunkIndex + 1} (doc ${ocrResult.documentId} pp ${range.start}-${range.end}): detected language=${detection.language} (it=${detection.hits.it} de=${detection.hits.de} en=${detection.hits.en})`,
      );
      languageWarning = {
        documentId: ocrResult.documentId,
        fileName: ocrResult.fileName,
        pageRange: `${range.start}-${range.end}`,
        language: languageHint,
      };
    }

    // 200K matches the synthesis per-section cap (MAX_OCR_CHARS_PER_SECTION) which
    // already sends that volume to the same model (Mistral Large, ~128K-token
    // context), so it is proven safe. A 10-page chunk would need ~20K chars/page
    // to exceed this — essentially never. The old 100K cap silently dropped the
    // tail of dense table-heavy chunks. NOTE: a rare output overflow on a very
    // dense chunk is caught LOUDLY by assertNotTruncated (retry), not lost.
    const MAX_CHUNK_CHARS = 200_000;
    if (chunkText.length > MAX_CHUNK_CHARS) {
      const originalChars = chunkText.length;
      logger.error('pipeline', `CRITICAL: Chunk ${chunkIndex + 1} text truncated from ${originalChars} to ${MAX_CHUNK_CHARS} chars for doc ${ocrResult.documentId} pages ${range.start}-${range.end}. Some page content may be LOST in extraction.`);
      chunkText = chunkText.slice(0, MAX_CHUNK_CHARS) + '\n\n[... ATTENZIONE: testo OCR troncato per limiti di contesto. Alcune pagine di questo segmento potrebbero non essere state analizzate completamente.]';
      truncationWarning = {
        documentId: ocrResult.documentId,
        fileName: ocrResult.fileName,
        pageRange: `${range.start}-${range.end}`,
        originalChars,
        truncatedChars: MAX_CHUNK_CHARS,
      };
    }

    const chunkLabel = totalChunks > 1
      ? `${ocrResult.fileName} [pag ${range.start}-${range.end}]`
      : ocrResult.fileName;

    // Catena di guardie UNICA per main e retry path (review 2026-07-04: due
    // copie divergono al primo guard nuovo, e il retry è il ramo meno esercitato):
    // verify sourceText (skip su chunk troncato) → cap pagine OCR sotto soglia.
    // Data sinistro (form perizia) per la sanity temporale: contenuti di
    // guarigione/esiti datati prima del sinistro = data impossibile da flaggare.
    const { data: caseSanityRow } = await supabase
      .from('cases')
      .select('dataSinistro:perizia_metadata->>dataSinistro')
      .eq('id', caseId)
      .single();
    const incidentIso = normalizeItalianDateToIso((caseSanityRow as { dataSinistro?: string | null } | null)?.dataSinistro ?? null);
    // Data civile ITALIANA (audit 2026-07-23): con l'UTC, tra mezzanotte e le
    // 2 di notte un certificato datato "oggi" risultava futuro e veniva flaggato.
    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());

    const gateChunkEvents = (
      events: Parameters<typeof verifySourceTexts>[0],
      label: string,
    ): typeof events => {
      const verified = truncationWarning ? events : verifySourceTexts(events, chunkText).events;
      const guard = capEventsFromLowQualityPages(verified, lowQualityPages);
      if (guard.cappedCount > 0) {
        logger.info('pipeline', ` Chunk ${chunkIndex + 1}${label}: ${guard.cappedCount} eventi cappati (pagine OCR sotto soglia)`);
      }
      // Manoscritti + sanity temporale (date future, guarigione pre-sinistro,
      // appuntamenti programmati): flag persistiti → coda "Da controllare".
      const hand = capEventsFromHandwrittenPages(guard.events, handwrittenPages);
      const sanity = applyTemporalSanityFlags(hand.events, { todayIso, incidentIso });
      if (hand.flaggedCount > 0 || sanity.flaggedCount > 0) {
        logger.info('pipeline', ` Chunk ${chunkIndex + 1}${label}: ${hand.flaggedCount} eventi da pagine manoscritte, ${sanity.flaggedCount} flag temporali/appuntamento`);
      }
      return sanity.events;
    };

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
      languageHint,
    });
    if (result.usage) {
      llmUsage = mergeUsage(llmUsage, result.usage);
    }

    // Recupero parziale del JSON (riparato/troncato): warning doc-level che risale a
    // process-case. Gli eventi sono già flaggati requiresVerification + nota a monte
    // (parseExtractionResponse). Aggiornato dal retry se subentra (vedi sotto).
    let recoveryWarning: ExtractionRecoveryWarning | undefined = result.partialRecovery
      ? { documentId: ocrResult.documentId, fileName: ocrResult.fileName, pageRange: `${range.start}-${range.end}`, recoveredCount: result.events.length }
      : undefined;

    // If Mistral returned 0 events, retry ONLY when the chunk has substantial clinical content.
    // Safeguard (audit P0-EXT-001): avoid coercive retries that pressure the LLM to fabricate
    // events on administrative/empty pages (timbro + firma, intestazione legale, pagine vuote).
    // Retry uses the SAME neutral prompt as pass 1 — no coercion.
    const CLINICAL_KEYWORDS = [
      'diagnosi', 'diagnostic', 'visita', 'esame', 'referto', 'terapia',
      'intervento', 'ricovero', 'dimission', 'anamnesi', 'sintom', 'prognosi',
      'paziente', 'medico', 'clinic', 'ospedale', 'cartella',
    ];
    const chunkLower = chunkText.toLowerCase();
    const clinicalHits = CLINICAL_KEYWORDS.filter((k) => chunkLower.includes(k)).length;
    const hasClinicalContent = clinicalHits >= 3;

    if (result.events.length === 0 && chunkText.length > 50 && hasClinicalContent) {
      logger.warn('pipeline', ` Chunk ${chunkIndex + 1}: 0 events from ${chunkText.length} chars (${clinicalHits} clinical keywords) — neutral retry`);
      const retryResult = await extractEventsFromChunk({
        chunkText,
        chunkLabel: `${chunkLabel} [retry]`,
        documentType: ocrResult.documentType,
        caseType: caseTypes.length > 1 ? caseTypes : caseType,
        temperature: 0,
        chunkIndex,
        totalChunks,
        documentName: ocrResult.fileName,
        pageRange: `pag ${range.start}-${range.end}`,
      });
      if (retryResult.usage) {
        llmUsage = mergeUsage(llmUsage, retryResult.usage);
      }
      // Il retry SOSTITUISCE i dati del chunk → il warning di recupero segue il retry.
      recoveryWarning = retryResult.partialRecovery
        ? { documentId: ocrResult.documentId, fileName: ocrResult.fileName, pageRange: `${range.start}-${range.end}`, recoveredCount: retryResult.events.length }
        : undefined;
      if (retryResult.events.length > 0) {
        logger.info('pipeline', ` Retry succeeded: ${retryResult.events.length} events recovered`);
        // Verbatim safety net: flag events whose sourceText isn't found in the
        // chunk OCR (deterministic cross-check, non-blocking → requiresVerification).
        // Saltato se il chunk è stato troncato (la coda mancante darebbe falsi flag).
        const retryVerified = gateChunkEvents(retryResult.events, ' [retry]');
        const retryRows = retryVerified.map((e, idx) => ({
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
        // Idempotency: delete existing events for this chunk range before retry insert
        const retryOrderStart = (range.start - 1) * 100 + 1;
        const retryOrderEnd = (range.start - 1) * 100 + 100;
        await supabase.from('events')
          .delete()
          .eq('case_id', caseId)
          .eq('document_id', ocrResult.documentId)
          .gte('order_number', retryOrderStart)
          .lte('order_number', retryOrderEnd);

        const { error: retryInsertError } = await supabase.from('events').insert(retryRows);
        if (retryInsertError) {
          logger.error('pipeline', ` Retry INSERT FAILED: ${retryInsertError.message}`);
          // "Mai perdere un fatto": gli eventi RECUPERATI dal retry sono stati
          // cancellati (delete sopra) ma NON salvati → un return {count:0} li
          // perderebbe in SILENZIO (proprio il caso che il commit 6b0e08d dichiara
          // retriable, ma questo ramo lo bypassava). throw → catch →
          // isRetriableExtractionError ('insert failed') → Inngest ritenta; se
          // persiste, la guard a valle marca il doc invece di omettere eventi.
          throw new Error(`Retry event insert failed: ${retryInsertError.message}`);
        }
        return { count: retryRows.length, truncationWarning, languageWarning, recoveryWarning, usage: llmUsage };
      }
      logger.warn('pipeline', ` Retry also returned 0 events for doc ${ocrResult.documentId}`);
      return { count: 0, truncationWarning, languageWarning, recoveryWarning, usage: llmUsage };
    }

    if (result.events.length === 0) {
      return { count: 0, truncationWarning, languageWarning, recoveryWarning, usage: llmUsage };
    }

    // Idempotency: delete any existing events for this chunk before inserting
    // Prevents duplicates if Inngest retries a partially-succeeded step
    const orderStart = (range.start - 1) * 100 + 1;
    const orderEnd = (range.start - 1) * 100 + 100;
    await supabase.from('events')
      .delete()
      .eq('case_id', caseId)
      .eq('document_id', ocrResult.documentId)
      .gte('order_number', orderStart)
      .lte('order_number', orderEnd);

    // Verbatim safety net: flag events whose sourceText isn't found in the chunk
    // OCR (deterministic cross-check, non-blocking → requiresVerification + note).
    // Saltato se il chunk è stato troncato (la coda mancante darebbe falsi flag).
    const verifiedEvents = gateChunkEvents(result.events, '');

    // Save events directly to DB with enum normalization
    const eventRows = verifiedEvents.map((e, idx) => ({
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
    return { count: eventRows.length, truncationWarning, languageWarning, recoveryWarning, usage: llmUsage };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed';
    logger.error('pipeline', ` Chunk ${chunkIndex + 1} failed: ${message}`);

    // Bug #6 + "MAI perdere un fatto": rilancia i transitori E gli errori di
    // INTEGRITÀ (output troncato / JSON irrecuperabile) → Inngest ritenta; se
    // persistente la guard a valle marca il doc in errore, invece di omettere in
    // silenzio gli eventi di un intero chunk restituendo {count:0}.
    if (isRetriableExtractionError(message)) {
      throw error;
    }

    return { count: 0, truncationWarning: undefined, usage: llmUsage };
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
