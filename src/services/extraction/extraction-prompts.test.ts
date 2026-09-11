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

describe('spese_mediche hint — una voce per documento fiscale, importo lordo (direttiva perito 2026-08-19; audit 2026-09-10 R8)', () => {
  it('should ask for ONE event per fiscal document with the gross total and forbid separate IVA/bollo events', () => {
    const hint = getDocumentTypeHint('spese_mediche');
    expect(hint).toContain('UNA SOLA VOCE PER DOCUMENTO FISCALE');
    expect(hint).toContain('COMPRENSIVO di IVA');
    expect(hint).toContain('MAI creare eventi separati per IVA, bollo');
    expect(hint).not.toContain('crea un evento per voce');
    expect(hint).not.toContain('Crea un evento "spesa_medica" SEPARATO per il bollo');
  });

  it('should keep the date cascade (never drop an expense for a missing date)', () => {
    const hint = getDocumentTypeHint('spese_mediche');
    expect(hint).toContain('NON SCARTARE MAI una voce di spesa per assenza di data');
    expect(hint).toContain('datePrecision="sconosciuta"');
  });
});
