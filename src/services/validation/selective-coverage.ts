/**
 * Omission safety net for the SELECTIVE documentazione sanitaria.
 *
 * The selective narrative deliberately paraphrases / omits ROUTINE content, but
 * a clinically SIGNIFICANT (T1) fact must never silently disappear — that would
 * violate the project's supreme constraint ("mai perdere un fatto"). This
 * cross-checks each high-relevance event against the generated narrative by date
 * and reports the ones whose date is absent, so a visible, NON-BLOCKING
 * "possibile omissione" banner can be appended.
 *
 * Conservative by design (false POSITIVES erode trust more than the rare missed
 * omission, since the default mode is the complete-deterministic reproduction):
 * - T1 ONLY (routine T2/T3 are allowed to be paraphrased / grouped away);
 * - GIORNO-precision dates only: month/year-precision events store a fabricated
 *   full-day ISO (e.g. "2024-03-01" for "marzo 2024") that the narrative is told
 *   NOT to write verbatim, so matching them as a full day yields false alarms;
 * - date-based (a proxy — a false negative is acceptable, the point is to catch a
 *   wholesale dropped significant event, not to audit every word);
 * - sentinel-dated events (1900-01-01) are skipped (no real date to look for).
 *
 * Pure function — no LLM calls, no side effects.
 */

import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { computeRelevanceTier } from '@/lib/event-relevance';
import { eventDateAppearsInReport } from '../synthesis/report-validator';

const SENTINEL_DATE = '1900-01-01';

export interface SelectiveCoverageResult {
  /** Number of high-relevance (T1) events that had a real date to check. */
  t1Total: number;
  /** T1 events whose date does not appear anywhere in the narrative. */
  missing: Array<{ eventDate: string; eventType: string; description: string }>;
}

function isT1(event: ConsolidatedEvent): boolean {
  const tier =
    event.relevanceTier ??
    computeRelevanceTier({
      eventType: event.eventType,
      diagnosis: event.diagnosis,
      discrepancyNote: event.discrepancyNote,
    });
  return tier === 'T1';
}

export function checkSelectiveCoverage(
  content: string,
  events: ConsolidatedEvent[],
): SelectiveCoverageResult {
  const contentLower = content.toLowerCase();

  const t1Dated = events.filter(
    (e) =>
      isT1(e) &&
      e.eventDate &&
      e.eventDate !== SENTINEL_DATE &&
      e.datePrecision === 'giorno',
  );

  const missing = t1Dated
    .filter((e) => !eventDateAppearsInReport(e.eventDate, contentLower))
    .map((e) => ({
      eventDate: e.eventDate,
      eventType: e.eventType,
      description: e.description ?? '',
    }));

  return { t1Total: t1Dated.length, missing };
}
