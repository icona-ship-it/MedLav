import { describe, it, expect } from 'vitest';
import {
  formatExpenseTable,
  formatChronologyIndex,
  formatDocumentazioneSanitaria,
  expandDeterministicBlocks,
  hasDeterministicMarkers,
  toDeterministicEvents,
  toDeterministicDocs,
  DETERMINISTIC_MARKERS,
  type DeterministicTableEvent,
  type DeterministicDoc,
} from './deterministic-tables';

function ev(partial: Partial<DeterministicTableEvent>): DeterministicTableEvent {
  return {
    event_date: '2024-03-10',
    event_type: 'visita',
    title: 'Evento',
    description: '',
    ...partial,
  };
}

describe('formatExpenseTable', () => {
  it('returns empty string when there are no spesa_medica events', () => {
    expect(formatExpenseTable([])).toBe('');
    expect(formatExpenseTable([ev({ event_type: 'visita' }), ev({ event_type: 'esame' })])).toBe('');
  });

  it('lists only spesa_medica events with a parsed amount and a total', () => {
    const out = formatExpenseTable([
      ev({ event_type: 'spesa_medica', event_date: '2024-01-05', title: 'Fattura visita ortopedica', description: 'Importo € 150,00', facility: 'Studio Rossi' }),
      ev({ event_type: 'spesa_medica', event_date: '2024-02-10', title: 'Ricevuta RX', description: '€ 80,50', facility: 'Centro Radiologico' }),
      ev({ event_type: 'visita', title: 'NON una spesa' }),
    ]);
    expect(out).toContain('| Data | Descrizione | Struttura | Importo |');
    expect(out).toContain('Fattura visita ortopedica');
    expect(out).toContain('Studio Rossi');
    expect(out).not.toContain('NON una spesa'); // non-expense event excluded
    // Total = 150 + 80.50 = 230.50 → italian currency
    expect(out).toMatch(/Totale/);
    expect(out).toMatch(/230,50/);
  });

  it('shows — for sentinel/undated dates and for unparsable amounts (+ partial note)', () => {
    const out = formatExpenseTable([
      ev({ event_type: 'spesa_medica', event_date: '1900-01-01', title: 'Bollo', description: 'marca da bollo 2 euro' }),
      ev({ event_type: 'spesa_medica', event_date: '2024-02-10', title: 'Visita senza importo', description: 'nessun importo indicato', facility: null }),
    ]);
    // sentinel date → —
    expect(out).not.toContain('1900');
    expect(out).toContain('—');
    // at least one unparsable amount → partial-total note
    expect(out).toMatch(/importi non rilevati/);
  });

  it('escapes pipes in cells so the table never breaks', () => {
    const out = formatExpenseTable([
      ev({ event_type: 'spesa_medica', title: 'Visita | con pipe', description: '€ 50,00', facility: 'A | B' }),
    ]);
    expect(out).toContain('Visita \\| con pipe');
    expect(out).toContain('A \\| B');
  });
});

describe('formatChronologyIndex', () => {
  it('returns empty string when no clinical events', () => {
    expect(formatChronologyIndex([])).toBe('');
    // only non-clinical (expense/admin) → excluded → empty
    expect(formatChronologyIndex([
      ev({ event_type: 'spesa_medica' }),
      ev({ event_type: 'documento_amministrativo' }),
    ])).toBe('');
  });

  it('lists clinical events chronologically, excludes expenses, undated last', () => {
    const out = formatChronologyIndex([
      ev({ event_type: 'visita', event_date: '2024-05-01', title: 'Controllo', facility: 'Osp. A' }),
      ev({ event_type: 'spesa_medica', event_date: '2024-04-01', title: 'Fattura' }),
      ev({ event_type: 'esame', event_date: '2024-01-15', title: 'RX', facility: 'Centro B' }),
      ev({ event_type: 'visita', event_date: '1900-01-01', title: 'Visita senza data' }),
    ]);
    expect(out).toContain('| Data | Tipo | Autore/Struttura | Titolo |');
    expect(out).not.toContain('Fattura'); // expense excluded
    const rxIdx = out.indexOf('RX');
    const controlloIdx = out.indexOf('Controllo');
    const undatedIdx = out.indexOf('Visita senza data');
    expect(rxIdx).toBeLessThan(controlloIdx); // 15 Jan before 1 May
    expect(undatedIdx).toBeGreaterThan(controlloIdx); // undated at the bottom
    expect(out).toContain('—'); // undated date cell
  });

  it('prettifies the event type and escapes pipes', () => {
    const out = formatChronologyIndex([
      ev({ event_type: 'esame_strumentale', event_date: '2024-01-15', title: 'TAC | torace', facility: 'X' }),
    ]);
    expect(out).toContain('Esame strumentale');
    expect(out).toContain('TAC \\| torace');
  });
});

describe('expandDeterministicBlocks', () => {
  const expenses: DeterministicTableEvent[] = [
    ev({ event_type: 'spesa_medica', event_date: '2024-01-05', title: 'Fattura', description: '€ 100,00' }),
  ];

  it('is a no-op on legacy reports without markers (idempotent)', () => {
    const md = '## Epicrisi\n\nTesto senza marker.';
    expect(hasDeterministicMarkers(md)).toBe(false);
    expect(expandDeterministicBlocks(md, expenses)).toBe(md);
    // idempotent: running twice changes nothing
    const once = expandDeterministicBlocks(md, expenses);
    expect(expandDeterministicBlocks(once, expenses)).toBe(once);
  });

  it('replaces the SPESE marker with the rendered expense table', () => {
    const md = `## Spese mediche\n\n${DETERMINISTIC_MARKERS.SPESE}`;
    const out = expandDeterministicBlocks(md, expenses);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.SPESE);
    expect(out).toContain('| Data | Descrizione | Struttura | Importo |');
    expect(out).toContain('Fattura');
  });

  it('replaces ITT/ITP and CRONO markers', () => {
    const clinical: DeterministicTableEvent[] = [
      ev({ event_type: 'ricovero', event_date: '2024-01-01', title: 'Ricovero' }),
      ev({ event_type: 'dimissione', event_date: '2024-01-10', title: 'Dimissione' }),
    ];
    const md = `${DETERMINISTIC_MARKERS.ITT_ITP}\n\n${DETERMINISTIC_MARKERS.CRONO}`;
    const out = expandDeterministicBlocks(md, clinical);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.ITT_ITP);
    expect(out).not.toContain(DETERMINISTIC_MARKERS.CRONO);
    expect(out).toContain('Autore/Struttura'); // chrono table header
  });

  it('uses a fallback note when the data yields an empty table', () => {
    const md = DETERMINISTIC_MARKERS.SPESE;
    const out = expandDeterministicBlocks(md, []); // no expenses
    expect(out).not.toContain(DETERMINISTIC_MARKERS.SPESE);
    expect(out).toContain('Nessuna spesa medica documentata');
  });
});

describe('toDeterministicEvents (export mapping)', () => {
  it('maps DB rows and tolerates missing fields', () => {
    const out = toDeterministicEvents([
      { event_date: '2024-01-01', event_type: 'spesa_medica', title: 'X', description: 'Y', facility: 'F', order_number: 3 },
      { event_type: 'visita' }, // missing fields → safe defaults
    ]);
    expect(out[0]).toMatchObject({ event_date: '2024-01-01', event_type: 'spesa_medica', title: 'X', facility: 'F', order_number: 3 });
    expect(out[1]).toMatchObject({ event_date: '', event_type: 'visita', title: '', description: '', facility: null });
  });

  it('round-trips through expandDeterministicBlocks from loose rows', () => {
    const rows = [{ event_type: 'spesa_medica', event_date: '2024-01-05', title: 'Fattura', description: '€ 100,00' }];
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.SPESE, toDeterministicEvents(rows));
    expect(out).toContain('Fattura');
    expect(out).toContain('100,00');
  });
});

function doc(partial: Partial<DeterministicDoc>): DeterministicDoc {
  return {
    documentId: 'd1',
    fileName: 'referto.pdf',
    documentType: 'referto_specialistico',
    pages: [{ pageNumber: 1, ocrText: 'Testo referto.' }],
    ...partial,
  };
}

describe('formatDocumentazioneSanitaria (selective)', () => {
  it('lists EVERY clinical document analytically (type, filename, pages, date)', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ documentId: 'd1', fileName: 'rx.pdf', documentType: 'referto_specialistico' })],
      [ev({ document_id: 'd1', event_date: '2024-04-20' })],
    );
    expect(out).toContain('Documenti sanitari esaminati');
    expect(out).toContain('Referto Specialistico');
    expect(out).toContain('rx.pdf');
    expect(out).toContain('1 pagina');
  });

  it('quotes VERBATIM (blockquote) the sourceText of RELEVANT (T1/T2) events, with citation', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ documentId: 'd1', documentType: 'referto_specialistico' })],
      [ev({ document_id: 'd1', event_type: 'diagnosi', title: 'Diagnosi', event_date: '2024-04-20', source_text: 'Frattura pluriframmentaria del piatto tibiale laterale.' })],
    );
    expect(out).toContain('Riproduzione fedele');
    expect(out).toContain('> Frattura pluriframmentaria del piatto tibiale laterale.');
    expect(out).toContain('Diagnosi');
  });

  it('does NOT quote routine (T3) events (e.g. lab values)', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ documentId: 'd1', documentType: 'cartella_clinica' })],
      [ev({ document_id: 'd1', event_type: 'esame', source_type: 'esame_ematochimico', title: 'Emocromo', source_text: 'Hb 9.7 g/dL' })],
    );
    expect(out).not.toContain('Hb 9.7');
  });

  it('does NOT quote events without a source span', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ documentId: 'd1' })],
      [ev({ document_id: 'd1', event_type: 'diagnosi', source_text: null })],
    );
    expect(out).not.toContain('Riproduzione fedele');
  });

  it('orders the analytical list chronologically by the earliest dated event', () => {
    const docs = [doc({ documentId: 'late', fileName: 'b.pdf' }), doc({ documentId: 'early', fileName: 'a.pdf' })];
    const events: DeterministicTableEvent[] = [
      ev({ document_id: 'late', event_date: '2024-06-01' }),
      ev({ document_id: 'early', event_date: '2024-01-01' }),
    ];
    const out = formatDocumentazioneSanitaria(docs, events);
    expect(out.indexOf('a.pdf')).toBeLessThan(out.indexOf('b.pdf'));
  });

  it('excludes non-clinical document types (atti / perizie / spese)', () => {
    const docs = [
      doc({ documentId: 'a', fileName: 'cartella.pdf', documentType: 'cartella_clinica' }),
      doc({ documentId: 'b', fileName: 'memoria.pdf', documentType: 'memoria_difensiva' }),
    ];
    const out = formatDocumentazioneSanitaria(docs, []);
    expect(out).toContain('cartella.pdf');
    expect(out).not.toContain('memoria.pdf');
  });

  it('returns empty string when there are no clinical documents', () => {
    expect(formatDocumentazioneSanitaria([], [])).toBe('');
    expect(formatDocumentazioneSanitaria([doc({ documentType: 'memoria_difensiva' })], [])).toBe('');
  });

  it('a verbatim quote is blockquoted — pipes/headings inside survive without breaking sections', () => {
    const out = formatDocumentazioneSanitaria(
      [doc({ documentId: 'd1' })],
      [ev({ document_id: 'd1', event_type: 'diagnosi', title: 'Esito', event_date: '2024-04-20', source_text: '## REFERTO\n| Hb | 9.7 |' })],
    );
    // Every line is either an analytical bullet or a '> ' quote — none starts with '## '.
    for (const line of out.split('\n')) {
      expect(/^#{1,2}\s/.test(line)).toBe(false);
    }
    expect(out).toContain('REFERTO');
    expect(out).toContain('| Hb | 9.7 |');
    expect(out).not.toContain('\\|');
  });
});

describe('expandDeterministicBlocks — DOC_SANITARIA', () => {
  it('expands the DOC_SANITARIA marker with the selective documentation when docs are provided', () => {
    const docs = [doc({ documentId: 'd1' })];
    const events: DeterministicTableEvent[] = [ev({ document_id: 'd1', event_type: 'diagnosi', source_text: 'TESTO_MEDICO_VERBATIM' })];
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, events, docs);
    expect(out).toContain('TESTO_MEDICO_VERBATIM');
    expect(out).not.toContain('MEDLAV:DOC_SANITARIA');
  });

  it('LEAVES the marker untouched (invisible comment) when docs are NOT provided', () => {
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, []);
    expect(out).toBe(DETERMINISTIC_MARKERS.DOC_SANITARIA);
  });

  it('shows the empty fallback when docs are provided but empty', () => {
    const out = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, [], []);
    expect(out).toContain('Nessun documento sanitario disponibile');
  });

  it('is idempotent (re-expansion is a no-op once the marker is gone)', () => {
    const docs = [doc({})];
    const once = expandDeterministicBlocks(DETERMINISTIC_MARKERS.DOC_SANITARIA, [], docs);
    const twice = expandDeterministicBlocks(once, [], docs);
    expect(twice).toBe(once);
  });
});

describe('toDeterministicDocs (mapping)', () => {
  it('maps id→documentId and preserves pages', () => {
    const out = toDeterministicDocs([
      { id: 'x', fileName: 'f.pdf', documentType: 'cartella_clinica', pages: [{ pageNumber: 1, ocrText: 'T' }] },
    ]);
    expect(out[0]).toMatchObject({ documentId: 'x', fileName: 'f.pdf', documentType: 'cartella_clinica' });
    expect(out[0].pages[0]).toMatchObject({ pageNumber: 1, ocrText: 'T' });
  });
});
