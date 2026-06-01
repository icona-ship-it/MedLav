import { describe, it, expect } from 'vitest';
import {
  formatExpenseTable,
  formatChronologyIndex,
  expandDeterministicBlocks,
  hasDeterministicMarkers,
  toDeterministicEvents,
  DETERMINISTIC_MARKERS,
  type DeterministicTableEvent,
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
