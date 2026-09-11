import { describe, it, expect } from 'vitest';
import { buildExtractionSystemPrompt, getDocumentTypeHint } from './extraction-prompts';

describe('extraction prompts — A1 clinical diary routine', () => {
  it('system prompt instructs to capture the whole clinical course, not only adverse events', () => {
    const prompt = buildExtractionSystemPrompt('ortopedica');
    expect(prompt).toContain('INTERO decorso clinico');
    expect(prompt).toContain('RAGGRUPPA');
    // Old restrictive phrasing must be gone.
    expect(prompt).not.toContain('Escludere solo annotazioni puramente logistiche (pasti, igiene personale, posizionamento)\n');
  });

  it('system prompt still excludes purely logistic annotations', () => {
    const prompt = buildExtractionSystemPrompt('ortopedica');
    expect(prompt.toLowerCase()).toContain('logistic');
    expect(prompt).toContain('pasti, igiene personale, posizionamento');
  });

  it('cartella_clinica hint captures the full course and groups stable days', () => {
    const hint = getDocumentTypeHint('cartella_clinica');
    expect(hint).toContain('TUTTO il decorso clinico');
    expect(hint).toContain('RAGGRUPPA');
    expect(hint).toContain('variazione rilevante');
    // No longer "SOLO complicanze".
    expect(hint).not.toMatch(/Diario medico:\s*SOLO complicanze/);
  });
});

describe('extraction prompts — esempi PS solo dall\'universo fittizio (security.md, bonifica 2026-09-11)', () => {
  it('le REGOLE PRONTO SOCCORSO usano struttura ed episodio fittizi e dichiarati tali', () => {
    const prompt = buildExtractionSystemPrompt('ortopedica');
    expect(prompt).toContain('Episodio n. 2026000123');
    expect(prompt).toContain('Pronto Soccorso Pediatrico, Ospedale Civile di Cittàdemo');
    expect(prompt).toMatch(/es\. \(FITTIZIO\) "Episodio/);
  });
});
