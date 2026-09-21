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
