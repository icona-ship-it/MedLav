import { describe, it, expect } from 'vitest';
import { getSectionSpecById } from './section-catalog';
import type { PeriziaMetadata } from '@/types';

/**
 * Perizia RC: "Il Fatto e la Storia Clinica" e "I Dati Anamnestici".
 * Nord di prodotto: l'AI NON reinterpreta ciò che il perito scrive →
 * - campo COMPILATO nel form perizia → placeholder col testo del perito (verbatim);
 * - campo VUOTO → l'AI genera una BOZZA dai documenti (spec LLM del catalogo, stile
 *   benchmark Antoniazzi), che il perito poi rifinisce — non più uno scaffold bianco.
 * (Decisione utente 2026-06-29: prima il ramo "vuoto" lasciava la sezione bianca; il
 * fuori-stile che l'aveva motivata — tag [A/B/C/D] + tassonomia — è risolto dai cleanup C1/C5.)
 */
describe('applyRcPeritoSections (via getSectionSpecById) — sezioni perito RC', () => {
  it('compilato → usa il TESTO del perito come placeholder ("Il Fatto")', () => {
    const meta = { ilFattoEStoriaClinica: 'In data 10.03.2024 la paziente cadeva...' } as PeriziaMetadata;
    const spec = getSectionSpecById('il_fatto_e_storia_clinica', meta);
    expect(spec?.isPlaceholder).toBe(true);
    expect(spec?.placeholderText).toContain('In data 10.03.2024');
    expect(spec?.maxTokens).toBe(0);
  });

  it('VUOTO → bozza AI dai documenti ("Il Fatto"): spec LLM, non placeholder', () => {
    const meta = { patientFullName: 'Mario Esempi' } as PeriziaMetadata;
    const spec = getSectionSpecById('il_fatto_e_storia_clinica', meta);
    expect(spec?.isPlaceholder).toBeFalsy();
    expect(spec?.maxTokens).toBeGreaterThan(0);
    expect(spec?.dataSources).toContain('events-medical');
    expect(spec?.promptDirective).toMatch(/Antoniazzi/);
  });

  it('VUOTO → bozza AI dai documenti ("Dati Anamnestici"): spec LLM, non placeholder', () => {
    const meta = { patientFullName: 'Mario Esempi' } as PeriziaMetadata;
    const spec = getSectionSpecById('anamnesi', meta);
    expect(spec?.isPlaceholder).toBeFalsy();
    expect(spec?.maxTokens).toBeGreaterThan(0);
    expect(spec?.dataSources).toContain('events-medical');
  });

  it('La Visita Clinica resta SEMPRE placeholder (visita in presenza, non nei doc)', () => {
    const meta = { patientFullName: 'Mario Esempi' } as PeriziaMetadata;
    const spec = getSectionSpecById('visita_clinica', meta);
    expect(spec?.isPlaceholder).toBe(true);
    expect(spec?.placeholderText).toMatch(/SOGGETTIVAMENTE/);
  });

  it('placeholder col testo del perito NON deve contenere tag di citazione [A/B...]', () => {
    const meta = { ilFattoEStoriaClinica: 'Narrazione pulita del perito.' } as PeriziaMetadata;
    const il = getSectionSpecById('il_fatto_e_storia_clinica', meta);
    expect(il?.placeholderText).not.toMatch(/\[[A-D]\s*[-–]/);
  });
});

describe('getSectionSpecById — alias canonici (prova dal vivo 224)', () => {
  it("risolve 'i_dati_anamnestici' (canonico del parser) sulla spec 'anamnesi'", () => {
    const spec = getSectionSpecById('i_dati_anamnestici');
    expect(spec?.id).toBe('anamnesi');
  });
  it('gli id di catalogo restano risolti direttamente', () => {
    expect(getSectionSpecById('epicrisi')?.id).toBe('epicrisi');
    expect(getSectionSpecById('sezione_inesistente')).toBeUndefined();
  });
});
