import { describe, it, expect } from 'vitest';
import { clinicalCore, clinicalCoreMatch, isSameFactAcrossDocuments, mergeCrossDocumentDuplicates } from './event-merges';
import type { WorkEvent } from './event-consolidator';

const ev = (o: Partial<WorkEvent> & { documentId: string; rowId: string }): WorkEvent => ({
  eventDate: '2026-04-18', datePrecision: 'giorno', eventType: 'visita', title: 'x', description: 'descrizione',
  sourceType: 'cartella_clinica', diagnosis: null, doctor: null, facility: null, confidence: 90, requiresVerification: false,
  reliabilityNotes: null, sourceText: 'src', sourcePages: [1], temporalScope: 'corrente', ...o,
});

describe('clinicalCore — il nucleo clinico ignora come il fatto è raccontato', () => {
  it('tibio-tarsica = caviglia, destro/destra = dx, pronto soccorso = ps; le parole di cornice spariscono', () => {
    expect([...clinicalCore('Valutazione PS per trauma distorsivo tibio-tarsico destro post incidente stradale')].sort())
      .toEqual([...clinicalCore('Accesso Pronto Soccorso per incidente stradale – trauma distorsivo caviglia destra')].sort());
    expect(clinicalCoreMatch('Pregressa artroscopia caviglia destra (riferita in anamnesi)', 'Intervento di artroscopia caviglia destra')).toBe(true);
  });
  it('distretti diversi o specialità diverse NON combaciano', () => {
    expect(clinicalCoreMatch('RX caviglia destra', 'RX ginocchio destro')).toBe(false);
    expect(clinicalCoreMatch('Visita ortopedica', 'Visita fisiatrica')).toBe(false);
    expect(clinicalCoreMatch('RX torace', 'RX bacino')).toBe(false);
  });
});

describe('mergeCrossDocumentDuplicates — collaudo 2026-09-18: un fatto = una voce', () => {
  it('accesso in PS (verbale) + menzione nel certificato + menzione nel referto → una voce, la fonte primaria vince, le fonti citate', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'cert', rowId: 'c', eventType: 'ricovero', temporalScope: 'retrospettivo', sourceType: 'altro', title: 'Valutazione PS per trauma distorsivo tibio-tarsico destro post incidente stradale', confidence: 90 }),
      ev({ documentId: 'ps', rowId: 'p', eventType: 'ricovero', title: 'Accesso PS per incidente stradale – trauma distorsivo caviglia destra', confidence: 50, doctor: 'Dott.ssa Maria Esempi' }),
      ev({ documentId: 'ref', rowId: 'r', eventType: 'diagnosi', temporalScope: 'retrospettivo', sourceType: 'referto_controllo', title: 'Trauma distorsivo tibio-tarsica destra (riferito in anamnesi)', diagnosis: 'Trauma distorsivo tibio-tarsica destra' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].rowId).toBe('p');
    expect(out[0].absorbedRowIds?.sort()).toEqual(['c', 'r']);
    expect(out[0].temporalScope).toBe('corrente');
    expect(out[0].reliabilityNotes).toContain('Citato anche in: Altro');
    expect(out[0].reliabilityNotes).toContain('Referto Controllo');
    expect(out[0].diagnosis).toBe('Trauma distorsivo tibio-tarsica destra');
    expect(out[0].confidence).toBe(50); // una menzione non alza la confidence della fonte primaria
    expect(out[0].mutated).toBe(true);
  });
  it('la stessa visita su due foto dello stesso referto → una voce con le due descrizioni', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'f1', rowId: 'a', eventDate: '2026-05-22', title: 'Visita ortopedica per trauma distorsivo tibio-tarsica destra e dolore residuo', description: 'Motivo: dolore residuo.', sourceType: 'referto_controllo' }),
      ev({ documentId: 'f2', rowId: 'b', eventDate: '2026-05-22', title: 'Visita ortopedica ambulatoriale per esiti trauma distorsivo caviglia destra', description: 'Esame obiettivo: edema perimalleolare.', sourceType: 'referto_controllo', confidence: 95 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].description).toContain('dolore residuo');
    expect(out[0].description).toContain('edema perimalleolare');
    expect(out[0].confidence).toBe(95);
  });
  it('due menzioni dello stesso intervento pregresso → una voce (resta retrospettivo, descrizione più ricca)', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'f2', rowId: 'a', eventDate: '2026-03-03', eventType: 'intervento', temporalScope: 'retrospettivo', title: 'Pregressa artroscopia caviglia destra (riferita in anamnesi)', description: 'breve' }),
      ev({ documentId: 'f1', rowId: 'b', eventDate: '2026-03-03', eventType: 'intervento', temporalScope: 'retrospettivo', title: 'Intervento di artroscopia caviglia destra', description: 'Intervento eseguito il 03.03.2026 presso altra struttura, decorso regolare.' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].temporalScope).toBe('retrospettivo');
    expect(out[0].description).toContain('decorso regolare');
  });
  it('un controllo programmato assorbito dalla visita avvenuta lo stesso giorno', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'cert', rowId: 'a', eventDate: '2026-09-30', eventType: 'follow-up', temporalScope: 'programmato', title: 'Controllo ortopedico programmato' }),
      ev({ documentId: 'ref', rowId: 'b', eventDate: '2026-09-30', eventType: 'visita', title: 'Visita di controllo ortopedica', sourceType: 'referto_controllo' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].rowId).toBe('b');
  });
  it('MAI fondere: lati opposti, orari diversi, diagnosi discordanti, medici diversi, date/precisioni diverse, spese, stesso documento', () => {
    const pairs: Array<[Partial<WorkEvent>, Partial<WorkEvent>]> = [
      [{ title: 'RX caviglia destra', eventType: 'esame' }, { title: 'RX caviglia sinistra', eventType: 'esame' }],
      [{ title: 'ECG di controllo mattina' }, { title: 'ECG di controllo pomeriggio' }],
      [{ title: 'Visita ortopedica caviglia destra', diagnosis: 'Frattura malleolo' }, { title: 'Visita ortopedica caviglia destra', diagnosis: 'Distorsione' }],
      [{ title: 'Visita ortopedica caviglia destra', doctor: 'Dott. Rossi Esempi' }, { title: 'Visita ortopedica caviglia destra', doctor: 'Dott.ssa Bianchi Esempi' }],
      [{ title: 'Visita ortopedica caviglia destra', eventDate: '2026-04-19' }, { title: 'Visita ortopedica caviglia destra' }],
      [{ title: 'Visita ortopedica caviglia destra', datePrecision: 'mese' }, { title: 'Visita ortopedica caviglia destra' }],
      [{ title: 'Fattura visita ortopedica', eventType: 'spesa_medica' }, { title: 'Fattura visita ortopedica', eventType: 'spesa_medica' }],
      [{ title: 'Visita ortopedica caviglia destra', documentId: 'same' }, { title: 'Visita ortopedica caviglia destra', documentId: 'same' }],
    ];
    for (const [pa, pb] of pairs) {
      const a = ev({ documentId: 'd1', rowId: 'a', ...pa });
      const b = ev({ documentId: 'd2', rowId: 'b', ...pb });
      expect(isSameFactAcrossDocuments(a, b), `${a.title} / ${b.title}`).toBe(false);
    }
  });
  it('tre documenti, due fatti: la RX resta separata dall’accesso in PS dello stesso giorno', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'ps', rowId: 'p', eventType: 'ricovero', title: 'Accesso PS per trauma distorsivo caviglia destra' }),
      ev({ documentId: 'ps', rowId: 'x', eventType: 'esame', title: 'RX caviglia destra in PS' }),
      ev({ documentId: 'rad', rowId: 'r', eventType: 'esame', title: 'RX caviglia destra', sourceType: 'esame_strumentale' }),
      ev({ documentId: 'cert', rowId: 'c', eventType: 'ricovero', temporalScope: 'retrospettivo', title: 'Valutazione presso PS per trauma distorsivo caviglia destra' }),
    ]);
    expect(out.map((e) => e.rowId).sort()).toEqual(['p', 'r']); // la RX del referto radiologico vince su quella citata nel verbale
    expect(out.find((e) => e.rowId === 'r')?.absorbedRowIds).toEqual(['x']);
  });
});

describe('mergeCrossDocumentDuplicates — giro avversariale', () => {
  it('sigle con cifre restano decisive: «Frattura L1 tipo A1» ≠ «Frattura L1 tipo B2.2»; «D11-L3» ≠ «L4-S1»', () => {
    expect(clinicalCoreMatch('Frattura L1 tipo A1', 'Frattura L1 tipo B2.2')).toBe(false);
    expect(clinicalCoreMatch('Spondilodesi D11-L3', 'Spondilodesi L4-S1')).toBe(false);
    expect(clinicalCoreMatch('Frattura L1 tipo A1', 'Frattura L1 tipo A1')).toBe(true);
    expect(clinicalCoreMatch('Frattura L1 tipo A1', 'Frattura L1 tipo A3')).toBe(false);
    expect(clinicalCoreMatch('Prognosi 40 giorni', 'Prognosi 30 giorni')).toBe(false);
    expect(clinicalCoreMatch('RX caviglia destra 2 proiezioni', 'RX caviglia destra')).toBe(true);
  });
  it('le note usano l’etichetta del DOCUMENTO quando c’è (non il sourceType scelto dal modello)', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'ps', rowId: 'p', eventType: 'ricovero', title: 'Accesso PS per trauma distorsivo caviglia destra', documentLabel: 'Cartella Clinica' }),
      ev({ documentId: 'cert', rowId: 'c', eventType: 'ricovero', temporalScope: 'retrospettivo', sourceType: 'cartella_clinica', title: 'Valutazione PS per trauma distorsivo caviglia destra', documentLabel: 'Certificato Medico' }),
    ]);
    expect(out[0].reliabilityNotes).toContain('Citato anche in: Certificato Medico');
    expect(out[0].reliabilityNotes).not.toContain('Cartella Clinica («');
  });
  it('catena di tre: quando il sopravvissuto cambia a metà, tutte le righe assorbite finiscono nell’unico sopravvissuto', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'd1', rowId: 'a', eventType: 'intervento', temporalScope: 'retrospettivo', title: 'Pregressa artroscopia caviglia destra', confidence: 60 }),
      ev({ documentId: 'd2', rowId: 'b', eventType: 'intervento', temporalScope: 'retrospettivo', title: 'Artroscopia caviglia destra riferita', confidence: 70 }),
      ev({ documentId: 'd3', rowId: 'c', eventType: 'intervento', title: 'Artroscopia caviglia destra', sourceType: 'cartella_clinica', confidence: 95 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].rowId).toBe('c');
    expect(out[0].absorbedRowIds?.sort()).toEqual(['a', 'b']);
    expect(out[0].temporalScope).toBe('corrente');
  });
  it('la data sentinella (nessuna data) non fonde mai', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'd1', rowId: 'a', eventDate: '1900-01-01', datePrecision: 'sconosciuta', title: 'Visita ortopedica' }),
      ev({ documentId: 'd2', rowId: 'b', eventDate: '1900-01-01', datePrecision: 'sconosciuta', title: 'Visita ortopedica' }),
    ]);
    expect(out).toHaveLength(2);
  });
});

import { collapsePsEpisodes } from './event-merges';

describe('collapsePsEpisodes — un accesso in Pronto Soccorso = una voce (collaudo 2026-09-18)', () => {
  const ps = (o: Partial<WorkEvent> & { rowId: string }) => ev({ documentId: 'verbale', ...o });
  it('accesso + triage + visita ortopedica + dimissione → una «visita» che contiene tutto; la RX resta voce propria', () => {
    const out = collapsePsEpisodes([
      ps({ rowId: 'acc', eventType: 'ricovero', title: 'Accesso PS per incidente stradale – trauma distorsivo caviglia destra', description: 'Giunge in Pronto Soccorso il 18/04/2026 alle ore 17:56 per incidente stradale.', confidence: 50, doctor: 'Dott.ssa Maria Esempi', requiresVerification: true }),
      ps({ rowId: 'tri', eventType: 'visita', title: 'Triage e gestione iniziale in PS', description: 'Ore 18:05: paziente vigile. Applicato ghiaccio.' }),
      ps({ rowId: 'rx', eventType: 'esame', title: 'RX caviglia destra in PS', description: 'Ore 19:20: eseguita RX, non lesioni ossee.' }),
      ps({ rowId: 'ort', eventType: 'referto', title: 'Valutazione ortopedica per trauma distorsivo caviglia destra', description: 'ROM conservato, si lascia libero.', diagnosis: 'Trauma distorsivo tibio-tarsica destra' }),
      ps({ rowId: 'dim', eventType: 'referto', title: 'Dimissione da PS con diagnosi di trauma distorsivo tibio-tarsica destra', description: 'Dimissione a domicilio alle ore 20:57.', diagnosis: 'Trauma distorsivo tibio-tarsica destra', confidence: 90 }),
    ]);
    expect(out.map((e) => e.rowId)).toEqual(['acc', 'rx']);
    const acc = out[0];
    expect(acc.eventType).toBe('visita');
    expect(acc.title).toBe('Accesso in Pronto Soccorso: Trauma distorsivo tibio-tarsica destra');
    expect(acc.absorbedRowIds?.sort()).toEqual(['dim', 'ort', 'tri']);
    expect(acc.description).toContain('alle ore 17:56');
    expect(acc.description).toContain('Triage e gestione iniziale in PS: Ore 18:05');
    expect(acc.description).toContain('ROM conservato');
    expect(acc.description).toContain('Dimissione a domicilio alle ore 20:57');
    expect(acc.description.indexOf('18:05')).toBeLessThan(acc.description.indexOf('20:57'));
    expect(acc.requiresVerification).toBe(true);
    expect(acc.confidence).toBe(90);
    expect(acc.doctor).toBe('Dott.ssa Maria Esempi');
    expect(acc.mutated).toBe(true);
  });
  it('se il testo attesta il ricovero in reparto, la voce resta «ricovero»', () => {
    const out = collapsePsEpisodes([
      ps({ rowId: 'acc', eventType: 'ricovero', title: 'Accesso in PS per trauma cranico', description: 'Ore 22:10 giunge in PS.' }),
      ps({ rowId: 'dim', eventType: 'referto', title: 'Esito PS', description: 'Viene ricoverato in reparto di Neurochirurgia per osservazione.' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].eventType).toBe('ricovero');
  });
  it('MAI collassare: giorni diversi, cartella di reparto senza PS, menzioni anamnestiche, documenti diversi', () => {
    const untouched = [
      ps({ rowId: 'a', eventType: 'ricovero', title: 'Accesso PS per trauma', eventDate: '2026-04-18' }),
      ps({ rowId: 'b', eventType: 'referto', title: 'Dimissione dal PS', eventDate: '2026-04-19' }),
      ev({ documentId: 'cartella', rowId: 'c', eventType: 'ricovero', title: 'Ricovero in Ortopedia', eventDate: '2026-05-10' }),
      ev({ documentId: 'cartella', rowId: 'd', eventType: 'visita', title: 'Visita anestesiologica preoperatoria', eventDate: '2026-05-10' }),
      ev({ documentId: 'cert', rowId: 'e', eventType: 'ricovero', title: 'Valutazione presso PS', temporalScope: 'retrospettivo' }),
      ev({ documentId: 'cert', rowId: 'f', eventType: 'diagnosi', title: 'Trauma distorsivo (riferito)', temporalScope: 'retrospettivo' }),
      ev({ documentId: 'altro-doc', rowId: 'g', eventType: 'visita', title: 'Consulenza ortopedica in PS' }),
    ];
    expect(collapsePsEpisodes(untouched).map((e) => e.rowId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
  it('senza diagnosi il titolo resta descrittivo e non perde il distretto', () => {
    const out = collapsePsEpisodes([
      ps({ rowId: 'acc', eventType: 'ricovero', title: 'Ricovero PS per trauma ginocchio destro post caduta', description: 'Ore 9:00 giunge.' }),
      ps({ rowId: 'tri', eventType: 'visita', title: 'Triage', description: 'Codice verde.' }),
    ]);
    expect(out[0].title).toBe('Accesso in Pronto Soccorso — trauma ginocchio destro post caduta');
  });
});
