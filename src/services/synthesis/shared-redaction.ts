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
 */

import { parseSynthesisSections, replaceSectionContent } from './section-parser';
import { DETERMINISTIC_MARKERS, DOC_SANITARIA_OMITTED } from '../calculations/deterministic-tables';

const DOC_SANITARIA_ID = 'documentazione_sanitaria';

export function redactMaterializedDocSanitariaForPublic(synthesis: string): string {
  if (!synthesis) return synthesis;

  const section = parseSynthesisSections(synthesis).find((s) => s.id === DOC_SANITARIA_ID);
  // No such section → nothing to redact.
  if (!section) return synthesis;
  // Still the deterministic placeholder (sentinel present): expandDeterministicBlocks
  // without docs already replaces it with the neutral note. Leave it untouched.
  if (section.content.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) return synthesis;

  // Materialized AI variant → strip the verbatim clinical content for the public link.
  return replaceSectionContent(synthesis, DOC_SANITARIA_ID, DOC_SANITARIA_OMITTED);
}
