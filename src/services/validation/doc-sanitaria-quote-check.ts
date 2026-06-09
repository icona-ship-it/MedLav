/**
 * Integration glue between the SELECTIVE documentazione sanitaria (LLM narrative
 * that quotes significant findings verbatim) and the quote hard-verifier.
 *
 * Builds the grounding corpus from the case OCR and annotates every ungrounded
 * verbatim quote in the generated section, so a fabricated citation can never
 * reach the perito unflagged.
 *
 * Pure functions — no LLM calls, no side effects.
 */

import type { DocumentOcrContext } from '@/inngest/steps/types';
import { verifyGeneratedQuotes, type GeneratedQuotesResult } from './generated-quote-verifier';

/**
 * Concatenate all OCR page text across documents into a single grounding corpus.
 * Empty pages are skipped; documents are separated by a blank line.
 */
export function concatOcrText(documentsOcrText: DocumentOcrContext[] | undefined): string {
  if (!documentsOcrText || documentsOcrText.length === 0) return '';
  return documentsOcrText
    .flatMap((doc) => doc.pages.map((page) => page.ocrText))
    .filter((text) => text && text.trim().length > 0)
    .join('\n\n');
}

/**
 * Hard-verify the verbatim quotes in a SELECTIVE documentazione sanitaria section
 * against the source OCR, annotating ungrounded ones in place. Returns the
 * annotated content plus the verification result (for logging / audit).
 */
export function annotateDocSanitariaQuotes(
  content: string,
  documentsOcrText: DocumentOcrContext[] | undefined,
): GeneratedQuotesResult {
  return verifyGeneratedQuotes(content, concatOcrText(documentsOcrText));
}
