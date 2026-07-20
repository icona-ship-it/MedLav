import { describe, it, expect } from 'vitest';
import { ESAME_OBIETTIVO_FACSIMILE, VISITA_CLINICA_PLACEHOLDER } from './visita-template';
import { isPlaceholderBlockStart } from '@/services/export/markdown-to-html';

describe('visita-template — facsimile esame obiettivo (feedback beta 2026-07-20)', () => {
  it('il facsimile contiene la traccia SOGGETTIVAMENTE/OBIETTIVAMENTE con perimetria, ROM e deambulazione', () => {
    expect(ESAME_OBIETTIVO_FACSIMILE).toContain('SOGGETTIVAMENTE');
    expect(ESAME_OBIETTIVO_FACSIMILE).toContain('OBIETTIVAMENTE');
    expect(ESAME_OBIETTIVO_FACSIMILE).toContain('Perimetria comparata');
    expect(ESAME_OBIETTIVO_FACSIMILE).toContain('ROM');
    expect(ESAME_OBIETTIVO_FACSIMILE).toContain('Deambulazione');
    expect(ESAME_OBIETTIVO_FACSIMILE).toContain('Si tralascia l\'obiettività');
  });

  it('è una traccia generica: solo slot [tra parentesi], nessun valore clinico precompilato', () => {
    // Nessun numero "vero" fuori dagli slot (peso/altezza/gradi restano [...])
    expect(ESAME_OBIETTIVO_FACSIMILE).not.toMatch(/\d{2,} ?(kg|cm|°)/);
  });

  it('la variante placeholder apre con *[ ed è riconosciuta come blocco da compilare', () => {
    const firstLine = VISITA_CLINICA_PLACEHOLDER.split('\n')[0];
    expect(isPlaceholderBlockStart(firstLine)).toBe(true);
  });

  it('la variante placeholder resta sotto le 40 righe (limite del parser del blocco placeholder)', () => {
    expect(VISITA_CLINICA_PLACEHOLDER.split('\n').length).toBeLessThan(40);
  });

  it('ogni riga non vuota della variante placeholder è in corsivo (formato blocco placeholder)', () => {
    for (const line of VISITA_CLINICA_PLACEHOLDER.split('\n')) {
      if (line === '') continue;
      expect(line.startsWith('*')).toBe(true);
      expect(line.endsWith('*')).toBe(true);
    }
  });
});
