/**
 * Document summarizer for map-reduce synthesis on large cases.
 * When a case has >=10 documents, per-document summaries are generated
 * so the synthesis step can see 100% of the content instead of <1%.
 */
import {
  MISTRAL_MODELS,
  streamMistralChat,
  DETERMINISTIC_SEED,
  assertNotTruncated,
} from '@/lib/mistral/client';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { logger } from '@/lib/logger';

/** Cases with more docs than this trigger map-reduce summarization.
 * Summaries replace raw OCR text in synthesis prompts, keeping them small
 * enough to complete within Vercel's 300s function timeout. */
export const MAP_REDUCE_THRESHOLD_DOCS = 10;

/** Below this total OCR volume, map-reduce is skipped even with many documents:
 * the raw OCR fits the per-section cap (MAX_OCR_CHARS_PER_SECTION = 200K)
 * directly, which is higher-fidelity AND cheaper than 10+ summary LLM calls. */
export const MIN_TOTAL_CHARS_FOR_MAP_REDUCE = 100_000;

/**
 * Map-reduce gate: doc count alone over-triggers on many-tiny-docs cases
 * (12 one-page certificates ≠ a large case). Volume must ALSO justify it.
 */
export function shouldUseMapReduce(docCount: number, totalChars: number): boolean {
  return docCount >= MAP_REDUCE_THRESHOLD_DOCS && totalChars >= MIN_TOTAL_CHARS_FOR_MAP_REDUCE;
}

/** Max chars of OCR text sent per-document summary call (increased to include last pages: discharge, therapy) */
export const OCR_PER_DOC_SUMMARY_LIMIT = 45_000;

/** Max summary output chars per document (increased to preserve clinical details in large cases) */
export const DOC_SUMMARY_MAX_CHARS = 4000;

export interface DocumentSummary {
  documentId: string;
  fileName: string;
  documentType: string;
  summary: string;
  totalCharsOriginal: number;
  /** LLM token usage of the summary call — feeds pipeline cost tracking. */
  usage?: TokenUsage;
}

/**
 * A7 (Lavini): when a document's OCR exceeds the per-doc budget, naively slicing
 * the FIRST N chars silently drops the END of the document — exactly where the
 * discharge letter ("lettera di dimissione"), final therapy and follow-up live.
 * In large cases this lost the clinically decisive closing pages.
 *
 * Tail-priority windowing: keep a head window AND a larger tail window (the tail
 * gets ~2x the head budget) with an explicit omission marker between them, so
 * the closing pages always reach the summarizer. For documents within budget
 * the text is returned unchanged.
 */
const TAIL_OMISSION_MARKER =
  '\n\n[...PORZIONE CENTRALE OMESSA PER LIMITE DI LUNGHEZZA — le pagine FINALI (dimissione, terapia conclusiva, follow-up) sono riportate integralmente qui sotto...]\n\n';

/** Chars reserved for the closing pages (discharge letter + final therapy +
 * follow-up are short). Everything else goes to the head, so mid-document
 * content (e.g. an operative report in the first half) is preserved — minimizing
 * the regression vs the old head-only slice while still capturing the tail. */
const TAIL_RESERVE_CHARS = 12_000;

export function buildTailPrioritizedOcrInput(fullText: string, limit: number): string {
  if (fullText.length <= limit) return fullText;
  // Reserve the marker within the budget so the returned string never exceeds `limit`.
  const contentBudget = Math.max(0, limit - TAIL_OMISSION_MARKER.length);
  // Fixed tail reserve, head gets the rest (head-maximizing). Cap the tail at
  // half the budget so a tiny limit still splits sanely.
  const tailBudget = Math.min(TAIL_RESERVE_CHARS, Math.floor(contentBudget / 2));
  const headBudget = contentBudget - tailBudget;
  const head = fullText.slice(0, headBudget);
  const tail = tailBudget > 0 ? fullText.slice(fullText.length - tailBudget) : '';
  return `${head}${TAIL_OMISSION_MARKER}${tail}`;
}

/**
 * Generate a structured summary of a single document's OCR text.
 * Applies tail-priority windowing (A7) so the closing pages — discharge,
 * final therapy, follow-up — are preserved even when the document exceeds
 * OCR_PER_DOC_SUMMARY_LIMIT.
 */
export async function summarizeDocument(
  doc: DocumentOcrContext,
): Promise<DocumentSummary> {
  const fullText = doc.pages
    .map((p) => p.ocrText)
    .join('\n\n');
  const ocrText = buildTailPrioritizedOcrInput(fullText, OCR_PER_DOC_SUMMARY_LIMIT);

  const result = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_LARGE,
    messages: [
      {
        role: 'system',
        content: `Sei un medico legale. Riassumi il contenuto del seguente documento medico in modo strutturato e conciso (max ${DOC_SUMMARY_MAX_CHARS} caratteri). Includi:
- Tipo documento e data/date principali
- Diagnosi, interventi, terapie menzionate
- Nomi di medici e strutture
- Esiti di esami (valori chiave)
- Eventuali criticità o anomalie
- PRIORITÀ ALLE PAGINE FINALI: diagnosi di dimissione, terapia domiciliare conclusiva e follow-up programmato vanno SEMPRE riportati se presenti (sono spesso nelle ultime pagine del documento).
Scrivi in italiano, in modo fattuale senza opinioni. Se il documento non è sanitario (memoria, ricorso, fattura), riassumi il contenuto pertinente.
GROUNDING (vincolo assoluto): riporta SOLO informazioni effettivamente presenti nel testo fornito. Se un dato (diagnosi, valore, data, nome) NON è nel testo, NON inferirlo e NON colmarlo con conoscenza medica generale: ometti o scrivi "non indicato". Nessuna invenzione.`,
      },
      {
        role: 'user',
        content: `Documento: ${doc.fileName} (tipo: ${doc.documentType})\n\n${ocrText}`,
      },
    ],
    temperature: 0,
    maxTokens: 1024,
    timeoutMs: 60_000,
    randomSeed: DETERMINISTIC_SEED,
    label: `summary:${doc.documentId}`,
  });
  assertNotTruncated(result, `summary:${doc.documentId}`);
  const summary = result.content;

  logger.info('synthesis', `Summary for ${doc.documentId}: ${summary.length} chars from ${doc.totalChars} OCR chars`);

  return {
    documentId: doc.documentId,
    fileName: doc.fileName,
    documentType: doc.documentType,
    summary: summary.slice(0, DOC_SUMMARY_MAX_CHARS),
    totalCharsOriginal: doc.totalChars,
    usage: result.usage,
  };
}

/** Lightweight doc reference for batch summarization (no OCR text). */
export interface DocumentRef {
  documentId: string;
  fileName: string;
  documentType: string;
}

/**
 * Summarize a batch of documents by ID — fetches OCR text internally.
 * Avoids serializing large OCR text as Inngest step output.
 */
export async function summarizeDocumentBatchByIds(
  docRefs: DocumentRef[],
): Promise<DocumentSummary[]> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();

  // Concurrent within the batch: the per-process Mistral semaphore caps the
  // actual API concurrency, and per-doc errors degrade to a warning summary
  // (never reject), so Promise.all preserves order AND partial success.
  return Promise.all(docRefs.map(async (ref): Promise<DocumentSummary> => {
    try {
      const { data: pages } = await supabase
        .from('pages')
        .select('page_number, ocr_text')
        .eq('document_id', ref.documentId)
        .order('page_number', { ascending: true });

      const pageList = (pages ?? []).filter((p) => p.ocr_text && (p.ocr_text as string).trim().length > 0);
      const totalChars = pageList.reduce((sum, p) => sum + (p.ocr_text as string).length, 0);

      const doc: DocumentOcrContext = {
        documentId: ref.documentId,
        fileName: ref.fileName,
        documentType: ref.documentType,
        pages: pageList.map((p) => ({ pageNumber: p.page_number as number, ocrText: p.ocr_text as string })),
        totalChars,
      };
      return await summarizeDocument(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      logger.error('synthesis', `Failed to summarize doc ${ref.documentId}: ${message}`);
      // Mark as failed with clear warning — synthesis will see this and know the summary is missing
      return {
        documentId: ref.documentId,
        fileName: ref.fileName,
        documentType: ref.documentType,
        summary: `[ATTENZIONE: Riassunto di "${ref.fileName}" non disponibile per errore di elaborazione. Il report potrebbe essere incompleto per questo documento. Errore: ${message}]`,
        totalCharsOriginal: 0,
      };
    }
  }));
}

/**
 * Summarize a batch of documents concurrently (legacy — receives full OCR text).
 * NOTE: the Mistral semaphore is PER-PROCESS, not global — within one invocation
 * it caps concurrency without serializing across processes, so Promise.all here
 * is both safe and faster. Per-doc errors degrade to a fallback summary.
 */
export async function summarizeDocumentBatch(
  docs: DocumentOcrContext[],
): Promise<DocumentSummary[]> {
  return Promise.all(docs.map(async (doc): Promise<DocumentSummary> => {
    try {
      return await summarizeDocument(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      logger.error('synthesis', `Failed to summarize doc ${doc.documentId}: ${message}`);
      // Include raw OCR text (truncated) as fallback so the LLM has some content
      const rawText = doc.pages
        .map((p) => p.ocrText)
        .join('\n')
        .slice(0, 3000);
      const fallback = rawText.length > 0
        ? `[Riassunto non disponibile — estratto OCR grezzo (primi 3000 caratteri)]:\n${rawText}`
        : `[Riassunto non disponibile — ${doc.totalChars} caratteri OCR originali, nessun testo estraibile]`;
      return {
        documentId: doc.documentId,
        fileName: doc.fileName,
        documentType: doc.documentType,
        summary: fallback,
        totalCharsOriginal: doc.totalChars,
      };
    }
  }));
}
