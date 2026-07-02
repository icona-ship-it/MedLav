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
    sectionId: 'il_fatto_e_storia_clinica',
    currentSynthesis: '## Il Fatto e la Storia Clinica\nVecchio contenuto.\n\n## Epicrisi\nAltro.\n',
    caseType: 'ortopedica' as CaseType,
    caseRole: 'stragiudiziale' as CaseRole,
    events: [],
    anomalies: [],
    missingDocuments: [],
    ...overrides,
  };
}

describe('getSectionSpecById', () => {
  it('resolves the canonical stragiudiziale spec with a non-empty promptDirective', () => {
    const spec = getSectionSpecById('documentazione_sanitaria');
    expect(spec).toBeDefined();
    expect(spec?.id).toBe('documentazione_sanitaria');
    expect((spec?.promptDirective ?? '').length).toBeGreaterThan(0);
  });

  it('returns undefined for an unknown section id', () => {
    expect(getSectionSpecById('sezione_inesistente')).toBeUndefined();
  });
});

describe('regenerateSection — parity with generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerate.mockResolvedValue({
      id: 'il_fatto_e_storia_clinica',
      title: 'Il Fatto e la Storia Clinica',
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
    expect(arg.spec.id).toBe('il_fatto_e_storia_clinica');
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
    expect(ctxIds).not.toContain('il_fatto_e_storia_clinica');
    expect(ctxIds).toContain('epicrisi');
  });

  it('throws on an unknown section id rather than using a weak fallback prompt', async () => {
    await expect(regenerateSection(baseParams({ sectionId: 'inesistente' }))).rejects.toThrow();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('strips hallucinated ocr-image refs but keeps the real ones (HARD FILTER parity)', async () => {
    const real = 'ocr-images/doc-a/p3-f0.png';
    mockGenerate.mockResolvedValueOnce({
      id: 'il_fatto_e_storia_clinica',
      title: 'Il Fatto e la Storia Clinica',
      content: `Testo.\n\n![Fig. 1](ocr-image:${real})\n\n![Fig. 2](ocr-image:ocr-images/fake/p9-f0.png)`,
      contextSummary: '',
      wordCount: 3,
    });
    const result = await regenerateSection(baseParams({
      imageAnalysis: [
        { pageNumber: 3, imageType: 'radiografia', description: 'd', confidence: 0.9, storagePath: real, documentId: 'doc-a' },
      ],
    }));
    expect(result).toContain(`ocr-image:${real}`);
    expect(result).not.toContain('fake/p9-f0.png');
  });

  it('NEVER sends a PLACEHOLDER section (deterministic table) to the LLM', async () => {
    // spese_mediche is isPlaceholder: the table is rendered deterministically from
    // the expense events — the AI must not author it (VINCOLO oggettività).
    const result = await regenerateSection(baseParams({
      sectionId: 'spese_mediche',
      currentSynthesis: '## Spese Mediche\nDa compilare.\n\n## Epicrisi\nAltro.\n',
    }));

    expect(mockGenerate).not.toHaveBeenCalled();
    // Re-emits the deterministic placeholder text, not LLM prose.
    expect(result).toContain('Le spese mediche documentate sono riepilogate nella tabella seguente');
  });
});
