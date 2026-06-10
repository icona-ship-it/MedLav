import { describe, it, expect } from 'vitest';
import { renderHeaderMarkdown, overlayGiudizialeFromMetadata, buildOperativeCodaFromMetadata } from './header-template';
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
    // Destinatario: giudice maschile → "Ill.mo Signore"; in ATP la qualifica
    // corretta è "Giudice Delegato" (gold Del Porto, 2026-06-10).
    expect(md).toContain('Ill.mo Signore');
    expect(md).toContain('Dott. Raffaele Del Porto');
    expect(md).toContain('Giudice Delegato');
    expect(md).not.toContain('Giudice Istruttore');
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

describe('renderHeaderMarkdown — benchmark gold 2026-06-10 (collegio, decesso, penale, formula-ponte)', () => {
  // Tutti i nomi qui sotto sono FITTIZI (GDPR: mai nomi reali nei nuovi test).
  const COLLEGIO_META: PeriziaMetadata = {
    ...DEL_PORTO_META,
    coCtuName: 'Dott. Carlo Albertini',
    coCtuTitle: 'specialista in Ortopedia e Traumatologia',
  };

  function baseHeader(): HeaderData {
    const d = emptyHeader();
    d.paziente.nome = 'Mario Fittizi';
    return d;
  }

  it('collegio: conferimento plurale "conferiva ai sottoscritti" con co-perito paritetico (non Ausiliario)', () => {
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), COLLEGIO_META), { variant: 'ctu' });
    expect(md).toContain('conferiva ai sottoscritti Dott. Nicola Pigaiani');
    expect(md).toContain('e Dott. Carlo Albertini, specialista in Ortopedia e Traumatologia');
    expect(md).not.toContain('Ausiliario del CTU: Dott. Carlo Albertini');
  });

  it('collegio: carta intestata con entrambi i nominativi', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), { ...COLLEGIO_META, specialita: 'Specialista in Medicina Legale' }),
      { variant: 'ctu' },
    );
    expect(md).toContain('**Dott. Nicola Pigaiani**');
    expect(md).toContain('**Dott. Carlo Albertini**');
    expect(md).toContain('*specialista in Ortopedia e Traumatologia*');
  });

  it('collegio + quesiti nel piano: formula-ponte "Il compito affidato al Collegio di CC.TT.U. era precisato nei seguenti quesiti:"', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), { ...COLLEGIO_META, tipoProcedimento: 'Consulenza Tecnica d\'Ufficio' }),
      { variant: 'ctu', quesitiInPlan: true },
    );
    expect(md).toContain('Il compito affidato al Collegio di CC.TT.U. era precisato nei seguenti quesiti:');
  });

  it('decesso: blocco periziando "residente in vita ... e deceduto/a il ... presso ..."', () => {
    const d = baseHeader();
    d.paziente.dataNascita = '01/01/1950';
    d.paziente.luogoNascita = 'Verona';
    d.paziente.residenza = 'Verona, via Esempio 1';
    d.paziente.dataDecesso = '10/02/2025';
    d.paziente.luogoDecesso = 'Ospedale Esempio di Verona';
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(d, DEL_PORTO_META), { variant: 'ctu' });
    expect(md).toContain('residente in vita in Verona, via Esempio 1');
    expect(md).toContain('e deceduto/a il 10/02/2025 presso Ospedale Esempio di Verona');
  });

  it('oggettoIncarico custom: conferimento "in merito alla vicenda clinica e alle cause del decesso di"', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), {
        ...DEL_PORTO_META,
        oggettoIncarico: 'alla vicenda clinica e alle cause del decesso',
      }),
      { variant: 'ctu' },
    );
    expect(md).toContain('incarico di Consulenza Tecnica in merito alla vicenda clinica e alle cause del decesso di');
  });

  it('formula-ponte: con quesiti nel piano chiude con "era precisato nei seguenti quesiti:" (procedimento ordinario)', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), { ...DEL_PORTO_META, tipoProcedimento: 'Consulenza Tecnica d\'Ufficio' }),
      { variant: 'ctu', quesitiInPlan: true },
    );
    expect(md).toContain('Il compito affidato al Consulente Tecnico era precisato nei seguenti quesiti:');
    expect(md).not.toContain('nei quesiti formulati nell\'ordinanza di conferimento');
  });

  it('formula-ponte ATP 696-bis: "Lo scopo dell\'accertamento era indicato dai seguenti quesiti:"', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), DEL_PORTO_META), // DEL_PORTO_META è ATP 696-bis
      { variant: 'ctu', quesitiInPlan: true },
    );
    expect(md).toContain('Lo scopo dell\'accertamento era indicato dai seguenti quesiti:');
  });

  it('senza quesiti nel piano: resta la formula di rinvio all\'ordinanza (retrocompatibile)', () => {
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), DEL_PORTO_META), { variant: 'ctu' });
    expect(md).toContain('precisato nei quesiti formulati nell\'ordinanza di conferimento');
  });

  it('riga-oggetto dopo il tipo procedimento: "relativo alla vicenda clinica di **[periziando]**"', () => {
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), DEL_PORTO_META), { variant: 'ctu' });
    expect(md).toContain('relativo alla vicenda clinica di **Mario Fittizi**');
  });

  it('termini multi-fase: bozza → osservazioni CC.TT.P. → deposito in un\'unica formula', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), {
        ...DEL_PORTO_META,
        termineBozza: '30.04.2026',
        termineOsservazioni: '20.05.2026',
      }),
      { variant: 'ctu' },
    );
    expect(md).toContain('Era concesso termine entro il 30.04.2026 per l\'inoltro della bozza di relazione ai consulenti di parte');
    expect(md).toContain('assegnava a questi ultimi termine entro il 20.05.2026 per l\'invio al C.T.U. di eventuali osservazioni');
    expect(md).toContain('assegnava infine termine entro il 15.06.2026 per il deposito della relazione definitiva');
  });

  it('nomina dell\'ausiliario nel corpo dell\'intestazione', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), {
        ...DEL_PORTO_META,
        collaboratoreName: 'Dr. Bruno Fittizio',
        collaboratoreTitle: 'Specialista in Neurologia',
      }),
      { variant: 'ctu' },
    );
    expect(md).toContain('Era individuato in qualità di Ausiliario del C.T.U. Dr. Bruno Fittizio, Specialista in Neurologia.');
  });

  it('provvedimenti dell\'ordinanza (testo libero) renderizzati dopo i termini', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), {
        ...DEL_PORTO_META,
        provvedimentiOrdinanza: 'Il Giudice autorizza il CTU ad acquisire documentazione presso le strutture sanitarie.',
      }),
      { variant: 'ctu' },
    );
    expect(md).toContain('Il Giudice autorizza il CTU ad acquisire documentazione presso le strutture sanitarie.');
  });

  // ── Verifica avversariale 2026-06-10: gap residui chiusi ──────────

  it('quesiti nel piano: il blocco operativo (CC.TT.P./termini/fondo) ESCE dall\'intestazione e va in coda ai quesiti', () => {
    const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), DEL_PORTO_META), { variant: 'ctu', quesitiInPlan: true });
    expect(md).not.toContain('CC.TT.P.');
    expect(md).not.toContain('operazioni peritali');
    expect(md).not.toContain('fondo spese');
    expect(md).toContain('Lo scopo dell\'accertamento era indicato dai seguenti quesiti:');

    const coda = buildOperativeCodaFromMetadata(DEL_PORTO_META);
    expect(coda).toContain('CC.TT.P. Dott.ssa Sarah Nalin');
    expect(coda).toContain('L\'inizio delle operazioni peritali era fissato per il giorno 13.01.2026');
    expect(coda).toContain('Era stabilito un fondo spese di Euro 1.800,00');
  });

  it('buildOperativeCodaFromMetadata: vuota senza metadati operativi', () => {
    expect(buildOperativeCodaFromMetadata(undefined)).toBe('');
    expect(buildOperativeCodaFromMetadata({ tribunale: 'Tribunale di Verona' })).toBe('');
  });

  it('numero di ruolo: "Causa Civile N.R.G." per causa ordinaria, "Numero di Ruolo Generale" per ATP', () => {
    const ordinaria = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), { ...DEL_PORTO_META, tipoProcedimento: 'Causa civile ordinaria' }),
      { variant: 'ctu' },
    );
    expect(ordinaria).toContain('**Causa Civile N.R.G. 10965/2025**');

    const atp = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), DEL_PORTO_META), { variant: 'ctu' });
    expect(atp).toContain('**Numero di Ruolo Generale 10965/2025**');
  });

  it('qualifica giudice: il metadato del perito vince sull\'euristica ATP', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), { ...DEL_PORTO_META, giudiceQualifica: 'Giudice Istruttore' }),
      { variant: 'ctu' },
    );
    expect(md).toContain('Giudice Istruttore'); // override (DEL_PORTO è ATP → euristica direbbe Delegato)
    expect(md).not.toContain('Giudice Delegato');
  });

  it('collegio: carta intestata del co-perito con specializzazioni multi-riga (simmetrica)', () => {
    const md = renderHeaderMarkdown(
      overlayGiudizialeFromMetadata(baseHeader(), {
        ...DEL_PORTO_META,
        specialita: 'Specialista in Medicina Legale',
        coCtuName: 'Dott. Carlo Albertini',
        coCtuTitle: 'Specialista in Cardiologia; Direttore U.O.C. Cardiologia',
      }),
      { variant: 'ctu' },
    );
    expect(md).toContain('*Specialista in Cardiologia*');
    expect(md).toContain('*Direttore U.O.C. Cardiologia*');
  });

  describe('ambito penale', () => {
    const PENALE_META: PeriziaMetadata = {
      tribunale: 'Corte d\'Appello di Brescia',
      rgNumber: '15/2024',
      ctuName: 'Dr.ssa Maria Esempi',
      ctuTitle: 'medico legale',
      dataIncarico: '21.01.2025',
      ctpRicorrente: 'Dott. Aldo Fittizio',
      ctpResistente: 'Prof. Bruno Fittizio',
      ambitoPenale: true,
    };

    it('penale: "incarico di Perizia Tecnica medico legale" conferito presso la Corte, niente formule civilistiche', () => {
      const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), PENALE_META), { variant: 'ctu', ambitoPenale: true });
      expect(md).toContain('In data 21.01.2025, presso la Corte d\'Appello di Brescia, era conferito alla sottoscritta Dr.ssa Maria Esempi');
      expect(md).toContain('incarico di Perizia Tecnica medico legale');
      expect(md).not.toContain('Signoria Vostra Illustrissima');
      expect(md).not.toContain('Giudice Istruttore');
      expect(md).not.toContain('incarico di Consulenza Tecnica');
    });

    it('penale: numero come "N. ... R.G. App." (non "Numero di Ruolo Generale")', () => {
      const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), PENALE_META), { variant: 'ctu', ambitoPenale: true });
      expect(md).toContain('**N. 15/2024 R.G. App.**');
      expect(md).not.toContain('Numero di Ruolo Generale');
    });

    it('penale: parti come imputati/parte civile con lessico "periti", mai CC.TT.P. ricorrente/resistente', () => {
      const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), PENALE_META), { variant: 'ctu', ambitoPenale: true });
      expect(md).toContain('I difensori degli imputati nominavano quali propri periti Prof. Bruno Fittizio.');
      expect(md).toContain('Il difensore della parte civile nominava quale proprio perito Dott. Aldo Fittizio.');
      expect(md).not.toContain('CC.TT.P.');
      expect(md).not.toContain('parte ricorrente');
    });

    it('penale + quesiti nel piano: "Il compito affidato al Perito era precisato nei seguenti quesiti:"', () => {
      const md = renderHeaderMarkdown(overlayGiudizialeFromMetadata(baseHeader(), PENALE_META), { variant: 'ctu', ambitoPenale: true, quesitiInPlan: true });
      expect(md).toContain('Il compito affidato al Perito era precisato nei seguenti quesiti:');
    });

    it('penale collegiale: conferimento "ed al" co-perito + formula "ai Periti"', () => {
      const md = renderHeaderMarkdown(
        overlayGiudizialeFromMetadata(baseHeader(), { ...PENALE_META, coCtuName: 'Dott. Carlo Albertini', coCtuTitle: 'specialista in Cardiologia' }),
        { variant: 'ctu', ambitoPenale: true, quesitiInPlan: true },
      );
      expect(md).toContain('ed al Dott. Carlo Albertini, specialista in Cardiologia');
      expect(md).toContain('Il compito affidato ai Periti era precisato nei seguenti quesiti:');
    });
  });
});

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

  it('layout carta intestata: niente schede "###" né titolo VALUTAZIONE', () => {
    const md = renderHeaderMarkdown(stragHeader(), { variant: 'stragiudiziale' });
    expect(md).not.toContain('### ');
    expect(md).not.toContain('VALUTAZIONE MEDICO-LEGALE STRAGIUDIZIALE');
    expect(md).toContain('**Dott. Mario Esempio**');
    expect(md).toContain('*Specialista in Ortopedia e Traumatologia*');
    expect(md).toContain('*Specialista in Medicina Legale*');
  });

  it('riga visita con formula del consenso', () => {
    const md = renderHeaderMarkdown(stragHeader(), { variant: 'stragiudiziale' });
    expect(md).toContain('In data 05/06/2026 ho sottoposto ad accertamenti clinici e valutazione medico legale, con il suo consenso');
  });

  it('accompagnatore documentato: ", in presenza di ..."', () => {
    const d = stragHeader();
    d.paziente.accompagnatore = 'sua madre';
    const md = renderHeaderMarkdown(d, { variant: 'stragiudiziale' });
    expect(md).toContain('con il suo consenso, in presenza di sua madre');
  });

  it('blocco dati periziando riga per riga (nato/residente, C.F., MAIL, TEL, Avvocato)', () => {
    const md = renderHeaderMarkdown(stragHeader(), { variant: 'stragiudiziale' });
    expect(md).toContain('**Carla Fittizia**');
    expect(md).toContain('Nato/a a Verona il 01/01/2000 e residente a Verona, via Esempio 2');
    expect(md).toContain('C.F. XXXXXX00X00X000X');
    expect(md).toContain('MAIL: carla@esempio.it');
    expect(md).toContain('TEL: 333 0000000');
    expect(md).toContain('Avvocato di parte: Avv. Franca Fittizia');
  });

  it('riga scopo "Al fine di valutare le lesioni patite..."', () => {
    const md = renderHeaderMarkdown(stragHeader(), { variant: 'stragiudiziale' });
    expect(md).toContain('Al fine di valutare le lesioni patite in occasione di caduta accidentale occorso in data 12/09/2025 in ambito di responsabilità civile.');
  });

  it('NESSUN riferimento al tribunale (regola assoluta stragiudiziale)', () => {
    const md = renderHeaderMarkdown(stragHeader(), { variant: 'stragiudiziale' });
    expect(md).not.toMatch(/tribunale|giudice|R\.G\.|ricorrente|resistente/i);
  });

  it('campi critici mancanti → [da compilare dal perito], mai inventati', () => {
    const md = renderHeaderMarkdown(emptyHeader(), { variant: 'stragiudiziale' });
    expect(md).toContain('[da compilare dal perito]');
    expect(md).not.toContain('### ');
  });
});
