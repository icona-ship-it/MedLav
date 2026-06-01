import { describe, it, expect } from 'vitest';
import { computeBMI, renderAnamnesiMarkdown } from './anamnesi-template';
import type { PeriziaMetadata } from '@/types';

describe('computeBMI', () => {
  it('should compute BMI and normopeso category for known values', () => {
    // 70 kg, 175 cm → 70 / 1.75² = 22.857… → 22.9
    const result = computeBMI(70, 175);
    expect(result).toEqual({ value: 22.9, category: 'normopeso' });
  });

  it('should classify sottopeso below 18.5', () => {
    // 45 kg, 170 cm → 15.57
    expect(computeBMI(45, 170)?.category).toBe('sottopeso');
  });

  it('should classify sovrappeso between 25 and 30', () => {
    // 80 kg, 175 cm → 26.1
    expect(computeBMI(80, 175)?.category).toBe('sovrappeso');
  });

  it('should classify obesità di I/II/III grado at boundaries', () => {
    expect(computeBMI(100, 175)?.category).toBe('obesità di I grado'); // 32.7
    expect(computeBMI(115, 175)?.category).toBe('obesità di II grado'); // 37.6
    expect(computeBMI(130, 175)?.category).toBe('obesità di III grado'); // 42.4
  });

  it('should return null when peso missing', () => {
    expect(computeBMI(undefined, 175)).toBeNull();
  });

  it('should return null when altezza missing', () => {
    expect(computeBMI(70, undefined)).toBeNull();
  });

  it('should return null for zero or negative height (avoid division blow-up)', () => {
    expect(computeBMI(70, 0)).toBeNull();
    expect(computeBMI(70, -10)).toBeNull();
  });

  it('should return null for non-finite inputs', () => {
    expect(computeBMI(NaN, 175)).toBeNull();
    expect(computeBMI(70, Infinity)).toBeNull();
  });
});

describe('renderAnamnesiMarkdown', () => {
  it('should return empty string when no anamnesi data provided', () => {
    expect(renderAnamnesiMarkdown({})).toBe('');
  });

  it('should render only the filled subsections', () => {
    const pm: PeriziaMetadata = {
      anamnesiFamiliare: 'Nulla di rilevante.',
      anamnesiFarmacologica: 'Terapia antipertensiva.',
    };
    const md = renderAnamnesiMarkdown(pm);
    expect(md).toContain('**Anamnesi familiare**');
    expect(md).toContain('Nulla di rilevante.');
    expect(md).toContain('**Anamnesi farmacologica**');
    expect(md).toContain('Terapia antipertensiva.');
    // Subsections not provided must be absent
    expect(md).not.toContain('**Anamnesi patologica remota**');
    expect(md).not.toContain('**Anamnesi lavorativa**');
  });

  it('should ignore whitespace-only fields', () => {
    const pm: PeriziaMetadata = { anamnesiFamiliare: '   \n  ' };
    expect(renderAnamnesiMarkdown(pm)).toBe('');
  });

  it('should include anthropometric line with BMI inside anamnesi fisiologica', () => {
    const pm: PeriziaMetadata = {
      anamnesiFisiologica: 'Alvo e diuresi regolari.',
      pesoKg: 70,
      altezzaCm: 175,
    };
    const md = renderAnamnesiMarkdown(pm);
    expect(md).toContain('**Anamnesi fisiologica**');
    expect(md).toContain('Alvo e diuresi regolari.');
    expect(md).toContain('Peso 70 kg');
    expect(md).toContain('Altezza 175 cm');
    expect(md).toContain('BMI 22,9 (normopeso)');
  });

  it('should render the fisiologica subsection from anthropometrics alone', () => {
    const pm: PeriziaMetadata = { pesoKg: 80, altezzaCm: 175 };
    const md = renderAnamnesiMarkdown(pm);
    expect(md).toContain('**Anamnesi fisiologica**');
    expect(md).toContain('Peso 80 kg');
    expect(md).toContain('BMI 26,1 (sovrappeso)');
  });

  it('should omit BMI when only peso is present', () => {
    const pm: PeriziaMetadata = { pesoKg: 80 };
    const md = renderAnamnesiMarkdown(pm);
    expect(md).toContain('Peso 80 kg');
    expect(md).not.toContain('BMI');
  });

  it('should keep subsections ordered familiare → fisiologica → remota → prossima → farmacologica → lavorativa', () => {
    const pm: PeriziaMetadata = {
      anamnesiLavorativa: 'Operaio edile.',
      anamnesiFamiliare: 'Negativa.',
      anamnesiPatologicaProssima: 'Trauma del ginocchio dx.',
    };
    const md = renderAnamnesiMarkdown(pm);
    const idxFam = md.indexOf('Anamnesi familiare');
    const idxProx = md.indexOf('Anamnesi patologica prossima');
    const idxLav = md.indexOf('Anamnesi lavorativa');
    expect(idxFam).toBeGreaterThanOrEqual(0);
    expect(idxFam).toBeLessThan(idxProx);
    expect(idxProx).toBeLessThan(idxLav);
  });
});
