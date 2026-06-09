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

// Section ids that mark a REAL section boundary but are NOT in SECTION_ID_MAP
// (placeholder sections the perito fills). Without these, excluding a section
// before them via the report selector could let the redaction swallow them on the
// public link (over-redaction). Kept conservative: only the perito placeholders.
const ADDITIONAL_BOUNDARY_IDS: ReadonlySet<string> = new Set([
  'visita_clinica',
  'quesiti',
  'esame_obiettivo',
]);

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
    if (id !== DOC_SANITARIA_ID && (CANONICAL_SECTION_IDS.has(id) || ADDITIONAL_BOUNDARY_IDS.has(id))) {
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
 * Keeps the timeline STRUCTURE (date, event_type, order_number) but removes the
 * special-category data. NB: `title` is ALSO blanked — it is clinical by
 * construction (e.g. "Osteosintesi piatto tibiale destro con placca e viti") and
 * is rendered raw on the public surface (events tab + cronologia/spese tables);
 * the non-clinical `event_type` badge/column remains as the label. The owner's
 * authenticated view/export is unaffected. Returns NEW objects (immutable).
 */
export function redactEventsForPublic<T>(events: readonly T[]): T[] {
  return events.map((e) => ({
    ...(e as Record<string, unknown>),
    title: '',
    description: '',
    diagnosis: null,
    doctor: null,
    facility: null,
  })) as T[];
}

/**
 * GDPR Art. 9: blank the free-text clinical fields of anomalies before the PUBLIC
 * shared link. Anomaly `description`/`suggestion` embed verbatim clinical data —
 * discordant diagnoses, procedure names, free clinical text (anomaly-detector.ts)
 * — otherwise served raw next to patient_initials on an unauthenticated link. The
 * structural fields (anomaly_type, severity) are kept so the flag still shows.
 * Returns NEW objects (immutable).
 */
export function redactAnomaliesForPublic<T>(anomalies: readonly T[]): T[] {
  return anomalies.map((a) => ({
    ...(a as Record<string, unknown>),
    description: '',
    suggestion: null,
  })) as T[];
}
