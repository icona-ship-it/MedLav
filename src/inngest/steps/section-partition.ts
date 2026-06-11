import type { SectionSpec } from '@/services/synthesis/section-generation-types';

/**
 * Partitioning of the section plan into a parallel wave and a sequential tail.
 *
 * Almost no section depends on another: the only cross-section dependency is
 * the rolling context, and section-generator injects it into the prompt ONLY
 * when the spec declares the 'context-summaries' data source (pareri sections
 * + stragiudiziale epicrisi — zero CTU/CTP sections). Everything else can run
 * concurrently with previousContext = [] producing byte-identical prompts.
 *
 * documentazione_sanitaria in AI mode is excluded from the wave because the
 * pipeline splits it into its own per-batch Inngest steps (sequential path).
 */

/** Max gen-section steps launched concurrently per wave. Each step makes ~1
 * Mistral call from its own invocation (the semaphore is per-process, so it
 * does NOT cap across steps): 4 keeps aggregate API pressure at the level the
 * summarize-batch steps already exercise in production today. */
export const PARALLEL_SECTIONS_PER_WAVE = 4;

export interface PlannedSection {
  spec: SectionSpec;
  planIndex: number;
}

/** True when this spec takes the dedicated per-batch doc-sanitaria path
 * (AI variant on >batchSize docs) instead of a single gen-section step. */
export function isDocSanitariaBatchPath(
  spec: SectionSpec,
  docCount: number,
  batchSize: number,
): boolean {
  return spec.id === 'documentazione_sanitaria'
    && !spec.isPlaceholder
    && spec.needsOcr
    && docCount > batchSize;
}

/** True when the section's prompt consumes the rolling context of previously
 * generated sections — it must run AFTER the sections it summarizes. */
export function consumesRollingContext(spec: SectionSpec): boolean {
  return spec.dataSources.includes('context-summaries');
}

/**
 * Split the resolved plan: `parallel` = context-independent single-step
 * sections (run concurrently in waves); `sequential` = rolling-context
 * consumers + the doc-sanitaria batch path, in plan order.
 */
export function partitionSectionPlan(
  plan: readonly SectionSpec[],
  docCount: number,
  batchSize: number,
): { parallel: PlannedSection[]; sequential: PlannedSection[] } {
  const parallel: PlannedSection[] = [];
  const sequential: PlannedSection[] = [];
  plan.forEach((spec, planIndex) => {
    if (consumesRollingContext(spec) || isDocSanitariaBatchPath(spec, docCount, batchSize)) {
      sequential.push({ spec, planIndex });
    } else {
      parallel.push({ spec, planIndex });
    }
  });
  return { parallel, sequential };
}
