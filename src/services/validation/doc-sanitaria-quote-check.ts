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
import { verifyGeneratedQuotes, type GeneratedQuotesResult, type VerifyQuotesOptions } from './generated-quote-verifier';

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
  opts?: VerifyQuotesOptions,
): GeneratedQuotesResult {
  return verifyGeneratedQuotes(content, concatOcrText(documentsOcrText), opts);
}

/**
 * Variante GATED per la perizia RC stragiudiziale (excludeLabTests). Decisione di
 * Lavini (2026-06-28): in un atto FIRMATO non vanno i marker ⚠️ "[citazione da
 * verificare]" inline (erano ~409 su Bigon, frutto del verificatore strict applicato
 * a centinaia di citazioni-passaggio verbatim). Per RC il contenuto resta PULITO; il
 * conteggio delle citazioni non riscontrate è comunque calcolato e restituito, così il
 * chiamante può loggarlo per audit. Altri ruoli (CTU/CTP): annotazione invariata.
 */
export function annotateDocSanitariaQuotesGated(
  content: string,
  documentsOcrText: DocumentOcrContext[] | undefined,
  opts: { excludeLabTests?: boolean } & VerifyQuotesOptions = {},
): GeneratedQuotesResult {
  const { excludeLabTests, ...verifyOpts } = opts;
  const checked = verifyGeneratedQuotes(content, concatOcrText(documentsOcrText), verifyOpts);
  if (excludeLabTests) {
    // RC: niente marker inline — il testo resta quello generato; il conteggio serve solo all'audit.
    return { ...checked, annotatedMarkdown: content };
  }
  return checked;
}
