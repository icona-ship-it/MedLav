import { describe, it, expect } from 'vitest';
import { selectRepairableSections, buildRepairInstruction, AUTO_REPAIR_MAX_SECTIONS } from './auto-repair';
import type { ClaimVerificationFinding } from './claim-verify';

function finding(overrides: Partial<ClaimVerificationFinding> = {}): ClaimVerificationFinding {
  return {
    sectionId: 'epicrisi',
    sectionTitle: 'Epicrisi',
    claim: 'La prognosi iniziale era di 25 giorni.',
    verdict: 'non_supportato',
    motivo: 'La prognosi attestata è di 30 giorni clinici.',
    ...overrides,
  };
}

describe('selectRepairableSections — bersagli della revisione automatica', () => {
  it('raggruppa i non_supportato per sezione, ordinati per numero di errori', () => {
    const targets = selectRepairableSections([
      finding({ sectionId: 'anamnesi', sectionTitle: 'I Dati Anamnestici', claim: 'A' }),
      finding({ claim: 'B' }),
      finding({ claim: 'C' }),
    ]);
    expect(targets.map((t) => t.sectionId)).toEqual(['epicrisi', 'anamnesi']);
    expect(targets[0].findings).toHaveLength(2);
  });

  it('IGNORA le note (non_verificabile): si riparano solo gli errori', () => {
    expect(selectRepairableSections([finding({ verdict: 'non_verificabile' })])).toEqual([]);
  });

  it('NON ripara mai la documentazione_sanitaria (percorso verbatim dedicato)', () => {
    expect(selectRepairableSections([finding({ sectionId: 'documentazione_sanitaria' })])).toEqual([]);
  });

  it('cappa il numero di sezioni riparabili per run', () => {
    const many = Array.from({ length: 10 }, (_, i) => finding({ sectionId: `sez-${i}` }));
    expect(selectRepairableSections(many)).toHaveLength(AUTO_REPAIR_MAX_SECTIONS);
  });

  it('findings assenti o vuoti → nessun bersaglio', () => {
    expect(selectRepairableSections(undefined)).toEqual([]);
    expect(selectRepairableSections([])).toEqual([]);
  });
});

describe('buildRepairInstruction — istruzione di revisione', () => {
  it('elenca claim → motivo e ordina di correggere SOLO quei punti', () => {
    const instruction = buildRepairInstruction({
      sectionId: 'epicrisi',
      sectionTitle: 'Epicrisi',
      findings: [finding(), finding({ claim: 'La frattura era scomposta.', motivo: 'I referti attestano una frattura composta.' })],
    });
    expect(instruction).toContain('REVISIONE FINALE');
    expect(instruction).toContain('25 giorni');
    expect(instruction).toContain('30 giorni');
    expect(instruction).toContain('frattura composta');
    expect(instruction).toContain('SOLO questi punti');
    expect(instruction.length).toBeLessThanOrEqual(1800);
  });
});
