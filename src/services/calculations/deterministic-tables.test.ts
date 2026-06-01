import { describe, it, expect } from 'vitest';
import { formatExpenseTable, formatChronologyIndex, type DeterministicTableEvent } from './deterministic-tables';

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
