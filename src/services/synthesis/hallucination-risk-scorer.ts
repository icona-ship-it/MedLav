/**
 * Hallucination Risk Score (HRS) — quantitative aggregation of validator
 * findings into a single 0-100 score per report.
 *
 * Existing validators (phantom_date, unverified_citation, numerical_mismatch,
 * low_event_coverage, sentinel_*, duplicate_content, truncated_response) emit
 * issues that the perito must review one by one. HRS rolls them up into one
 * number for at-a-glance assessment and trend tracking across versions.
 *
 * Score interpretation:
 *   90-100  Eccellente   — pochi o nessun rilievo
 *   70-89   Buono        — alcuni rilievi minori, perito verifica
 *   50-69   Da rivedere  — più rilievi significativi
 *   0-49    Critico      — molti rilievi o errori bloccanti
 *
 * The score is informational, not blocking. The validator's separate
 * `valid` flag (driven by `severity: error` issues) remains the authoritative
 * gate for whether a report is structurally savable.
 */

import type { ReportValidation, ReportIssue } from './report-validator';

/** Penalty per issue type (subtracted from base 100). Tuned by severity / criticality. */
const PENALTY_BY_TYPE: Record<ReportIssue['type'], number> = {
  // Critical errors — large penalty, typically already block save via validation.valid=false
  empty_report:        100,
  truncated_response:   80,
  broken_ocr_marker:   100, // [object Object] / null / undefined leaked into report
  sentinel_date_leak:   60, // model leaked the 1900 sentinel — serious factual concern
  too_short:            40,

  // High-impact warnings on factuality
  phantom_date:         15, // date not in any event — possible fabrication
  numerical_mismatch:   20, // ITT/ITP mismatch with calculated values
  unverified_citation:  10, // quoted text not found in OCR
  low_event_coverage:   25, // significant chunk of events not cited
  invalid_event_ref:    15, // legacy [Ev.N] reference — should not occur post-removal

  // Structural / cosmetic
  missing_section:      20, // required section absent
  duplicate_content:    10, // same paragraph repeated
  sentinel_name_leak:    5, // few-shot example name leaked — review needed but minor

  // Wave 2.2 — header coherence and fabrication signatures
  header_mismatch:           50, // perizia metadata field doesn't match the rendered header
  header_fabrication_signature: 80, // Regnoto-style fabrication detected (multi-pattern match)
};

/**
 * Compute Hallucination Risk Score (0-100) from a ReportValidation result.
 * 100 = no issues. Penalties accumulate but score never goes below 0.
 *
 * Each issue type contributes its penalty once per occurrence. To keep the
 * score interpretable, we cap penalty per type at 3x the base penalty (so a
 * report with 10 phantom_date warnings doesn't go negative just from one type).
 */
export function computeHrs(validation: ReportValidation): number {
  // Group issues by type to apply per-type cap
  const countsByType = new Map<ReportIssue['type'], number>();
  for (const issue of validation.issues) {
    countsByType.set(issue.type, (countsByType.get(issue.type) ?? 0) + 1);
  }

  let totalPenalty = 0;
  for (const [type, count] of countsByType) {
    const perIssuePenalty = PENALTY_BY_TYPE[type] ?? 5;
    const cappedCount = Math.min(count, 3); // cap at 3 occurrences per type
    totalPenalty += perIssuePenalty * cappedCount;
  }

  const score = Math.max(0, 100 - totalPenalty);
  return Math.round(score);
}

/**
 * Translate a numeric HRS into a qualitative level for UI display.
 */
export function getHrsLevel(hrs: number): 'eccellente' | 'buono' | 'da_rivedere' | 'critico' {
  if (hrs >= 90) return 'eccellente';
  if (hrs >= 70) return 'buono';
  if (hrs >= 50) return 'da_rivedere';
  return 'critico';
}
