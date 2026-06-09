/**
 * Deterministic verification of sourceText against the original OCR text.
 * Detects fabricated or hallucinated citations by the LLM.
 *
 * 3-level match per event:
 * 1. Exact: sourceText found verbatim in fullText
 * 2. Normalized: collapse whitespace, lowercase, strip page markers
 * 3. LCS word-level: sliding window, threshold >= 0.80
 *
 * Pure function — no LLM calls, no side effects.
 */

import type { ExtractedEvent } from '../extraction/extraction-schemas';

type MatchLevel = 'exact' | 'normalized' | 'lcs' | 'unverified';

export interface SourceTextVerification {
  eventIndex: number;
  matchLevel: MatchLevel;
  lcsRatio: number | null;
  verified: boolean;
}

export interface SourceTextVerificationResult {
  events: ExtractedEvent[];
  verifications: SourceTextVerification[];
  unverifiedCount: number;
}

// Skip LCS for very short sourceText to avoid false positives
const MIN_SOURCE_TEXT_FOR_LCS = 20;
const LCS_THRESHOLD = 0.80;
// Sliding window size in words for LCS comparison
const LCS_WINDOW_MULTIPLIER = 3;

/**
 * Verify that each event's sourceText actually exists in the OCR text.
 * Returns events with requiresVerification updated for unverified ones.
 */
export function verifySourceTexts(
  events: ExtractedEvent[],
  fullText: string,
): SourceTextVerificationResult {
  const cleanFullText = stripPageMarkers(fullText);
  const normalizedFullText = normalizeText(cleanFullText);
  const fullTextWords = normalizeForWords(fullText);

  const verifications: SourceTextVerification[] = [];
  const updatedEvents: ExtractedEvent[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const sourceText = event.sourceText ?? '';

    if (sourceText.length === 0) {
      verifications.push({
        eventIndex: i,
        matchLevel: 'unverified',
        lcsRatio: null,
        verified: false,
      });
      updatedEvents.push({
        ...event,
        requiresVerification: true,
        reliabilityNotes: appendNote(event.reliabilityNotes, 'Testo sorgente assente — verificare.'),
      });
      continue;
    }

    const verification = verifyOneSourceText(
      sourceText,
      cleanFullText,
      normalizedFullText,
      fullTextWords,
      i,
    );

    verifications.push(verification);

    if (!verification.verified) {
      updatedEvents.push({
        ...event,
        requiresVerification: true,
        reliabilityNotes: appendNote(
          event.reliabilityNotes,
          'Testo sorgente non riscontrato nel documento — verificare.',
        ),
      });
    } else {
      updatedEvents.push(event);
    }
  }

  return {
    events: updatedEvents,
    verifications,
    unverifiedCount: verifications.filter((v) => !v.verified).length,
  };
}

/**
 * 4-state grounding of a single citation against `fullText`:
 * - `exact`: verbatim substring present
 * - `normalized`: present modulo whitespace/case/markers
 * - `near`: LCS word-ratio ≥ 0.80 but NOT a verbatim substring — a SINGLE
 *   altered word lands here (laterality destro/sinistro, severity composta/
 *   scomposta, a number/percentage/duration swap, a dropped negation). For
 *   lenient consumers (anomaly-resolver evidence) this counts as grounded; for
 *   the verbatim-quote check it MUST be treated as "to verify", because a
 *   near-match is exactly where a clinically-decisive distortion hides.
 * - `absent`: not found.
 */
export type GroundingLevel = 'exact' | 'normalized' | 'near' | 'absent';

export function groundCitation(citation: string, fullText: string): GroundingLevel {
  if (!citation || citation.trim().length === 0) return 'absent';
  const cleanFullText = stripPageMarkers(fullText);
  const normalizedFullText = normalizeText(cleanFullText);
  const fullTextWords = normalizeForWords(fullText);
  const v = verifyOneSourceText(citation, cleanFullText, normalizedFullText, fullTextWords, 0);
  switch (v.matchLevel) {
    case 'exact':
      return 'exact';
    case 'normalized':
      return 'normalized';
    case 'lcs':
      return 'near';
    default:
      return 'absent';
  }
}

/**
 * Public single-string grounding check: is `citation` actually present in
 * `fullText` (exact → normalized → LCS ≥ 0.80)? Used to hard-verify LLM-produced
 * citations (e.g. the anomaly resolver's `evidence`). LENIENT: a near-match
 * (LCS) counts as grounded. For verbatim-quote fidelity use `groundCitation` and
 * reject anything below `normalized`. Empty/whitespace citations are never
 * grounded.
 */
export function isCitationGrounded(citation: string, fullText: string): boolean {
  return groundCitation(citation, fullText) !== 'absent';
}

/**
 * Verify a single sourceText against the full text.
 */
function verifyOneSourceText(
  sourceText: string,
  cleanFullText: string,
  normalizedFullText: string,
  fullTextWords: string[],
  eventIndex: number,
): SourceTextVerification {
  // Level 1: Exact match
  if (cleanFullText.includes(sourceText)) {
    return { eventIndex, matchLevel: 'exact', lcsRatio: null, verified: true };
  }

  // Level 2: Normalized match
  const normalizedSource = normalizeText(sourceText);
  if (normalizedFullText.includes(normalizedSource)) {
    return { eventIndex, matchLevel: 'normalized', lcsRatio: null, verified: true };
  }

  // Level 3: LCS word-level (only for sourceText >= 20 chars)
  if (sourceText.length >= MIN_SOURCE_TEXT_FOR_LCS) {
    const sourceWords = normalizeForWords(sourceText);
    const ratio = slidingWindowLcsRatio(sourceWords, fullTextWords);

    if (ratio >= LCS_THRESHOLD) {
      return { eventIndex, matchLevel: 'lcs', lcsRatio: ratio, verified: true };
    }

    return { eventIndex, matchLevel: 'unverified', lcsRatio: ratio, verified: false };
  }

  return { eventIndex, matchLevel: 'unverified', lcsRatio: null, verified: false };
}

/**
 * Strip [PAGE_START:N] and [PAGE_END:N] markers from text.
 */
function stripPageMarkers(text: string): string {
  return text.replace(/\[PAGE_(?:START|END):\d+\]/g, '');
}

/**
 * Normalize text for fuzzy comparison: lowercase, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[PAGE_(?:START|END):\d+\]/g, '')
    .replace(/\[TABLE_(?:START|END)\]/g, '')
    .replace(/-{2,}\s*pagina\s+\d+\s*-{2,}/gi, '')
    // Strip markdown emphasis/heading/code markers — Mistral OCR returns markdown,
    // so a faithful quote (plain) must still match an OCR term wrapped in **bold**.
    // Replace with a SPACE (not ''): a marker between two real tokens is a word
    // boundary; collapsing to '' would FUSE adjacent words and let a DISTORTED
    // citation match as "normalized" while the faithful one only reaches "near"
    // (audit 2026-06-09). normalizeForWords already uses ' ' for the same reason.
    .replace(/[*_`#~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize text for word-level LCS: lowercase, strip markers and punctuation.
 */
function normalizeForWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[PAGE_(?:START|END):\d+\]/g, '')
    .replace(/\[TABLE_(?:START|END)\]/g, '')
    // Markdown emphasis/heading/code markers → split boundary (OCR is markdown).
    .replace(/[.,;:!?()[\]{}"'«»\-–—/\\*_`#~]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Sliding window LCS: find the best LCS ratio over windows of the full text.
 * Window size = sourceWords.length * LCS_WINDOW_MULTIPLIER.
 * Returns the best ratio found.
 */
function slidingWindowLcsRatio(
  sourceWords: string[],
  fullTextWords: string[],
): number {
  if (sourceWords.length === 0 || fullTextWords.length === 0) return 0;

  const windowSize = Math.min(
    sourceWords.length * LCS_WINDOW_MULTIPLIER,
    fullTextWords.length,
  );
  const step = Math.max(1, Math.floor(sourceWords.length / 2));

  let bestRatio = 0;

  for (let start = 0; start <= fullTextWords.length - windowSize; start += step) {
    const windowWords = fullTextWords.slice(start, start + windowSize);
    const lcsLen = lcsWordLength(sourceWords, windowWords);
    const ratio = lcsLen / sourceWords.length;

    if (ratio > bestRatio) {
      bestRatio = ratio;
      if (ratio >= LCS_THRESHOLD) return ratio; // Early exit
    }
  }

  return bestRatio;
}

/**
 * Longest Common Subsequence on word arrays.
 * Uses space-optimized DP (two rows).
 */
function lcsWordLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;

  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[n];
}

/**
 * Append a note to existing reliability notes.
 */
function appendNote(existing: string | null | undefined, note: string): string {
  if (!existing || existing.trim().length === 0) return note;
  return `${existing}; ${note}`;
}
