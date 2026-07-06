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

/**
 * Rimuove i finding claim-level di UNA sezione (edit o rigenerazione della
 * sezione → i claim citavano testo che non esiste più) aggiornando i conteggi.
 * Immutabile; ritorna il metadata invariato se non c'è nulla da rimuovere.
 */
export function pruneClaimFindingsForSection(
  metadata: ReportGenerationMetadata | null | undefined,
  canonicalId: string | null | undefined,
): ReportGenerationMetadata | null | undefined {
  const cv = metadata?.claimVerification;
  if (!metadata || !canonicalId || !cv?.findings?.length) return metadata;
  const findings = cv.findings.filter((f) => f.sectionId !== canonicalId);
  if (findings.length === cv.findings.length) return metadata;
  return {
    ...metadata,
    claimVerification: {
      ...cv,
      findings,
      unsupportedCount: findings.filter((f) => f.verdict === 'non_supportato').length,
      unverifiableCount: findings.filter((f) => f.verdict === 'non_verificabile').length,
    },
  };
}

/**
 * Rimuove dai metadata i campi PESANTI e non letti dalla vista, così il payload
 * RSC di ogni apertura report non li trascina. Oggi: `originalSynthesis` —
 * l'intera bozza AI integrale (su un macrodanno ~metà del peso del report),
 * usata SOLO dai percorsi di salvataggio/rigenerazione, ciascuno con la propria
 * query per reportId. La vista legge solo `sections` e `claimVerification`.
 * Immutabile; ritorna null/undefined invariati e non tocca l'oggetto originale.
 */
export function stripViewHeavyMetadata(
  metadata: ReportGenerationMetadata | null | undefined,
): ReportGenerationMetadata | null | undefined {
  if (!metadata || metadata.originalSynthesis === undefined) return metadata;
  const rest = { ...metadata };
  delete rest.originalSynthesis;
  return rest;
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
