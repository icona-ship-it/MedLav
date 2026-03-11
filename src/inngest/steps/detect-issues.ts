import { createAdminClient } from '@/lib/supabase/admin';
import { detectAnomalies } from '@/services/validation/anomaly-detector';
import type { DetectedAnomaly } from '@/services/validation/anomaly-detector';
import { detectMissingDocuments } from '@/services/validation/missing-doc-detector';
import type { MissingDocument } from '@/services/validation/missing-doc-detector';
import { checkCompleteness } from '@/services/validation/completeness-checker';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { CaseType } from '@/types';
import { logger } from '@/lib/logger';

/**
 * Step 5: Detect anomalies — delete old, re-detect on ALL events.
 * Uses algorithmic detection (no LLM call).
 */
export async function detectAnomaliesStep(
  caseId: string,
  allEvents: ConsolidatedEvent[],
  caseType: CaseType,
  caseTypes: CaseType[],
): Promise<DetectedAnomaly[]> {
  const supabase = createAdminClient();

  // Delete previous anomalies for this case
  await supabase.from('anomalies').delete().eq('case_id', caseId);

  // Re-detect on the full event set (with case type for sequence validation)
  const detected = detectAnomalies(allEvents, {
    caseType,
    caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
  });

  logger.info('pipeline', ` Step 5: Detected ${detected.length} anomalies (full case)`);

  if (detected.length > 0) {
    const anomalyRows = detected.map((a) => ({
      case_id: caseId,
      anomaly_type: a.anomalyType,
      severity: a.severity,
      description: a.description,
      involved_events: JSON.stringify(a.involvedEvents),
      suggestion: a.suggestion,
    }));

    await supabase.from('anomalies').insert(anomalyRows);
  }

  return detected;
}

/**
 * Step 6: Detect missing documents — delete old, re-detect based on event content.
 * Also runs completeness checklist per case type.
 */
export async function detectMissingDocumentsStep(
  caseId: string,
  allEvents: ConsolidatedEvent[],
  caseType: CaseType,
  caseTypes: CaseType[],
): Promise<MissingDocument[]> {
  const supabase = createAdminClient();

  // Delete previous missing documents for this case
  await supabase.from('missing_documents').delete().eq('case_id', caseId);

  const missing = detectMissingDocuments({
    events: allEvents,
    caseType,
    caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
  });

  // Completeness checklist per case type
  const completeness = checkCompleteness({
    events: allEvents,
    caseType,
    caseTypes: caseTypes.length > 1 ? caseTypes : undefined,
  });

  // Convert missing checklist items to missing_documents entries
  for (const req of completeness.missingRequired) {
    missing.push({
      documentName: `[CHECKLIST] ${req.name}`,
      reason: `${req.category === 'obbligatorio' ? 'Obbligatorio' : 'Raccomandato'} per caso ${caseType} — non trovato negli eventi estratti`,
      relatedEvent: null,
    });
  }

  logger.info('pipeline', ` Step 6: Detected ${missing.length} missing documents (full case), completeness: ${completeness.completenessPercent}%`);

  if (missing.length > 0) {
    const missingRows = missing.map((m) => ({
      case_id: caseId,
      document_name: m.documentName,
      reason: m.reason,
      related_event: m.relatedEvent,
    }));

    await supabase.from('missing_documents').insert(missingRows);
  }

  return missing;
}
