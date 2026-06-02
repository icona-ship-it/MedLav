import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the generation pipeline so we can assert the regenerator DELEGATES to it
// with the canonical catalog spec (the parity guarantee of the HIGH fix).
vi.mock('./section-generator', () => ({
  generateSingleSection: vi.fn(),
  summarizeForContext: (c: string, n: number) => c.slice(0, n),
}));

import { generateSingleSection } from './section-generator';
import { getSectionSpecById } from './section-catalog';
import { regenerateSection } from './section-regenerator';
import type { CaseType, CaseRole } from '@/types';

const mockGenerate = vi.mocked(generateSingleSection);

// Use an LLM-generated (non-placeholder) section for the delegation tests;
// documentazione_sanitaria is now a deterministic placeholder.
function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    sectionId: 'documentazione_atti',
    currentSynthesis: '## I Dati della Documentazione in Atti\nVecchio contenuto.\n\n## Epicrisi\nAltro.\n',
    caseType: 'ortopedica' as CaseType,
    caseRole: 'ctu' as CaseRole,
    events: [],
    anomalies: [],
    missingDocuments: [],
    ...overrides,
  };
}

describe('getSectionSpecById', () => {
  it('resolves the canonical CTU spec with a non-empty promptDirective', () => {
    const spec = getSectionSpecById('documentazione_sanitaria', 'ctu');
    expect(spec).toBeDefined();
    expect(spec?.id).toBe('documentazione_sanitaria');
    expect((spec?.promptDirective ?? '').length).toBeGreaterThan(0);
  });

  it('resolves the PENALE valuation spec when ambitoPenale is set', () => {
    const penale = getSectionSpecById('considerazioni_penale', 'ctu', undefined, { ambitoPenale: true });
    expect(penale).toBeDefined();
    expect(penale?.id).toBe('considerazioni_penale');
  });

  it('returns undefined for an unknown section id', () => {
    expect(getSectionSpecById('sezione_inesistente', 'ctu')).toBeUndefined();
  });
});

describe('regenerateSection — parity with generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerate.mockResolvedValue({
      id: 'documentazione_atti',
      title: 'I Dati della Documentazione in Atti',
      content: 'NUOVO CONTENUTO RIGENERATO',
      contextSummary: '',
      wordCount: 3,
    });
  });

  it('delegates to generateSingleSection using the CANONICAL catalog spec', async () => {
    const result = await regenerateSection(baseParams());

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const arg = mockGenerate.mock.calls[0][0];
    // The spec must come from the catalog (carries the load-bearing promptDirective),
    // NOT a weak ad-hoc prompt.
    expect(arg.spec.id).toBe('documentazione_atti');
    expect(arg.spec.promptDirective.length).toBeGreaterThan(0);
    expect(result).toContain('NUOVO CONTENUTO RIGENERATO');
  });

  it('injects the perito instruction into the section directive (keeping the catalog defenses)', async () => {
    await regenerateSection(baseParams({ userInstruction: 'Aggiungi i valori di laboratorio.' }));

    const arg = mockGenerate.mock.calls[0][0];
    expect(arg.spec.promptDirective).toContain('Aggiungi i valori di laboratorio.');
    expect(arg.spec.promptDirective).toContain('ISTRUZIONE SPECIFICA DEL PERITO');
  });

  it('passes the other sections as rolling context (excluding the target)', async () => {
    await regenerateSection(baseParams());
    const arg = mockGenerate.mock.calls[0][0];
    const ctxIds = arg.previousContext.map((c) => c.id);
    expect(ctxIds).not.toContain('documentazione_atti');
    expect(ctxIds).toContain('epicrisi');
  });

  it('throws on an unknown section id rather than using a weak fallback prompt', async () => {
    await expect(regenerateSection(baseParams({ sectionId: 'inesistente' }))).rejects.toThrow();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('NEVER sends a PLACEHOLDER section (medico-legal valuation) to the LLM', async () => {
    // considerazioni_ml is isPlaceholder: the AI must not author the valuation —
    // it stays a deterministic placeholder for the perito (VINCOLO oggettività).
    const result = await regenerateSection(baseParams({
      sectionId: 'considerazioni_ml',
      currentSynthesis: '## Considerazioni Medico-Legali\nDa compilare.\n\n## Epicrisi\nAltro.\n',
    }));

    expect(mockGenerate).not.toHaveBeenCalled();
    // Re-emits the deterministic placeholder text, not LLM prose.
    expect(result).toContain('Inserire qui le considerazioni medico-legali');
  });
});
