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
 * delimiters (straight "..." or curly "..."), which bypass the «...» grounding.
 * Operates on the guillemet-stripped text so legitimate «...» are ignored.
 *
 * Fires ONLY for a substantial span that is NOT grounded in the OCR (`absent`):
 * a faithful-but-mis-delimited quote (present in the OCR) is harmless and a short
 * straight-quoted document title is not flagged — so the note signals the genuine
 * concern (a fabricated citation that escaped the «...» check) without crying wolf
 * on the deposited document.
 */
const STRAIGHT_DOUBLE_QUOTE_G = /"([^"\n]{20,})"/g;
const CURLY_DOUBLE_QUOTE_G = /“([^”\n]{20,})”/g;

function hasUnverifiedNonGuillemetQuotes(markdown: string, fullOcrText: string): boolean {
  const withoutGuillemets = markdown.replace(/«[^«»]*»/g, '');
  const spans: string[] = [];
  for (const re of [STRAIGHT_DOUBLE_QUOTE_G, CURLY_DOUBLE_QUOTE_G]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(withoutGuillemets)) !== null) spans.push(m[1].trim());
  }
  return spans.some((s) => s.length >= 20 && groundCitation(s, fullOcrText) === 'absent');
}

/**
 * Quotes shorter than this are not examined: 1-3 char fragments («dx», «sì»)
 * appear all over any OCR, so grounding them is meaningless. From 4 chars up a
 * genuine quote still grounds trivially via exact/normalized match, while a
 * fabricated short term gets flagged — so the floor stays low to catch
 * short-but-decisive citations (a misread laterality, a wrong abbreviation).
 */
const MIN_QUOTE_LEN = 4;

/** Soglia per le virgolette dritte/curve "..." quando verificate inline. Più alta
 * di MIN_QUOTE_LEN (4 delle «...», riservate al verbatim) perché le "..." sono più
 * rumorose, ma BASSA abbastanza da catturare le distorsioni clinico-legali brevi-ma-
 * decisive — una percentuale di invalidità o una prognosi alterata ("INVALIDITÀ 25%"
 * = 14 char, "prognosi 90 giorni" = 18): a 20 sfuggivano (panel 2026-06-23). */
const MIN_STRAIGHT_QUOTE_LEN = 12;

// Guillemet quote, non-greedy, no nested guillemets, bounded length.
const GUILLEMET_QUOTE = /«([^«»]{1,2000})»/g;
// Ellissi interne = omissioni volute (stessa convenzione dello snapper): una
// citazione «A … B» va valutata per frammento, non come inner unico (il '…' non
// matcha mai l'OCR). Audit 2026-08-11, B-P2 (alert-fatigue sulle citazioni fedeli).
const ELLIPSIS_SPLIT = /\s*(?:\.\.\.|…)\s*/;
// Straight / curly double-quoted spans (single line, bounded length).
const STRAIGHT_DOUBLE_QUOTE_INLINE = /"([^"\n]{4,2000})"/g;
const CURLY_DOUBLE_QUOTE_INLINE = /“([^”\n]{4,2000})”/g;

export interface VerifyQuotesOptions {
  /** Annota inline (per-citazione) anche le citazioni con virgolette dritte/curve
   * "..." — non solo una nota di sezione. Per le sezioni la cui convenzione di
   * citazione È "..." (documentazione_atti, premesse, pareri_tecnici), così una
   * citazione alterata/fabbricata viene flaggata accanto al testo. doc-sanitaria
   * riserva «...» → default false (lì le "..." stray ricevono solo la nota). */
  annotateStraightQuotes?: boolean;
}

/**
 * Annota inline ogni citazione (catturata da `re`) NON fondata nell'OCR, con
 * marker visibile non-bloccante. STRICT: pulita solo su match verbatim
 * (exact/normalized); un `near` (una parola clinicamente decisiva alterata) è
 * flaggato, mai fidato. Idempotente. Le citazioni < `minLen` sono ignorate.
 */
function annotateUngroundedQuotes(
  text: string,
  re: RegExp,
  minLen: number,
  fullOcrText: string,
  verifications: QuoteVerification[],
): string {
  return text.replace(re, (match: string, inner: string, offset: number, full: string) => {
    const quote = inner.trim();
    if (quote.length < minLen) return match;
    // Con ellissi interne si valuta OGNI frammento: la citazione è fondata se
    // TUTTI i frammenti lo sono. Un frammento sotto minLen è troppo corto per un
    // giudizio (stessa policy delle citazioni corte) → non blocca.
    const fragments = quote.split(ELLIPSIS_SPLIT).map((f) => f.trim()).filter((f) => f.length > 0);
    const isFragmentGrounded = (f: string): boolean => {
      if (f.length < minLen) return true;
      const l = groundCitation(f, fullOcrText);
      return l === 'exact' || l === 'normalized';
    };
    const grounded = fragments.length > 1
      ? fragments.every(isFragmentGrounded)
      : (() => { const l = groundCitation(quote, fullOcrText); return l === 'exact' || l === 'normalized'; })();
    verifications.push({ quote, grounded });
    if (grounded) return match;
    // Idempotency: do not append a second marker if one already follows.
    const rest = full.slice(offset + match.length);
    if (rest.startsWith(UNVERIFIED_QUOTE_MARKER)) return match;
    return `${match}${UNVERIFIED_QUOTE_MARKER}`;
  });
}

/**
 * Verify the verbatim quotes in `markdown` against `fullOcrText` and annotate
 * the ungrounded ones in place. By default only `«...»` are inline-verified
 * (and stray "..." get a section note); with `annotateStraightQuotes` the
 * straight/curly "..." citations are inline-verified too (per-quote).
 */
export function verifyGeneratedQuotes(
  markdown: string,
  fullOcrText: string,
  opts?: VerifyQuotesOptions,
): GeneratedQuotesResult {
  const verifications: QuoteVerification[] = [];

  let annotatedMarkdown = annotateUngroundedQuotes(markdown, GUILLEMET_QUOTE, MIN_QUOTE_LEN, fullOcrText, verifications);

  if (opts?.annotateStraightQuotes) {
    annotatedMarkdown = annotateUngroundedQuotes(annotatedMarkdown, STRAIGHT_DOUBLE_QUOTE_INLINE, MIN_STRAIGHT_QUOTE_LEN, fullOcrText, verifications);
    annotatedMarkdown = annotateUngroundedQuotes(annotatedMarkdown, CURLY_DOUBLE_QUOTE_INLINE, MIN_STRAIGHT_QUOTE_LEN, fullOcrText, verifications);
  }

  const groundedCount = verifications.filter((v) => v.grounded).length;

  // La nota di sezione per le "..." si applica SOLO quando NON le annotiamo inline
  // (altrimenti ridondante). doc-sanitaria (opts off) mantiene la nota invariata.
  const nonGuillemetQuotesDetected = !opts?.annotateStraightQuotes && hasUnverifiedNonGuillemetQuotes(markdown, fullOcrText);
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
