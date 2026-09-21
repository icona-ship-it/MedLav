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

import { reclassifyPricelessExpenseEvents, foldPrognosisIntoCertificate, RECLASSIFIED_EXPENSE_NOTE } from './event-merges';

describe('reclassifyPricelessExpenseEvents — prestazioni senza importo non sono spese', () => {
  it('seduta di fisioterapia senza importo → «terapia» corrente con nota; visita senza importo → «visita»', () => {
    const out = reclassifyPricelessExpenseEvents([
      ev({ documentId: 'st', rowId: 'a', eventType: 'spesa_medica', temporalScope: 'retrospettivo', title: 'Seduta riabilitazione fisiochinesiterapia 90 minuti', description: 'Seduta del 15/05/2026 alle 15:30 presso il Centro Fisioterapico Esempi S.R.L.', sourceText: '1. Seduta di riabilitazione fisiochinesiterapia (90 minuti) del 15/05/2026 15:30' }),
      ev({ documentId: 'st', rowId: 'b', eventType: 'spesa_medica', title: 'Visita di controllo ortopedica', description: 'Controllo del 03/06/2026.', sourceText: 'Visita di controllo 03/06/2026' }),
    ]);
    expect(out.map((e) => [e.eventType, e.temporalScope, e.mutated])).toEqual([['terapia', 'corrente', true], ['visita', 'corrente', true]]);
    expect(out[0].reliabilityNotes).toBe(RECLASSIFIED_EXPENSE_NOTE);
  });
  it('MAI riclassificare: importo presente, lessico fiscale presente, o nessun lessico di prestazione', () => {
    const keep = reclassifyPricelessExpenseEvents([
      ev({ documentId: 'f', rowId: 'a', eventType: 'spesa_medica', title: 'Seduta fisioterapia', description: 'Ricevuta n. 12', sourceText: 'Seduta fisioterapia € 45,00' }),
      ev({ documentId: 'f', rowId: 'b', eventType: 'spesa_medica', title: 'Trattamento manuale', description: 'Fattura 3/2026 pagata', sourceText: 'Trattamento manuale — fattura' }),
      ev({ documentId: 'f', rowId: 'c', eventType: 'spesa_medica', title: 'Plantare su misura', description: 'Ordine plantare', sourceText: 'plantare su misura' }),
      ev({ documentId: 'f', rowId: 'd', eventType: 'spesa_medica', title: 'Sedute fisioterapia', description: 'Totale 10 sedute', sourceText: 'Totale sedute 10' }),
    ]);
    expect(keep.every((e) => e.eventType === 'spesa_medica' && !e.mutated)).toBe(true);
  });
});

describe('foldPrognosisIntoCertificate — la prognosi sta nel certificato, non è un evento datato all’inizio del periodo', () => {
  it('«Prognosi di 40 giorni» (altro, 18.04) entra nel certificato del 20.04 dello stesso documento', () => {
    const out = foldPrognosisIntoCertificate([
      ev({ documentId: 'c', rowId: 'p', eventType: 'altro', eventDate: '2026-04-18', title: 'Prognosi di 40 giorni di inabilità temporanea post trauma', description: 'Prognosi di 40 giorni a decorrere dal 18/04/2026.', sourceText: "Prognosi giorni s.c. 40 giorni (quaranta) dall'incidente.", sourcePages: [1] }),
      ev({ documentId: 'c', rowId: 'k', eventType: 'certificato', eventDate: '2026-04-20', title: 'Certificato medico per trauma distorsivo', description: 'Certificato emesso il 20/04/2026.', sourcePages: [1] }),
      ev({ documentId: 'c2', rowId: 'k2', eventType: 'certificato', eventDate: '2026-06-30', title: 'Certificato definitivo', description: 'Guarigione.' }),
    ]);
    expect(out.map((e) => e.rowId)).toEqual(['k', 'k2']);
    expect(out[0].description).toContain("Prognosi: Prognosi giorni s.c. 40 giorni (quaranta) dall'incidente.");
    expect(out[0].absorbedRowIds).toEqual(['p']);
    expect(out[0].mutated).toBe(true);
  });
  it('senza un certificato nello stesso documento (o con certificato precedente) la voce resta; una prognosi già nel testo non viene ripetuta', () => {
    const alone = foldPrognosisIntoCertificate([
      ev({ documentId: 'ps', rowId: 'p', eventType: 'altro', title: 'Prognosi 7 giorni' }),
      ev({ documentId: 'ps', rowId: 'k', eventType: 'certificato', eventDate: '2026-04-10', title: 'Certificato precedente' }),
    ]);
    expect(alone).toHaveLength(2);
    const dup = foldPrognosisIntoCertificate([
      ev({ documentId: 'c', rowId: 'p', eventType: 'altro', title: 'Prognosi 40 giorni', sourceText: 'Prognosi giorni s.c. 40 giorni', sourcePages: [1] }),
      ev({ documentId: 'c', rowId: 'k', eventType: 'certificato', eventDate: '2026-04-20', title: 'Certificato', description: 'Prognosi giorni s.c. 40 giorni (quaranta).', sourcePages: [1] }),
    ]);
    expect(dup).toHaveLength(1);
    expect(dup[0].description).toBe('Prognosi giorni s.c. 40 giorni (quaranta).');
  });
});

describe('mergeCrossDocumentDuplicates — menzioni (misura locale 2026-09-21)', () => {
  it('il «medico» di una menzione è l’autore del certificato: non blocca la fusione con la fonte primaria', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'ps', rowId: 'p', title: 'Accesso in Pronto Soccorso per trauma contusivo-distorsivo caviglia destra post incidente stradale', doctor: 'Dott.ssa Maria Esempi', diagnosis: 'Trauma distorsivo tibio-tarsica destra' }),
      ev({ documentId: 'cert', rowId: 'c', temporalScope: 'retrospettivo', title: 'Valutazione in Pronto Soccorso per trauma distorsivo tibio-tarsico destro', doctor: 'Dott. Nicolò Demprova', diagnosis: 'Trauma distorsico tibio-tarsico destro', documentLabel: 'Certificato Medico' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].rowId).toBe('p');
    expect(out[0].doctor).toBe('Dott.ssa Maria Esempi');
  });
  it('una menzione generica («altro»: incidente stradale con trauma…) rientra nell’accesso in PS dello stesso giorno; due primarie di famiglia diversa no', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'ps', rowId: 'p', title: 'Accesso in Pronto Soccorso per trauma contusivo-distorsivo caviglia destra post incidente stradale' }),
      ev({ documentId: 'cert', rowId: 'c', eventType: 'altro', temporalScope: 'retrospettivo', title: 'Incidente stradale con trauma distorsivo tibio-tarsico destro' }),
    ]);
    expect(out.map((e) => e.rowId)).toEqual(['p']);
    const keep = mergeCrossDocumentDuplicates([
      ev({ documentId: 'ps', rowId: 'p', title: 'Visita ortopedica caviglia destra' }),
      ev({ documentId: 'rad', rowId: 'r', eventType: 'esame', title: 'RX caviglia destra' }),
    ]);
    expect(keep).toHaveLength(2);
  });
  it('due fonti primarie con medici diversi restano separate', () => {
    const out = mergeCrossDocumentDuplicates([
      ev({ documentId: 'a', rowId: 'a', title: 'Visita ortopedica caviglia destra', doctor: 'Dott. Rossi Esempi' }),
      ev({ documentId: 'b', rowId: 'b', title: 'Visita ortopedica caviglia destra', doctor: 'Dott.ssa Bianchi Esempi' }),
    ]);
    expect(out).toHaveLength(2);
  });
});

import { foldPrescriptionsIntoVisit } from './event-merges';

describe('foldPrescriptionsIntoVisit — le prescrizioni date in visita stanno nella visita', () => {
  it('visita + prescrizione esami + prescrizione terapia dello stesso giorno e documento → una voce', () => {
    const out = foldPrescriptionsIntoVisit([
      ev({ documentId: 'r', rowId: 'v', eventDate: '2026-05-22', eventType: 'visita', title: 'Visita oncologica di controllo', description: 'EO nella norma.' }),
      ev({ documentId: 'r', rowId: 'p1', eventDate: '2026-05-22', eventType: 'prescrizione', title: 'Prescrizione esami di stadiazione', description: 'Si prescrive scintigrafia ossea.' }),
      ev({ documentId: 'r', rowId: 'p2', eventDate: '2026-05-22', eventType: 'terapia', title: 'Prescrizione terapia ormonale', description: 'Si prescrive letrozolo 2,5 mg/die.' }),
    ]);
    expect(out.map((e) => e.rowId)).toEqual(['v']);
    expect(out[0].description).toContain('Prescrizione esami di stadiazione: Si prescrive scintigrafia ossea.');
    expect(out[0].description).toContain('letrozolo');
    expect(out[0].absorbedRowIds).toEqual(['p1', 'p2']);
  });
  it('MAI piegare: due visite lo stesso giorno (ambiguo), terapia eseguita (seduta) senza lessico di prescrizione, documento o giorno diversi, menzioni', () => {
    const untouched = [
      ev({ documentId: 'r', rowId: 'v1', eventDate: '2026-05-22', eventType: 'visita', title: 'Visita ortopedica' }),
      ev({ documentId: 'r', rowId: 'v2', eventDate: '2026-05-22', eventType: 'visita', title: 'Visita fisiatrica' }),
      ev({ documentId: 'r', rowId: 'p', eventDate: '2026-05-22', eventType: 'prescrizione', title: 'Prescrizione plantari', description: 'Si prescrivono plantari.' }),
      ev({ documentId: 's', rowId: 't', eventDate: '2026-05-23', eventType: 'terapia', title: 'Seduta di fisioterapia', description: 'Seduta eseguita.' }),
      ev({ documentId: 's', rowId: 'v3', eventDate: '2026-05-23', eventType: 'visita', title: 'Visita fisiatrica' }),
      ev({ documentId: 'c', rowId: 'm', eventDate: '2026-05-23', eventType: 'prescrizione', title: 'Prescrizione riferita', temporalScope: 'retrospettivo' }),
    ];
    expect(foldPrescriptionsIntoVisit(untouched).map((e) => e.rowId)).toEqual(['v1', 'v2', 'p', 't', 'v3', 'm']);
  });
});
