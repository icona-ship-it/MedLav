import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateSynthesis,
  generateSynthesisChronology,
  generateSynthesisSummary,
  shouldSplitSynthesis,
} from '@/services/synthesis/synthesis-service';
import type { SynthesisParams } from '@/services/synthesis/synthesis-service';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { DetectedAnomaly } from '@/services/validation/anomaly-detector';
import type { MissingDocument } from '@/services/validation/missing-doc-detector';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';
import type { CaseMetadata, SynthesisStepResult } from './types';
import { logger } from '@/lib/logger';

/**
 * Step 7a: Calculate medico-legal periods (instant, no API call).
 */
export function calculatePeriodsStep(
  allEvents: ConsolidatedEvent[],
  caseType: CaseMetadata['caseType'],
): MedicoLegalCalculation[] {
  const calcEvents = allEvents.map((e) => ({
    event_date: e.eventDate,
    event_type: e.eventType,
    title: e.title,
    description: e.description,
  }));
  return calculateMedicoLegalPeriods(calcEvents, caseType);
}

/**
 * Build shared SynthesisParams from pipeline state.
 */
export function buildSynthesisParams(
  metadata: CaseMetadata,
  allEvents: ConsolidatedEvent[],
  anomalies: DetectedAnomaly[],
  missingDocs: MissingDocument[],
  calculations: MedicoLegalCalculation[],
  imageAnalysisResults: ImageAnalysisResult[],
): SynthesisParams {
  return {
    caseType: metadata.caseType,
    caseTypes: metadata.caseTypes.length > 1 ? metadata.caseTypes : undefined,
    caseRole: metadata.caseRole,
    patientInitials: metadata.patientInitials,
    events: allEvents,
    anomalies,
    missingDocuments: missingDocs,
    calculations,
    periziaMetadata: metadata.periziaMetadata,
    imageAnalysis: imageAnalysisResults.length > 0 ? imageAnalysisResults : undefined,
  };
}

/**
 * Step 7b: Check if split mode is needed (instant).
 */
export function checkSynthesisSplit(
  synthesisParams: SynthesisParams,
  eventCount: number,
): boolean {
  const split = shouldSplitSynthesis(synthesisParams);
  logger.info('pipeline', ` Step 7: ${eventCount} events, split: ${split}`);
  return split;
}

/**
 * Step 7c: Generate full synthesis in a single Mistral call (small case).
 */
export async function generateFullSynthesis(
  synthesisParams: SynthesisParams,
): Promise<{ synthesis: string; wordCount: number; promptVersion: string }> {
  const startMs = Date.now();
  const r = await generateSynthesis(synthesisParams);
  logger.info('pipeline', ` Synthesis done in ${Date.now() - startMs}ms (${r.wordCount} words)`);
  return r;
}

/**
 * Step 7d: Generate chronology part (large case, split mode).
 */
export async function generateChronologyPart(
  synthesisParams: SynthesisParams,
): Promise<string> {
  const startMs = Date.now();
  const c = await generateSynthesisChronology(synthesisParams);
  logger.info('pipeline', ` Chronology done in ${Date.now() - startMs}ms (${c.length} chars)`);
  return c;
}

/**
 * Step 7e: Generate summary part (large case, split mode).
 */
export async function generateSummaryPart(
  synthesisParams: SynthesisParams,
  chronology: string,
): Promise<{ synthesis: string; wordCount: number; promptVersion: string }> {
  const startMs = Date.now();
  const r = await generateSynthesisSummary({ ...synthesisParams, chronology });
  logger.info('pipeline', ` Summary done in ${Date.now() - startMs}ms (${r.wordCount} words)`);
  return r;
}

/**
 * Step 7f: Save report to DB (fast, no API call).
 */
export async function saveReportStep(
  caseId: string,
  synthesisText: string,
  synthesisWordCount: number,
  promptVersion?: string,
): Promise<SynthesisStepResult> {
  const supabase = createAdminClient();

  const { data: latestReport } = await supabase
    .from('reports')
    .select('version')
    .eq('case_id', caseId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const newVersion = ((latestReport?.version as number | null) ?? 0) + 1;

  const { data: report } = await supabase
    .from('reports')
    .insert({
      case_id: caseId,
      version: newVersion,
      report_status: 'bozza',
      synthesis: synthesisText,
      ...(promptVersion ? { generation_metadata: { promptVersion } } : {}),
    })
    .select('id')
    .single();

  return { reportId: report?.id, reportVersion: newVersion, wordCount: synthesisWordCount };
}
