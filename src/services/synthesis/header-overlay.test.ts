import { describe, it, expect } from 'vitest';
import { emptyHeaderData, collectAttestedDays, discardUnattestedEventDate, type HeaderData } from './header-schema';
import { applyPeriziaMetadataToHeader, toItalianDate, ambitoFromCaseType } from './header-overlay';
import { renderHeaderMarkdown } from './header-template';

function withEvento(dataEvento: string | null): HeaderData {
  const base = emptyHeaderData();
  return { ...base, oggetto: { ...base.oggetto, eventoIndice: 'Sinistro stradale', dataEvento } };
}

describe('applyPeriziaMetadataToHeader — i dati del perito arrivano sulla carta senza passare dal modello (I8)', () => {
  it('la data del sinistro inserita dal medico prevale su una data estratta diversa, in ogni formato', () => {
    const events = [{ eventDate: '2024-11-14' }, { eventDate: '2024-11-20' }];
    for (const dataSinistro of ['13/11/2024', '13.11.2024', '2024-11-13', '13-11-2024']) {
      const perito = { dataSinistro };
      const header = applyPeriziaMetadataToHeader(
        discardUnattestedEventDate(withEvento('14/11/2024'), collectAttestedDays(events, perito)),
        perito,
        'rc_auto',
      );
      const md = renderHeaderMarkdown(header);
      expect(md, dataSinistro).toContain('occorso in data 13/11/2024');
      expect(md).not.toContain('14/11/2024');
    }
  });

  it('senza data del medico la data del modello resta; con metadati vuoti nulla cambia (idempotenza)', () => {
    const base = withEvento('14/11/2024');
    expect(applyPeriziaMetadataToHeader(base, {}, null)).toEqual({ ...base, oggetto: { ...base.oggetto, ambito: null } });
    const once = applyPeriziaMetadataToHeader(base, { dataSinistro: '13/11/2024' }, 'rc_auto');
    expect(applyPeriziaMetadataToHeader(once, { dataSinistro: '13/11/2024' }, 'rc_auto')).toEqual(once);
  });

  it('carta intestata e anagrafica dal form: nome, specializzazioni, albo, PEC; periziando con data di nascita in DD/MM/YYYY e CF maiuscolo', () => {
    const header = applyPeriziaMetadataToHeader(emptyHeaderData(), {
      ctuName: 'Dott.ssa Anna Esempi', specialita: 'Medicina Legale; Ortopedia', alboNumber: '12345', ctuPec: 'anna@pec.esempio.it',
      patientFullName: 'Carlo Demprova', patientDateOfBirth: '1990-03-10', patientAddress: 'via degli Esempi 1, Cittàdemo', patientFiscalCode: 'dmpcrl90c10h501x',
    }, 'rc_auto');
    const md = renderHeaderMarkdown(header);
    expect(md).toContain('Dott.ssa Anna Esempi');
    expect(md).toContain('Medicina Legale');
    expect(md).toContain('Ortopedia');
    expect(md).toContain('Iscrizione Albo: 12345');
    expect(md).toContain('PEC: anna@pec.esempio.it');
    expect(md).toContain('**Carlo Demprova**');
    expect(md).toContain('il 10/03/1990');
    expect(md).toContain('C.F. DMPCRL90C10H501X');
    expect(md).toContain('via degli Esempi 1, Cittàdemo');
    expect(md).toContain('in ambito di responsabilità civile');
    expect(md).not.toContain('[da compilare dal perito]\n\nIn data');
  });

  it('un valore del modello resta quando il form è vuoto; un valore vuoto nel form non cancella mai', () => {
    const base = emptyHeaderData();
    const llm: HeaderData = { ...base, perito: { nome: 'Dott. Modello', qualifica: null, specializzazione: null, iscrizioneAlbo: null }, paziente: { ...base.paziente, nome: 'Nome Dal Modello' } };
    const out = applyPeriziaMetadataToHeader(llm, { ctuName: '   ', patientFullName: '' }, 'generica');
    expect(out.perito?.nome).toBe('Dott. Modello');
    expect(out.paziente.nome).toBe('Nome Dal Modello');
    expect(out.oggetto.ambito).toBe('rc_civile');
  });

  it('ambito dal tipo caso solo se il modello non lo ha dato', () => {
    expect(ambitoFromCaseType('rc_auto')).toBe('rc_civile');
    expect(ambitoFromCaseType('ortopedica')).toBe('malpractice');
    expect(ambitoFromCaseType('sconosciuto')).toBeNull();
    const base = emptyHeaderData();
    const withAmbito: HeaderData = { ...base, oggetto: { ...base.oggetto, ambito: 'infortuni' } };
    expect(applyPeriziaMetadataToHeader(withAmbito, {}, 'rc_auto').oggetto.ambito).toBe('infortuni');
  });

  it('toItalianDate: formati validi normalizzati, valori impossibili scartati', () => {
    expect(toItalianDate('5/3/2026')).toBe('05/03/2026');
    expect(toItalianDate('2026-03-05T10:00:00Z')).toBe('05/03/2026');
    expect(toItalianDate('31/13/2026')).toBeNull();
    expect(toItalianDate('domani')).toBeNull();
    expect(toItalianDate('')).toBeNull();
  });
});
