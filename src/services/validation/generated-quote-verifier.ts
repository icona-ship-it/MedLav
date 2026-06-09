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
 * - Grounding is STRICT (groundCitation): a quote is clean ONLY on an exact or
 *   normalized (whitespace/case) substring match. A `near` match (LCS ≥ 0.80 but
 *   not a verbatim substring — a single altered word: laterality, severity, a
 *   number, a dropped negation) is FLAGGED, not trusted: that is exactly where a
 *   clinically-decisive distortion hides. (The lenient isCitationGrounded used by
 *   the anomaly-resolver still accepts near-matches; here we deliberately don't.)
 *
 * Pure function — no LLM calls, no side effects.
 */

import { groundCitation } from './source-text-verifier';

export interface QuoteVerification {
  quote: string;
  grounded: boolean;
}

export interface GeneratedQuotesResult {
  /** Number of meaningful guillemet quotes examined. */
  total: number;
  groundedCount: number;
  ungroundedCount: number;
  /** True when verbatim-looking quotes were emitted with non-«...» delimiters
   * (straight/curly quotes) — they bypass grounding, so a section note is added. */
  nonGuillemetQuotesDetected: boolean;
  verifications: QuoteVerification[];
  /** Markdown with a visible marker appended after each ungrounded quote. */
  annotatedMarkdown: string;
}

/** Visible, non-blocking marker appended after an ungrounded verbatim quote. */
export const UNVERIFIED_QUOTE_MARKER =
  ' ⚠️ *[citazione da verificare sul documento originale]*';

/** One-time section note when non-«...» quoted spans (unverified) are present. */
export const NON_GUILLEMET_QUOTES_NOTE =
  '\n\n⚠️ *[Attenzione: il testo contiene citazioni non racchiuse tra «...» (virgolette dritte o curve). Queste NON sono state verificate automaticamente contro i documenti: controllarne la fedeltà sull\'originale.]*';

/**
 * Detect verbatim-looking quoted spans the model emitted with the WRONG
 * delimiters (straight "..." or curly "..."/'...'), which bypass the «...»
 * grounding entirely. Operates on the guillemet-stripped text so legitimate
 * quotes are not double-counted. Length floor avoids matching apostrophes /
 * short emphasis.
 */
const STRAIGHT_DOUBLE_QUOTE = /"[^"\n]{15,}"/;
const CURLY_DOUBLE_QUOTE = /“[^”\n]{15,}”/;

function hasNonGuillemetQuotes(markdown: string): boolean {
  const withoutGuillemets = markdown.replace(/«[^«»]*»/g, '');
  return (
    STRAIGHT_DOUBLE_QUOTE.test(withoutGuillemets) ||
    CURLY_DOUBLE_QUOTE.test(withoutGuillemets)
  );
}

/**
 * Quotes shorter than this are not examined: 1-3 char fragments («dx», «sì»)
 * appear all over any OCR, so grounding them is meaningless. From 4 chars up a
 * genuine quote still grounds trivially via exact/normalized match, while a
 * fabricated short term gets flagged — so the floor stays low to catch
 * short-but-decisive citations (a misread laterality, a wrong abbreviation).
 */
const MIN_QUOTE_LEN = 4;

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

      // STRICT: clean only on a verbatim (exact/normalized) substring match. A
      // `near` LCS match — where a single clinically-decisive word was altered —
      // is flagged, never trusted.
      const level = groundCitation(quote, fullOcrText);
      const grounded = level === 'exact' || level === 'normalized';
      verifications.push({ quote, grounded });

      if (grounded) return match;

      // Idempotency: do not append a second marker if one already follows.
      const rest = full.slice(offset + match.length);
      if (rest.startsWith(UNVERIFIED_QUOTE_MARKER)) return match;

      return `${match}${UNVERIFIED_QUOTE_MARKER}`;
    },
  );

  const groundedCount = verifications.filter((v) => v.grounded).length;

  // Catch verbatim quotes emitted with the wrong delimiters (they skipped the
  // grounding above). Idempotent: the note is appended at most once.
  const nonGuillemetQuotesDetected = hasNonGuillemetQuotes(markdown);
  const withSectionNote =
    nonGuillemetQuotesDetected && !annotatedMarkdown.includes(NON_GUILLEMET_QUOTES_NOTE)
      ? `${annotatedMarkdown}${NON_GUILLEMET_QUOTES_NOTE}`
      : annotatedMarkdown;

  return {
    total: verifications.length,
    groundedCount,
    ungroundedCount: verifications.length - groundedCount,
    nonGuillemetQuotesDetected,
    verifications,
    annotatedMarkdown: withSectionNote,
  };
}
