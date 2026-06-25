import { describe, it, expect } from 'vitest';
import { getSectionSpecById } from './section-catalog';
import type { PeriziaMetadata } from '@/types';

/**
 * Perizia RC: "Il Fatto e la Storia Clinica" e "I Dati Anamnestici" sono sezioni
 * che il perito scrive (nord di prodotto: l'AI non reinterpreta ciò che scrive il
 * perito). Bug trovato sul caso reale Motta: quando il perito NON compila i campi,
 * scattava un FALLBACK LLM che generava narrazione fuori-stile (tassonomia
 * artificiale + citazioni per tipo-documento [A/B/C/D] assenti dal gold Lavini).
 * Fix: a campi vuoti → placeholder PULITO per il perito, mai generazione LLM.
 */
const RC = 'perizia_ml_rc_civile';

describe('applyRcPeritoSections (via getSectionSpecById) — sezioni perito RC', () => {
  it('usa il TESTO del perito come placeholder quando "Il Fatto" è compilato', () => {
    const meta = { ilFattoEStoriaClinica: 'In data 10.03.2024 la paziente cadeva...' } as PeriziaMetadata;
    const spec = getSectionSpecById('il_fatto_e_storia_clinica', 'stragiudiziale', RC, meta);
    expect(spec?.isPlaceholder).toBe(true);
    expect(spec?.placeholderText).toContain('In data 10.03.2024');
    expect(spec?.maxTokens).toBe(0);
  });

  it('REGRESSIONE: "Il Fatto" VUOTO → placeholder, MAI generazione LLM', () => {
    const meta = { patientFullName: 'Mario Esempi' } as PeriziaMetadata;
    const spec = getSectionSpecById('il_fatto_e_storia_clinica', 'stragiudiziale', RC, meta);
    expect(spec?.isPlaceholder).toBe(true); // <-- col bug era false (LLM)
    expect(spec?.maxTokens).toBe(0);
    expect(spec?.placeholderText).toMatch(/perito/i);
  });

  it('REGRESSIONE: "Dati Anamnestici" VUOTI → placeholder, MAI generazione LLM', () => {
    const meta = { patientFullName: 'Mario Esempi' } as PeriziaMetadata;
    const spec = getSectionSpecById('anamnesi', 'stragiudiziale', RC, meta);
    expect(spec?.isPlaceholder).toBe(true);
    expect(spec?.maxTokens).toBe(0);
    expect(spec?.placeholderText).toMatch(/perito/i);
  });

  it('senza alcun metadato → comunque placeholder per RC (no LLM hallucination)', () => {
    const spec = getSectionSpecById('il_fatto_e_storia_clinica', 'stragiudiziale', RC, undefined);
    expect(spec?.isPlaceholder).toBe(true);
  });

  it('il placeholder vuoto NON deve contenere tag di citazione per-documento [A/B...]', () => {
    const meta = { patientFullName: 'Mario Esempi' } as PeriziaMetadata;
    const il = getSectionSpecById('il_fatto_e_storia_clinica', 'stragiudiziale', RC, meta);
    const an = getSectionSpecById('anamnesi', 'stragiudiziale', RC, meta);
    expect(il?.placeholderText).not.toMatch(/\[[A-D]\s*[-–]/);
    expect(an?.placeholderText).not.toMatch(/\[[A-D]\s*[-–]/);
  });
});
