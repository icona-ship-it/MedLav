import { describe, it, expect } from 'vitest';
import { getQuestiTemplates, getCaseTypeKnowledge, getCombinedCaseTypeKnowledge } from './index';
import type { CaseType } from '@/types';

const ALL_CASE_TYPES: CaseType[] = [
  'ortopedica', 'oncologica', 'ostetrica', 'anestesiologica',
  'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto',
  'previdenziale', 'infortuni', 'perizia_assicurativa',
  'analisi_spese_mediche', 'opinione_prognostica', 'generica',
];

describe('getQuestiTemplates', () => {
  it.each(ALL_CASE_TYPES)('should return non-empty quesiti for %s', (caseType) => {
    const templates = getQuestiTemplates(caseType);
    expect(templates.length).toBeGreaterThanOrEqual(3);
    for (const q of templates) {
      expect(q.trim().length).toBeGreaterThan(20);
    }
  });

  it('should return readonly array', () => {
    const templates = getQuestiTemplates('ortopedica');
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBe(5);
  });
});

describe('CaseTypeKnowledge.commonQuesiti', () => {
  it.each(ALL_CASE_TYPES)('should have commonQuesiti in knowledge for %s', (caseType) => {
    const knowledge = getCaseTypeKnowledge(caseType);
    expect(knowledge.commonQuesiti).toBeDefined();
    expect(knowledge.commonQuesiti.length).toBeGreaterThanOrEqual(3);
  });
});

describe('getCombinedCaseTypeKnowledge with quesiti', () => {
  it('should merge quesiti from multiple case types', () => {
    const combined = getCombinedCaseTypeKnowledge(['ortopedica', 'infezione_nosocomiale']);
    expect(combined.commonQuesiti.length).toBeGreaterThan(0);
    // Should include quesiti from both types (deduplicated)
    const ortopedicaQuesiti = getQuestiTemplates('ortopedica');
    const infezioneQuesiti = getQuestiTemplates('infezione_nosocomiale');
    for (const q of ortopedicaQuesiti) {
      expect(combined.commonQuesiti).toContain(q);
    }
    for (const q of infezioneQuesiti) {
      expect(combined.commonQuesiti).toContain(q);
    }
  });
});
