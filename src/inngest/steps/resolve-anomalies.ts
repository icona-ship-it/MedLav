import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAnomalies, filterUnresolvedAnomalies } from '@/services/validation/anomaly-resolver';
import type { OcrPageFetcher } from '@/services/validation/anomaly-resolver';
import type { DetectedAnomaly } from '@/services/validation/anomaly-detector';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import { logger } from '@/lib/logger';

/**
 * Step 5.5: LLM Anomaly Resolution.
 * For each detected anomaly, reads source OCR pages and asks Mistral Large
 * if there's explicit evidence that resolves it.
 *
 * Returns only the anomalies that were NOT resolved (to flow into the report).
 */
export async function resolveAnomaliesStep(
  caseId: string,
  rawAnomalies: DetectedAnomaly[],
  allEvents: ConsolidatedEvent[],
): Promise<DetectedAnomaly[]> {
  if (rawAnomalies.length === 0) {
    logger.info('pipeline', ' Step 5.5: No anomalies to resolve, skipping');
    return [];
  }

  const supabase = createAdminClient();

  // Build OCR page fetcher using Supabase pages table
  const fetchOcrPages: OcrPageFetcher = async (requests) => {
    const result = new Map<string, string>();

    for (const req of requests) {
      const { data: pages } = await supabase
        .from('pages')
        .select('page_number, ocr_text')
        .eq('document_id', req.documentId)
        .in('page_number', req.pageNumbers);

      if (pages) {
        for (const page of pages) {
          const key = `${req.documentId}:${page.page_number}`;
          result.set(key, (page.ocr_text as string) ?? '');
        }
      }
    }

    return result;
  };

  const resolved = await resolveAnomalies(rawAnomalies, allEvents, fetchOcrPages);

  // Update anomaly rows in DB with resolution status
  for (const r of resolved) {
    if (!r.resolution) continue;

    // Find the corresponding anomaly row by matching type + description
    const { data: rows } = await supabase
      .from('anomalies')
      .select('id')
      .eq('case_id', caseId)
      .eq('anomaly_type', r.anomalyType)
      .eq('description', r.description)
      .limit(1);

    const anomalyRow = rows?.[0];
    if (!anomalyRow) continue;

    const status = r.resolution.resolved ? 'llm_resolved' : 'llm_confirmed';
    const resolutionNote = r.resolution.resolved
      ? `Risolta automaticamente (confidenza: ${Math.round(r.resolution.confidence * 100)}%). Evidenza: ${r.resolution.evidence}`
      : `Confermata dopo verifica OCR (confidenza: ${Math.round(r.resolution.confidence * 100)}%). ${r.resolution.reasoning}`;

    await supabase
      .from('anomalies')
      .update({
        status,
        resolution_note: resolutionNote,
        resolved_at: r.resolution.resolved ? new Date().toISOString() : null,
      })
      .eq('id', anomalyRow.id);
  }

  const unresolvedAnomalies = filterUnresolvedAnomalies(resolved);
  const resolvedCount = rawAnomalies.length - unresolvedAnomalies.length;

  logger.info('pipeline', ` Step 5.5: ${resolvedCount}/${rawAnomalies.length} anomalies resolved by LLM, ${unresolvedAnomalies.length} remain`);

  return unresolvedAnomalies;
}
