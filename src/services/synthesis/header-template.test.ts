import { describe, it, expect } from 'vitest';
import { renderHeaderMarkdown, isHeaderSectionId } from './header-template';
import type { HeaderData } from './header-schema';

function emptyHeader(): HeaderData {
  return {
    perito: null,
    paziente: { nome: null, dataNascita: null, luogoNascita: null, residenza: null, codiceFiscale: null, telefono: null },
    oggetto: { eventoIndice: null, dataEvento: null, lesione: null, struttura: null, ambito: null },
    dataVisitaMedicoLegale: null,
    soggettoRichiedente: null,
    giudiziale: null,
  };
}

describe('renderHeaderMarkdown — stragiudiziale carta intestata (gold Antoniazzi/Regnoto)', () => {
  // Nomi FITTIZI (GDPR).
  function stragHeader(): HeaderData {
    return {
      perito: {
        nome: 'Dott. Mario Esempio',
        qualifica: null,
        specializzazione: 'Specialista in Ortopedia e Traumatologia\nSpecialista in Medicina Legale',
        iscrizioneAlbo: null,
      },
      paziente: {
        nome: 'Carla Fittizia',
        dataNascita: '01/01/2000',
        luogoNascita: 'Verona',
        residenza: 'Verona, via Esempio 2',
        codiceFiscale: 'XXXXXX00X00X000X',
        telefono: '333 0000000',
        email: 'carla@esempio.it',
        avvocato: 'Avv. Franca Fittizia',
      },
      oggetto: {
        eventoIndice: 'caduta accidentale',
        dataEvento: '12/09/2025',
        lesione: 'frattura del gomito destro',
        struttura: null,
        ambito: 'rc_civile',
      },
      dataVisitaMedicoLegale: '05/06/2026',
      soggettoRichiedente: null,
      giudiziale: null,
    };
  }

  it('layout carta intestata: niente schede "###" né titolo VALUTAZIONE; blocco perito in TESTO PIANO (#7 Lavini)', () => {
    const md = renderHeaderMarkdown(stragHeader());
    expect(md).not.toContain('### ');
    expect(md).not.toContain('VALUTAZIONE MEDICO-LEGALE STRAGIUDIZIALE');
    // #7: come nei benchmark MOTTA/Antoniazzi — niente grassetto/corsivo sul perito.
    expect(md).toContain('Dott. Mario Esempio');
    expect(md).not.toContain('**Dott. Mario Esempio**');
    expect(md).toContain('Specialista in Ortopedia e Traumatologia');
    expect(md).not.toContain('*Specialista in Ortopedia e Traumatologia*');
  });

  it('riga visita SENZA "con il suo consenso" (#2 Lavini: allineata a MOTTA/Antoniazzi)', () => {
    const md = renderHeaderMarkdown(stragHeader());
    expect(md).toContain('In data 05/06/2026 ho sottoposto ad accertamenti clinici e valutazione medico legale:');
    expect(md).not.toContain('con il suo consenso');
  });

  it('accompagnatore documentato: ", in presenza di ..." (senza consenso)', () => {
    const d = stragHeader();
    d.paziente.accompagnatore = 'sua madre';
    const md = renderHeaderMarkdown(d);
    expect(md).toContain('valutazione medico legale, in presenza di sua madre:');
    expect(md).not.toContain('con il suo consenso');
  });

  it('blocco dati periziando riga per riga (nato/residente, C.F., MAIL, TEL, Avvocato)', () => {
    const md = renderHeaderMarkdown(stragHeader());
    expect(md).toContain('**Carla Fittizia**');
    expect(md).toContain('Nato/a a Verona il 01/01/2000 e residente a Verona, via Esempio 2');
    expect(md).toContain('C.F. XXXXXX00X00X000X');
    expect(md).toContain('MAIL: carla@esempio.it');
    expect(md).toContain('TEL: 333 0000000');
    expect(md).toContain('Avvocato di parte: Avv. Franca Fittizia');
  });

  it('riga scopo: ENTRAMBE le formule dei gold (#3 Lavini — valutare lesioni + accertare conseguenze temporanee/permanenti)', () => {
    const md = renderHeaderMarkdown(stragHeader());
    expect(md).toContain('Al fine di valutare le lesioni patite in occasione di caduta accidentale occorso in data 12/09/2025 e di accertarne le conseguenze di ordine temporaneo e permanente in ambito di responsabilità civile.');
  });

  it('NESSUN riferimento al tribunale (regola assoluta stragiudiziale)', () => {
    const md = renderHeaderMarkdown(stragHeader());
    expect(md).not.toMatch(/tribunale|giudice|R\.G\.|ricorrente|resistente/i);
  });

  it('campi critici mancanti → [da compilare dal perito], mai inventati', () => {
    const md = renderHeaderMarkdown(emptyHeader());
    expect(md).toContain('[da compilare dal perito]');
    expect(md).not.toContain('### ');
  });

  it('has NO internal markdown headings so the validator extracts the whole block', () => {
    const md = renderHeaderMarkdown(stragHeader());
    const headingLines = md.split('\n').filter((l) => /^#{1,3}\s/.test(l));
    expect(headingLines).toEqual(['## Intestazione']);
  });
});

describe('isHeaderSectionId', () => {
  it('recognizes only the structured-JSON header section', () => {
    expect(isHeaderSectionId('intestazione_stragiudiziale')).toBe(true);
    expect(isHeaderSectionId('epicrisi')).toBe(false);
    expect(isHeaderSectionId('documentazione_sanitaria')).toBe(false);
  });
});
