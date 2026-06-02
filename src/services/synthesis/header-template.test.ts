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

describe('renderHeaderMarkdown — CTU benchmark scuola veronese (Del Balzo/Lavini)', () => {
  function ctuHeader(): HeaderData {
    const d = emptyHeader();
    d.paziente.nome = 'Luca Mao';
    d.paziente.dataNascita = '02/10/1960';
    d.paziente.luogoNascita = 'Mirano (VE)';
    d.paziente.residenza = 'Provaglio d\'Iseo (PN), via IV Novembre n. 21';
    return overlayGiudizialeFromMetadata(d, DEL_PORTO_META);
  }

  it('renders the full formal veronese structure', () => {
    const md = renderHeaderMarkdown(ctuHeader(), { variant: 'ctu' });
    expect(md).toContain('**TRIBUNALE ORDINARIO DI BRESCIA**');
    expect(md).toContain('**SEZIONE CENTRALE CIVILE**');
    expect(md).toContain('**Numero di Ruolo Generale 10965/2025**');
    expect(md).toContain('Accertamento tecnico preventivo');
    // Destinatario: giudice maschile → "Ill.mo Signore" + "Giudice Istruttore"
    expect(md).toContain('Ill.mo Signore');
    expect(md).toContain('Dott. Raffaele Del Porto');
    expect(md).toContain('Giudice Istruttore');
    // Caption parti
    expect(md).toContain('**Luca Mao // ASST della Franciacorta**');
    // Formula di conferimento veronese
    expect(md).toContain('la Signoria Vostra Illustrissima conferiva al sottoscritto Dott. Nicola Pigaiani');
    expect(md).toContain('incarico di Consulenza Tecnica in merito alla vicenda clinica di');
    expect(md).not.toContain('del/della Sig./Sig.ra'); // chiusura neutra, niente placeholder gender
    // Periziando in MAIUSCOLO
    expect(md).toContain('**LUCA MAO**');
    expect(md).toContain('nato/a a Mirano (VE) il 02/10/1960');
    expect(md).toContain('CC.TT.P. Dott.ssa Sarah Nalin');
    expect(md).toContain('L\'inizio delle operazioni peritali era fissato per il giorno 13.01.2026');
    expect(md).toContain('Era stabilito un fondo spese di Euro 1.800,00');
    expect(md).toContain('precisato nei quesiti formulati nell\'ordinanza di conferimento');
  });

  it('concorda al femminile quando il perito è una Dr.ssa', () => {
    const d = emptyHeader();
    d.paziente.nome = 'Anna Rossi';
    const female = overlayGiudizialeFromMetadata(d, {
      ...DEL_PORTO_META,
      ctuName: 'Dr.ssa Giovanna Del Balzo',
      judgeName: 'Dott.ssa Stefania Polichetti',
    });
    const md = renderHeaderMarkdown(female, { variant: 'ctu' });
    expect(md).toContain('conferiva alla sottoscritta Dr.ssa Giovanna Del Balzo');
    expect(md).toContain('Ill.ma Signora');
  });

  it('renders the perito letterhead when specialization is present', () => {
    const d = emptyHeader();
    d.paziente.nome = 'Luca Mao';
    d.perito = { nome: 'Dott. Nicola Pigaiani', qualifica: 'medico legale', specializzazione: 'Specialista in Medicina Legale', iscrizioneAlbo: 'OMCeO Verona n. 1234' };
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(d, DEL_PORTO_META), { variant: 'ctu' });
    expect(md).toContain('*Specialista in Medicina Legale*');
    expect(md).toContain('Iscrizione Albo: OMCeO Verona n. 1234');
  });

  it('renders the FULL perito letterhead (specializ., albo, e-mail, PEC, ausiliario) from metadata', () => {
    const d = emptyHeader();
    d.paziente.nome = 'Stefan Schoenweger';
    const meta: PeriziaMetadata = {
      tribunale: 'Tribunale Ordinario di Bolzano',
      sezione: 'Sezione Seconda Civile',
      rgNumber: '653/2026',
      judgeName: 'Dott. Andrea Pappalardo',
      dataIncarico: '06/05/2026',
      ctuName: 'Dr. Franco Lavini',
      ctuTitle: 'medico legale, specialista in Ortopedia e Traumatologia e in Fisiatria',
      specialita: 'Specialista in Ortopedia e Traumatologia; Specialista in Fisiatria; Specialista in Medicina Legale',
      alboNumber: 'OMCeO Verona n. 1234',
      ctuEmail: 'frnclvn@gmail.com',
      ctuPec: 'franco.lavini@pec.omceovr.it',
      collaboratoreName: 'Dr. Luigi Giuseppe Bongiovanni',
      collaboratoreTitle: 'Specialista in Neurologia',
    };
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(d, meta), { variant: 'ctu' });
    expect(md).toContain('**Dr. Franco Lavini**');
    expect(md).toContain('*Specialista in Ortopedia e Traumatologia*');
    expect(md).toContain('*Specialista in Fisiatria*');
    expect(md).toContain('*Specialista in Medicina Legale*');
    expect(md).toContain('Iscrizione Albo: OMCeO Verona n. 1234');
    expect(md).toContain('E-mail: frnclvn@gmail.com');
    expect(md).toContain('PEC: franco.lavini@pec.omceovr.it');
    expect(md).toContain('Ausiliario del CTU: Dr. Luigi Giuseppe Bongiovanni — Specialista in Neurologia');
    // conferimento al maschile (Dr. Franco)
    expect(md).toContain('conferiva al sottoscritto Dr. Franco Lavini');
  });

  it('caption parti: una sola parte nota viene etichettata col ruolo (no nome ambiguo)', () => {
    const dR = emptyHeader();
    dR.paziente.nome = 'Tizio';
    const mdR = renderHeaderMarkdown(overlayGiudizialeFromMetadata(dR, { tribunale: 'Tribunale di Verona', parteRicorrente: 'Tizio Caio' }), { variant: 'ctu' });
    expect(mdR).toContain('**Parte ricorrente: Tizio Caio**');
    expect(mdR).not.toContain('Tizio Caio //');

    const dResist = emptyHeader();
    dResist.paziente.nome = 'Tizio';
    const mdResist = renderHeaderMarkdown(overlayGiudizialeFromMetadata(dResist, { tribunale: 'Tribunale di Verona', parteResistente: 'ASST X' }), { variant: 'ctu' });
    expect(mdResist).toContain('**Parte resistente: ASST X**');
  });

  it('concorda al femminile anche con titolo per esteso ("Dottoressa")', () => {
    const d = emptyHeader();
    d.paziente.nome = 'Mario Rossi';
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(d, { ctuName: 'Dottoressa Anna Bianchi' }), { variant: 'ctu' });
    expect(md).toContain('conferiva alla sottoscritta Dottoressa Anna Bianchi');
  });

  it('ausiliario senza titolo: nessun trattino penzolante', () => {
    const d = emptyHeader();
    d.paziente.nome = 'Mario Rossi';
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(d, { ctuName: 'Dr. X', collaboratoreName: 'Dr. Y' }), { variant: 'ctu' });
    expect(md).toContain('Ausiliario del CTU: Dr. Y');
    expect(md).not.toContain('Dr. Y —');
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
