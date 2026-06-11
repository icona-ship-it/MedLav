import { describe, it, expect } from 'vitest';
import {
  partitionSectionPlan,
  isDocSanitariaBatchPath,
  consumesRollingContext,
  PARALLEL_SECTIONS_PER_WAVE,
} from './section-partition';
import type { SectionSpec, SectionDataSource } from '@/services/synthesis/section-generation-types';

function makeSpec(overrides: Partial<SectionSpec> & { id: string }): SectionSpec {
  return {
    title: overrides.id,
    promptDirective: 'test directive',
    maxTokens: 4000,
    dataSources: [] as SectionDataSource[],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: false,
    ...overrides,
  } as SectionSpec;
}

describe('section-partition', () => {
  describe('consumesRollingContext', () => {
    it('should be true only when dataSources include context-summaries', () => {
      expect(consumesRollingContext(makeSpec({ id: 'epicrisi', dataSources: ['context-summaries', 'calculations'] }))).toBe(true);
      expect(consumesRollingContext(makeSpec({ id: 'quesiti', dataSources: ['perizia-metadata'] }))).toBe(false);
      expect(consumesRollingContext(makeSpec({ id: 'intestazione', dataSources: [] }))).toBe(false);
    });
  });

  describe('isDocSanitariaBatchPath', () => {
    it('should match only the AI variant on more docs than the batch size', () => {
      const aiVariant = makeSpec({ id: 'documentazione_sanitaria', needsOcr: true, isPlaceholder: false });
      expect(isDocSanitariaBatchPath(aiVariant, 10, 4)).toBe(true);
      // Few docs → single-step path, no batching
      expect(isDocSanitariaBatchPath(aiVariant, 3, 4)).toBe(false);
      // Deterministic default (verbatim sentinel): needsOcr false → never batched
      const deterministic = makeSpec({ id: 'documentazione_sanitaria', needsOcr: false });
      expect(isDocSanitariaBatchPath(deterministic, 10, 4)).toBe(false);
      // Other sections never take the batch path
      expect(isDocSanitariaBatchPath(makeSpec({ id: 'quesiti', needsOcr: true }), 10, 4)).toBe(false);
    });
  });

  describe('partitionSectionPlan', () => {
    it('should put a CTU-like plan entirely in the parallel wave (no CTU section consumes rolling context)', () => {
      const plan = [
        makeSpec({ id: 'intestazione' }),
        makeSpec({ id: 'quesiti', dataSources: ['perizia-metadata'] }),
        makeSpec({ id: 'documentazione_sanitaria' }), // deterministic default
        makeSpec({ id: 'operazioni_peritali', isPlaceholder: true }),
        makeSpec({ id: 'considerazioni_ml', isPlaceholder: true }),
      ];
      const { parallel, sequential } = partitionSectionPlan(plan, 12, 4);
      expect(parallel.map((p) => p.spec.id)).toEqual([
        'intestazione', 'quesiti', 'documentazione_sanitaria', 'operazioni_peritali', 'considerazioni_ml',
      ]);
      expect(sequential).toEqual([]);
    });

    it('should route rolling-context consumers to the sequential tail in plan order', () => {
      const plan = [
        makeSpec({ id: 'intestazione' }),
        makeSpec({ id: 'sintesi', dataSources: ['events-medical', 'context-summaries'] }),
        makeSpec({ id: 'spese', dataSources: ['events-expenses'] }),
        makeSpec({ id: 'epicrisi', dataSources: ['context-summaries', 'calculations'] }),
      ];
      const { parallel, sequential } = partitionSectionPlan(plan, 5, 4);
      expect(parallel.map((p) => p.spec.id)).toEqual(['intestazione', 'spese']);
      expect(sequential.map((p) => p.spec.id)).toEqual(['sintesi', 'epicrisi']);
      // planIndex preserved for previousContext slicing
      expect(sequential.map((p) => p.planIndex)).toEqual([1, 3]);
    });

    it('should route the doc-sanitaria AI batch path to the sequential tail', () => {
      const plan = [
        makeSpec({ id: 'intestazione' }),
        makeSpec({ id: 'documentazione_sanitaria', needsOcr: true }),
      ];
      const { parallel, sequential } = partitionSectionPlan(plan, 10, 4);
      expect(parallel.map((p) => p.spec.id)).toEqual(['intestazione']);
      expect(sequential.map((p) => p.spec.id)).toEqual(['documentazione_sanitaria']);
    });

    it('should keep the doc-sanitaria AI variant parallel when docs fit a single step', () => {
      const plan = [makeSpec({ id: 'documentazione_sanitaria', needsOcr: true })];
      const { parallel, sequential } = partitionSectionPlan(plan, 3, 4);
      expect(parallel).toHaveLength(1);
      expect(sequential).toHaveLength(0);
    });

    it('should preserve plan order inside each partition (assembly relies on it)', () => {
      const plan = [
        makeSpec({ id: 'a' }),
        makeSpec({ id: 'b', dataSources: ['context-summaries'] }),
        makeSpec({ id: 'c' }),
        makeSpec({ id: 'd', dataSources: ['context-summaries'] }),
        makeSpec({ id: 'e' }),
      ];
      const { parallel, sequential } = partitionSectionPlan(plan, 1, 4);
      expect(parallel.map((p) => p.planIndex)).toEqual([0, 2, 4]);
      expect(sequential.map((p) => p.planIndex)).toEqual([1, 3]);
    });

    it('wave size constant should stay within the production-proven concurrency envelope', () => {
      // summarize-batch already runs 5 concurrent steps in prod; sections must not exceed that
      expect(PARALLEL_SECTIONS_PER_WAVE).toBeGreaterThanOrEqual(2);
      expect(PARALLEL_SECTIONS_PER_WAVE).toBeLessThanOrEqual(5);
    });
  });
});
