import { describe, it, expect } from 'vitest';
import { computeSectionalPromptVersion } from './prompt-version-sectional';
import { resolveSectionPlan } from '@/services/synthesis/section-catalog';
import type { SectionSpec } from '@/services/synthesis/section-generation-types';
import type { CaseType, CaseRole } from '@/types';

function llmSpec(overrides: Partial<SectionSpec> = {}): SectionSpec {
  return {
    id: 'documentazione_atti',
    title: 'I Dati della Documentazione in Atti',
    maxTokens: 6000,
    dataSources: ['events-non-medical'],
    contextMaxChars: 600,
    needsOcr: true,
    promptDirective: 'Riproduci gli atti in ordine cronologico con citazioni fedeli.',
    ...overrides,
  };
}

function placeholderSpec(overrides: Partial<SectionSpec> = {}): SectionSpec {
  return {
    id: 'considerazioni_ml',
    title: 'Considerazioni Medico-Legali',
    maxTokens: 0,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: '*[Inserire qui le considerazioni medico-legali.]*',
    promptDirective: '',
    ...overrides,
  };
}

const base = {
  caseType: 'ortopedica' as CaseType,
  caseRole: 'ctu' as CaseRole,
};

describe('computeSectionalPromptVersion — hashes the REAL prompts (Sprint 2.3)', () => {
  it('should return a stable 12-char hex hash for identical inputs', () => {
    const a = computeSectionalPromptVersion({ ...base, sections: [llmSpec(), placeholderSpec()] });
    const b = computeSectionalPromptVersion({ ...base, sections: [llmSpec(), placeholderSpec()] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it('should change when a section promptDirective changes', () => {
    const before = computeSectionalPromptVersion({ ...base, sections: [llmSpec()] });
    const after = computeSectionalPromptVersion({
      ...base,
      sections: [llmSpec({ promptDirective: 'Direttiva MODIFICATA: nuova regola di citazione.' })],
    });
    expect(after).not.toBe(before);
  });

  it('should change when a placeholder placeholderText changes', () => {
    const before = computeSectionalPromptVersion({ ...base, sections: [placeholderSpec()] });
    const after = computeSectionalPromptVersion({
      ...base,
      sections: [placeholderSpec({ placeholderText: '*[Scheletro placeholder AGGIORNATO.]*' })],
    });
    expect(after).not.toBe(before);
  });

  it('should change when the dormant promptDirective of a placeholder changes (AI-on-demand variants)', () => {
    const before = computeSectionalPromptVersion({ ...base, sections: [placeholderSpec()] });
    const after = computeSectionalPromptVersion({
      ...base,
      sections: [placeholderSpec({ promptDirective: 'Direttiva dormiente cambiata.' })],
    });
    expect(after).not.toBe(before);
  });

  it('should change when the case role changes (role directive is part of the prompt)', () => {
    const ctu = computeSectionalPromptVersion({ ...base, caseRole: 'ctu', sections: [llmSpec()] });
    const ctp = computeSectionalPromptVersion({ ...base, caseRole: 'ctp', sections: [llmSpec()] });
    expect(ctu).not.toBe(ctp);
  });

  it('should change when the section set changes', () => {
    const one = computeSectionalPromptVersion({ ...base, sections: [llmSpec()] });
    const two = computeSectionalPromptVersion({ ...base, sections: [llmSpec(), placeholderSpec()] });
    expect(one).not.toBe(two);
  });

  it('real catalog: a mutated directive in the resolved CTU plan changes the hash', () => {
    const plan = resolveSectionPlan({
      caseType: 'ortopedica',
      caseRole: 'ctu',
      events: [],
      documentTypes: ['cartella_clinica'],
    });
    expect(plan.length).toBeGreaterThan(0);

    const original = computeSectionalPromptVersion({ ...base, sections: plan });

    // Simulate prompt drift: one directive changes in section-catalog.
    const target = plan.find((s) => !s.isPlaceholder && !s.id.startsWith('intestazione'));
    expect(target).toBeDefined();
    const mutatedPlan = plan.map((s) =>
      s.id === target!.id ? { ...s, promptDirective: `${s.promptDirective}\nNUOVA REGOLA.` } : s,
    );
    const mutated = computeSectionalPromptVersion({ ...base, sections: mutatedPlan });

    expect(mutated).not.toBe(original);
    expect(original).toMatch(/^[0-9a-f]{12}$/);
  });
});
