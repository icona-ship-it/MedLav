/**
 * Document summarizer for map-reduce synthesis on large cases.
 * When a case has >50 documents, per-document summaries are generated
 * so the synthesis step can see 100% of the content instead of <1%.
 */
import {
  MISTRAL_MODELS,
  streamMistralChat,
  DETERMINISTIC_SEED,
} from '@/lib/mistral/client';
import type { DocumentOcrContext } from '@/inngest/steps/types';
import { logger } from '@/lib/logger';

/** Cases with more docs than this trigger map-reduce summarization */
export const MAP_REDUCE_THRESHOLD_DOCS = 50;

/** Max chars of OCR text sent per-document summary call */
export const OCR_PER_DOC_SUMMARY_LIMIT = 30_000;

/** Max summary output chars per document */
export const DOC_SUMMARY_MAX_CHARS = 2000;

export interface DocumentSummary {
  documentId: string;
  fileName: string;
  documentType: string;
  summary: string;
  totalCharsOriginal: number;
}

/**
 * Generate a structured summary of a single document's OCR text.
 * Truncates OCR input to OCR_PER_DOC_SUMMARY_LIMIT chars.
 */
export async function summarizeDocument(
  doc: DocumentOcrContext,
): Promise<DocumentSummary> {
  const ocrText = doc.pages
    .map((p) => p.ocrText)
    .join('\n\n')
    .slice(0, OCR_PER_DOC_SUMMARY_LIMIT);

  const { content: summary } = await streamMistralChat({
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
Scrivi in italiano, in modo fattuale senza opinioni. Se il documento non è sanitario (memoria, ricorso, fattura), riassumi il contenuto pertinente.`,
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

  logger.info('synthesis', `Summary for ${doc.documentId}: ${summary.length} chars from ${doc.totalChars} OCR chars`);

  return {
    documentId: doc.documentId,
    fileName: doc.fileName,
    documentType: doc.documentType,
    summary: summary.slice(0, DOC_SUMMARY_MAX_CHARS),
    totalCharsOriginal: doc.totalChars,
  };
}

/**
 * Summarize a batch of documents sequentially.
 * The Mistral semaphore serializes calls anyway, so sequential is correct.
 */
export async function summarizeDocumentBatch(
  docs: DocumentOcrContext[],
): Promise<DocumentSummary[]> {
  const results: DocumentSummary[] = [];
  for (const doc of docs) {
    try {
      const summary = await summarizeDocument(doc);
      results.push(summary);
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
      results.push({
        documentId: doc.documentId,
        fileName: doc.fileName,
        documentType: doc.documentType,
        summary: fallback,
        totalCharsOriginal: doc.totalChars,
      });
    }
  }
  return results;
}
