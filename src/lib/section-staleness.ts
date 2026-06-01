/**
 * Dependency-based "staleness" detection: after the perito edits events, which
 * report sections might no longer reflect them? Pure + client-safe.
 *
 * 'stale' is NEVER persisted — it is computed at runtime from the set of event
 * types the perito mutated since the report was generated. The perito then
 * chooses what to regenerate (fiducia di default, controllo a richiesta).
 *
 * Conservative by design: when unsure, a narrative section defaults to
 * depending on clinical events (better to offer a regeneration than to miss
 * one). Deterministic/placeholder sections never go stale.
 */
import type { SectionStatus } from '@/db/schema/reports';

export type EventDomain = 'clinical' | 'expenses' | 'admin';

/** Map an event type to the data domain a change in it touches. */
export function eventTypeToDomain(eventType: string): EventDomain {
  if (eventType === 'spesa_medica') return 'expenses';
  if (eventType === 'documento_amministrativo' || eventType === 'certificato') return 'admin';
  return 'clinical';
}

/**
 * Sections that NEVER go stale from an event change:
 *  - placeholders compiled by the perito (no LLM content),
 *  - deterministic factual blocks (auto-expanded from current data),
 *  - the template-rendered header / metadata-only sections.
 */
const NEVER_STALE_SECTIONS: ReadonlySet<string> = new Set([
  'intestazione',            // template-rendered header
  'spese_mediche',           // deterministic table (auto-updates)
  'considerazioni_ml',       // placeholder (+ deterministic ITT/ITP)
  'operazioni_peritali',     // placeholder
  'conciliazione_ante_bozza', // placeholder (ATP 696-bis)
  'conciliazione_post_bozza', // placeholder (ATP 696-bis)
  'osservazioni_bozza',      // placeholder
  'visita_clinica',          // placeholder
  'valutazione_responsabilita', // placeholder
  'stima_riserva',           // placeholder
  'bibliografia',            // pubmed-driven, not event-driven
]);

/** Explicit domain overrides; anything not listed defaults to ['clinical']. */
const SECTION_DOMAIN_OVERRIDES: Record<string, EventDomain[]> = {
  documentazione_atti: ['admin'],
  premesse: ['clinical', 'admin'],
  pareri_tecnici: [], // perizie/pareri are documents, not timeline events
};

function sectionDomains(canonicalId: string): EventDomain[] {
  return SECTION_DOMAIN_OVERRIDES[canonicalId] ?? ['clinical'];
}

export interface SectionStalenessInput {
  canonicalId: string;
  status: SectionStatus;
}

export interface StaleSection {
  canonicalId: string;
  /** The section also has manual edits → regenerating overwrites them. */
  edited: boolean;
}

/**
 * Given the report's sections and the event types mutated since generation,
 * return the sections that may be out of date. Locked sections and
 * deterministic/placeholder sections are excluded; edited sections are
 * included but flagged so the UI can warn before overwriting.
 */
export function computeStaleSections(
  sections: ReadonlyArray<SectionStalenessInput>,
  mutatedEventTypes: ReadonlySet<string>,
): StaleSection[] {
  if (mutatedEventTypes.size === 0) return [];
  const mutatedDomains = new Set<EventDomain>(
    [...mutatedEventTypes].map(eventTypeToDomain),
  );

  const stale: StaleSection[] = [];
  for (const section of sections) {
    if (NEVER_STALE_SECTIONS.has(section.canonicalId)) continue;
    if (section.status === 'locked') continue;
    const domains = sectionDomains(section.canonicalId);
    if (domains.some((d) => mutatedDomains.has(d))) {
      stale.push({ canonicalId: section.canonicalId, edited: section.status === 'edited' });
    }
  }
  return stale;
}
