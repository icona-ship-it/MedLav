/**
 * Hard-verification of the verbatim quotes («...») that an LLM produced in a
 * generated section against the original OCR text.
 *
 * The SELECTIVE documentazione sanitaria lets the model quote clinically
 * significant findings VERBATIM (diagnoses, lesion descriptions, contested
 * declarations) while paraphrasing routine content. A quote is only trustworthy
 * if it actually exists in the source documents: this module flags every
 * guillemet quote that cannot be grounded in the OCR, so a fabricated citation
 * can never reach a perito unflagged.
 *
 * Design choices:
 * - Quotes are NEVER deleted (mai perdere un fatto): an ungrounded quote is kept
 *   verbatim and annotated with a visible, NON-BLOCKING marker.
 * - Only `«...»` guillemets count as verbatim quotes — the selective prompt
 *   instructs the model to reserve them exclusively for verbatim citation, so
 *   ordinary prose and `"..."` are never touched.
 * - Grounding reuses isCitationGrounded (exact → normalized → LCS ≥ 0.80).
 *
 * Pure function — no LLM calls, no side effects.
 */

import { isCitationGrounded } from './source-text-verifier';

export interface QuoteVerification {
  quote: string;
  grounded: boolean;
}

export interface GeneratedQuotesResult {
  /** Number of meaningful guillemet quotes examined. */
  total: number;
  groundedCount: number;
  ungroundedCount: number;
  verifications: QuoteVerification[];
  /** Markdown with a visible marker appended after each ungrounded quote. */
  annotatedMarkdown: string;
}

/** Visible, non-blocking marker appended after an ungrounded verbatim quote. */
export const UNVERIFIED_QUOTE_MARKER =
  ' ⚠️ *[citazione da verificare sul documento originale]*';

/**
 * Quotes shorter than this are not examined: single terms / abbreviations
 * («dx», «sì») are too short for reliable grounding and not the substantial
 * clinical citations the guard targets.
 */
const MIN_QUOTE_LEN = 8;

// Guillemet quote, non-greedy, no nested guillemets, bounded length.
const GUILLEMET_QUOTE = /«([^«»]{1,2000})»/g;

/**
 * Verify the guillemet quotes in `markdown` against `fullOcrText` and annotate
 * the ungrounded ones in place.
 */
export function verifyGeneratedQuotes(
  markdown: string,
  fullOcrText: string,
): GeneratedQuotesResult {
  const verifications: QuoteVerification[] = [];

  const annotatedMarkdown = markdown.replace(
    GUILLEMET_QUOTE,
    (match, inner: string, offset: number, full: string) => {
      const quote = inner.trim();

      // Skip trivially short fragments — not meaningful clinical citations.
      if (quote.length < MIN_QUOTE_LEN) return match;

      const grounded = isCitationGrounded(quote, fullOcrText);
      verifications.push({ quote, grounded });

      if (grounded) return match;

      // Idempotency: do not append a second marker if one already follows.
      const rest = full.slice(offset + match.length);
      if (rest.startsWith(UNVERIFIED_QUOTE_MARKER)) return match;

      return `${match}${UNVERIFIED_QUOTE_MARKER}`;
    },
  );

  const groundedCount = verifications.filter((v) => v.grounded).length;

  return {
    total: verifications.length,
    groundedCount,
    ungroundedCount: verifications.length - groundedCount,
    verifications,
    annotatedMarkdown,
  };
}
