/**
 * Pure helpers for the per-section review state stored in
 * reports.generation_metadata.sections, keyed by canonical section id.
 *
 * Client+server safe: only TYPE imports from the Drizzle schema (erased at
 * compile, no runtime dependency on drizzle/pg-core).
 */
import type {
  ReportGenerationMetadata,
  ReportSectionStates,
  SectionState,
  SectionStatus,
} from '@/db/schema/reports';

export type { SectionState, SectionStatus };

/**
 * Merge a single section's state into the report metadata, immutably.
 * Returns null when there is no canonical id to key on (caller should then
 * skip the metadata write rather than clobbering it).
 */
export function markSectionState(
  metadata: ReportGenerationMetadata | null | undefined,
  canonicalId: string | undefined | null,
  updater: (prev: SectionState | undefined) => SectionState,
): ReportGenerationMetadata | null {
  if (!canonicalId) return null;
  const base: ReportGenerationMetadata = metadata ?? {};
  const sections: ReportSectionStates = { ...(base.sections ?? {}) };
  sections[canonicalId] = updater(sections[canonicalId]);
  return { ...base, sections };
}

/** Read the persisted status for a section (default 'auto'). */
export function getSectionStatus(
  metadata: ReportGenerationMetadata | null | undefined,
  canonicalId: string,
): SectionStatus {
  return metadata?.sections?.[canonicalId]?.status ?? 'auto';
}

/** Read the full persisted state for a section (may be undefined). */
export function getSectionState(
  metadata: ReportGenerationMetadata | null | undefined,
  canonicalId: string,
): SectionState | undefined {
  return metadata?.sections?.[canonicalId];
}
