/**
 * Fetch anomalies from DB filtered to those that should appear in the
 * generated report, with the perito's note attached when present.
 *
 * Status semantics:
 *   - `user_confirmed` → perito has explicitly chosen to include this in report
 *   - `llm_confirmed`  → AI verified the anomaly is real, perito hasn't reviewed yet
 *   - `detected`       → algorithm flagged, AI hasn't reviewed yet (rare)
 *   - `user_dismissed` → perito has explicitly excluded → MUST NOT appear in report
 *   - `llm_resolved`   → AI found false positive → MUST NOT appear in report
 *
 * The first three flow into synthesis; the last two are filtered out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DetectedAnomaly } from './anomaly-detector';
import type { AnomalyType, AnomalySeverity } from '@/types';

/** Statuses whose anomalies are eligible for inclusion in the report. */
const ELIGIBLE_STATUSES = ['user_confirmed', 'llm_confirmed', 'detected'] as const;

interface AnomalyRow {
  anomaly_type: string;
  severity: string;
  description: string;
  involved_events: string | null;
  suggestion: string | null;
  resolution_note: string | null;
  status: string | null;
}

/**
 * Fetch anomalies from DB that should be included in the synthesis prompt.
 * Excludes user_dismissed and llm_resolved. Returns DetectedAnomaly[] enriched
 * with the perito's resolution_note when status is user_confirmed.
 */
export async function fetchAnomaliesForSynthesis(
  supabase: SupabaseClient,
  caseId: string,
): Promise<DetectedAnomaly[]> {
  const { data, error } = await supabase
    .from('anomalies')
    .select('anomaly_type, severity, description, involved_events, suggestion, resolution_note, status')
    .eq('case_id', caseId)
    .in('status', ELIGIBLE_STATUSES as unknown as string[])
    .order('severity', { ascending: true });

  if (error || !data) return [];

  return (data as AnomalyRow[]).map((row) => {
    let involvedEvents: DetectedAnomaly['involvedEvents'] = [];
    if (row.involved_events) {
      try {
        const parsed = JSON.parse(row.involved_events) as DetectedAnomaly['involvedEvents'];
        if (Array.isArray(parsed)) involvedEvents = parsed;
      } catch {
        // ignore malformed JSON
      }
    }
    return {
      anomalyType: row.anomaly_type as AnomalyType,
      severity: row.severity as AnomalySeverity,
      description: row.description,
      involvedEvents,
      suggestion: row.suggestion ?? '',
      // Only attach resolution_note when the perito wrote it (user_confirmed).
      // For llm_confirmed/detected the field is empty by design (no AI text leaks).
      resolutionNote: row.status === 'user_confirmed' ? row.resolution_note : null,
    };
  });
}
