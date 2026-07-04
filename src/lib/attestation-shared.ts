/**
 * Attestazione di revisione pre-deposito ("verify before sign") — parte
 * CLIENT-SAFE, condivisa tra il dialog di approvazione e il server.
 *
 * PERCHÉ (ricerca 2026-07-04): l'assenza di un'attestazione obbligatoria del
 * professionista è ormai un rilievo di audit (Ontario 5/2026) e i tribunali
 * collocano la violazione "at the point of signing". UNA frizione ben
 * piazzata riduce l'over-reliance; frizioni ovunque producono rubber-stamping
 * → la spunta è per le sole sezioni ad alto rischio + una dichiarazione unica,
 * dentro il flusso di approvazione già esistente.
 */

import { parseSections } from './section-parser-client';

/** Sezioni ad alto rischio per un atto RC: verbatim clinici, importi, sintesi. */
export const HIGH_RISK_SECTION_IDS: readonly string[] = [
  'documentazione_sanitaria',
  'spese_mediche',
  'epicrisi',
];

export const ATTESTATION_DECLARATION =
  'Ho verificato personalmente contenuti, citazioni testuali e date del report; ' +
  'il documento è mio e ne assumo la responsabilità professionale.';

export interface RequiredAttestationSection {
  canonicalId: string;
  title: string;
}

/**
 * Le sezioni ad alto rischio effettivamente presenti nel report (deduplicate
 * per canonicalId). Vuoto per report senza sezioni riconoscibili.
 */
export function getRequiredAttestationSections(
  synthesis: string | null | undefined,
): RequiredAttestationSection[] {
  if (!synthesis) return [];
  const seen = new Set<string>();
  const required: RequiredAttestationSection[] = [];
  for (const section of parseSections(synthesis)) {
    if (!HIGH_RISK_SECTION_IDS.includes(section.canonicalId)) continue;
    if (seen.has(section.canonicalId)) continue;
    seen.add(section.canonicalId);
    required.push({ canonicalId: section.canonicalId, title: section.title });
  }
  return required;
}
