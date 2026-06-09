/**
 * GDPR Art. 9 redaction for the PUBLIC shared link.
 *
 * The public shared page withholds the raw clinical OCR by NOT passing `docs` to
 * expandDeterministicBlocks — which works only while the documentazione_sanitaria
 * section is the DETERMINISTIC placeholder (it carries the DOC_SANITARIA sentinel,
 * suppressed when docs are omitted). But when the perito generates an AI variant
 * (selective / integral), that section is MATERIALIZED: the verbatim clinical
 * narrative — doctor/facility names, quoted diagnoses, lesion descriptions,
 * patient declarations (special-category Art. 9 data) — is baked directly into
 * reports.synthesis with NO sentinel left to suppress, and would otherwise be
 * served verbatim on an unauthenticated, forwardable link.
 *
 * This neutralizes a materialized documentazione_sanitaria section before the
 * report reaches the public surface, replacing its body with the same neutral
 * note. Pure function — no side effects.
 *
 * IMPORTANT (fail-closed): the section boundary is NOT "the next `## ` heading"
 * (the AI selective variant emits per-document sub-titles, and a single stray
 * `## ` inside the clinical narrative would otherwise leave everything after it
 * exposed — and a repeated "Documentazione Sanitaria" heading would leak too).
 * Instead we redact from the first doc-sanitaria heading up to the next heading
 * that maps to a DIFFERENT *recognized* canonical section. Any heading in between
 * (a second doc-sanitaria heading, an internal sub-title, an unknown slug) is
 * treated as part of the clinical body and redacted.
 */

import {
  identifySectionId,
  CANONICAL_SECTION_IDS,
} from '@/lib/section-parser-client';
import { DETERMINISTIC_MARKERS, DOC_SANITARIA_OMITTED } from '../calculations/deterministic-tables';

const DOC_SANITARIA_ID = 'documentazione_sanitaria';
const HEADING_REGEX = /^##\s+(.+)$/gm;

export function redactMaterializedDocSanitariaForPublic(synthesis: string): string {
  if (!synthesis) return synthesis;

  const headings: Array<{ title: string; index: number }> = [];
  let match: RegExpExecArray | null;
  HEADING_REGEX.lastIndex = 0;
  while ((match = HEADING_REGEX.exec(synthesis)) !== null) {
    headings.push({ title: match[1].trim(), index: match.index });
  }
  if (headings.length === 0) return synthesis;

  // First heading that maps to documentazione_sanitaria.
  const startIdx = headings.findIndex((h) => identifySectionId(h.title) === DOC_SANITARIA_ID);
  if (startIdx === -1) return synthesis;

  const sectionStart = headings[startIdx].index;

  // Extend the end to the next heading mapping to a DIFFERENT recognized
  // canonical section. Headings in between are part of the redacted body.
  let endIndex = synthesis.length;
  for (let i = startIdx + 1; i < headings.length; i++) {
    const id = identifySectionId(headings[i].title);
    if (id !== DOC_SANITARIA_ID && CANONICAL_SECTION_IDS.has(id)) {
      endIndex = headings[i].index;
      break;
    }
  }

  // Still the deterministic placeholder (sentinel present in the region):
  // expandDeterministicBlocks without docs already neutralizes it — leave it.
  const region = synthesis.slice(sectionStart, endIndex);
  if (region.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) return synthesis;

  const headingLine = `## ${headings[startIdx].title}`;
  const before = synthesis.slice(0, sectionStart);
  const after = synthesis.slice(endIndex);

  return `${before}${headingLine}\n\n${DOC_SANITARIA_OMITTED}\n\n${after}`
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * GDPR Art. 9: blank the verbatim clinical fields of events BEFORE they reach the
 * PUBLIC shared link — both the Events tab (SharedCaseView) and the deterministic
 * cronologia/spese tables (toDeterministicEvents → expandDeterministicBlocks).
 * Keeps the timeline STRUCTURE (date, type, title, order_number) but removes the
 * special-category data: free-text description, diagnosis, and doctor/facility
 * names. The owner's authenticated view/export is unaffected. Returns NEW objects
 * (immutable); the element shape is preserved.
 */
export function redactEventsForPublic<T>(events: readonly T[]): T[] {
  return events.map((e) => ({
    ...(e as Record<string, unknown>),
    description: '',
    diagnosis: null,
    doctor: null,
    facility: null,
  })) as T[];
}
