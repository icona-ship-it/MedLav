import { describe, it, expect } from 'vitest';
import { renderHeaderMarkdown, overlayGiudizialeFromMetadata } from './header-template';
import type { HeaderData } from './header-schema';
import type { PeriziaMetadata } from '@/types';

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

const DEL_PORTO_META: PeriziaMetadata = {
  tribunale: 'Tribunale Ordinario di Brescia',
  sezione: 'Sezione Centrale Civile',
  rgNumber: '10965/2025',
  tipoProcedimento: 'Accertamento tecnico preventivo (ex art. 696 bis c.p.c.)',
  judgeName: 'Dott. Raffaele Del Porto',
  dataIncarico: '02.12.2025',
  dataOperazioni: '13.01.2026',
  dataDeposito: '15.06.2026',
  fondoSpese: 'Euro 1.800,00',
  parteRicorrente: 'Luca Mao',
  parteResistente: 'ASST della Franciacorta',
  ctpRicorrente: 'Dott.ssa Sarah Nalin',
  ctpResistente: 'Dott. Lorenzo Micheli',
  ctuName: 'Dott. Nicola Pigaiani',
  ctuTitle: 'medico legale presso l\'Università di Verona',
};

describe('overlayGiudizialeFromMetadata', () => {
  it('returns the same data when no metadata provided', () => {
    const d = emptyHeader();
    expect(overlayGiudizialeFromMetadata(d, undefined)).toBe(d);
  });

  it('fills giudiziale + perito from perito metadata (authoritative)', () => {
    const out = overlayGiudizialeFromMetadata(emptyHeader(), DEL_PORTO_META);
    expect(out.giudiziale?.tribunale).toBe('Tribunale Ordinario di Brescia');
    expect(out.giudiziale?.numeroRG).toBe('10965/2025');
    expect(out.giudiziale?.tipoProcedimento).toContain('Accertamento tecnico preventivo');
    expect(out.giudiziale?.dataInizioOperazioni).toBe('13.01.2026');
    expect(out.giudiziale?.termineDeposito).toBe('15.06.2026');
    expect(out.giudiziale?.fondoSpese).toBe('Euro 1.800,00');
    expect(out.perito?.nome).toBe('Dott. Nicola Pigaiani');
    expect(out.perito?.qualifica).toContain('medico legale');
  });

  it('keeps the LLM-extracted value when the metadata field is empty', () => {
    const d = emptyHeader();
    d.giudiziale = {
      tribunale: 'Tribunale di Verona', sezione: null, numeroRG: null, giudice: null,
      dataConferimento: null, dataGiuramento: null, ricorrente: null, resistente: null,
      ctpRicorrente: null, ctpResistente: null,
    };
    const out = overlayGiudizialeFromMetadata(d, { rgNumber: '123/2026' });
    expect(out.giudiziale?.tribunale).toBe('Tribunale di Verona'); // preserved (no metadata)
    expect(out.giudiziale?.numeroRG).toBe('123/2026'); // overlaid from metadata
  });
});

describe('renderHeaderMarkdown — CTU benchmark Del Porto', () => {
  function ctuHeader(): HeaderData {
    const d = emptyHeader();
    d.paziente.nome = 'Luca Mao';
    d.paziente.dataNascita = '02/10/1960';
    d.paziente.luogoNascita = 'Mirano (VE)';
    d.paziente.residenza = 'Provaglio d\'Iseo (PN), via IV Novembre n. 21';
    return overlayGiudizialeFromMetadata(d, DEL_PORTO_META);
  }

  it('renders the full formal Del Porto structure', () => {
    const md = renderHeaderMarkdown(ctuHeader(), { variant: 'ctu' });
    expect(md).toContain('**TRIBUNALE ORDINARIO DI BRESCIA**');
    expect(md).toContain('**SEZIONE CENTRALE CIVILE**');
    expect(md).toContain('**n. R.G. 10965/2025**');
    expect(md).toContain('Accertamento tecnico preventivo');
    expect(md).toContain('relativo alla vicenda clinica del/della sig./sig.ra Luca Mao');
    expect(md).toContain('Dott. Raffaele Del Porto');
    expect(md).toContain('conferiva al sottoscritto Dott. Nicola Pigaiani');
    expect(md).toContain('nato/a a Mirano (VE) il 02/10/1960');
    expect(md).toContain('CC.TT.P. Dott.ssa Sarah Nalin');
    expect(md).toContain('L\'inizio delle operazioni peritali era fissato per il giorno 13.01.2026');
    expect(md).toContain('Era stabilito un fondo spese di Euro 1.800,00');
  });

  it('has NO internal markdown headings so the validator extracts the whole block', () => {
    const md = renderHeaderMarkdown(ctuHeader(), { variant: 'ctu' });
    const headingLines = md.split('\n').filter((l) => /^#{1,3}\s/.test(l));
    expect(headingLines).toEqual(['## Intestazione']);
  });

  it('omits fields not provided (no fabrication) and marks missing patient name', () => {
    const md = renderHeaderMarkdown(emptyHeader(), { variant: 'ctu' });
    expect(md).toContain('[da compilare dal perito]');
    expect(md).not.toContain('TRIBUNALE');
    expect(md).not.toContain('conferiva');
    expect(md).not.toContain('fondo spese');
  });
});
