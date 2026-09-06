/**
 * Invariante anti CSV formula-injection (audit 2026-08-11, H-P2).
 * Una cella che inizia con = + - @ non deve mai essere una formula eseguibile in
 * Excel: i contenuti vengono dall'estrazione LLM su OCR (anche di controparte).
 */
import { describe, it, expect } from 'vitest';
import { generateCsvExport } from './csv-export';

function ev(over: Partial<Parameters<typeof generateCsvExport>[0][number]> = {}) {
  return {
    order_number: 1, event_date: '2026-03-15', date_precision: 'giorno',
    event_type: 'visita', title: 'Visita', description: 'ok', source_type: 'referto',
    diagnosis: null, doctor: null, facility: null, confidence: 90, requires_verification: false,
    ...over,
  };
}

describe('generateCsvExport — anti formula-injection', () => {
  it('una descrizione =HYPERLINK non produce una cella-formula (prefissata da escapeFormulae)', () => {
    const csv = generateCsvExport([ev({ description: '=HYPERLINK("http://evil","x")' })]);
    // Nessuna cella inizia con '=' subito dopo un separatore o a inizio riga.
    expect(csv).not.toMatch(/(^|[;\n])=HYPERLINK/);
    // Il payload testuale è comunque conservato (solo neutralizzato).
    expect(csv).toContain('HYPERLINK');
  });

  it('neutralizza anche i prefissi + - @', () => {
    for (const payload of ['+1+1', '-2+3', '@SUM(A1)']) {
      const csv = generateCsvExport([ev({ title: payload })]);
      expect(csv).not.toMatch(new RegExp(`(^|[;\\n])\\${payload[0]}`));
    }
  });

  it('una descrizione normale non viene alterata', () => {
    const csv = generateCsvExport([ev({ description: 'Frattura composta del radio' })]);
    expect(csv).toContain('Frattura composta del radio');
  });
});

describe('generateCsvExport — colonna Ambito temporale (0034)', () => {
  it('etichetta in italiano per ogni scope; assente = Avvenuto nel documento', () => {
    const base = { order_number: 1, event_date: '2026-05-22', date_precision: 'giorno', event_type: 'visita', title: 'V', description: 'd', source_type: 'referto_controllo', diagnosis: null, doctor: null, facility: null, confidence: 90, requires_verification: false };
    const csv = generateCsvExport([
      { ...base },
      { ...base, order_number: 2, temporal_scope: 'retrospettivo' },
      { ...base, order_number: 3, temporal_scope: 'programmato' },
    ]);
    expect(csv).toContain('Ambito temporale');
    expect(csv).toContain('Avvenuto nel documento');
    expect(csv).toContain('Riferito (anamnesi / storia)');
    expect(csv).toContain('Programmato / previsto');
  });
});

describe('colonna Pagine (2026-09-06)', () => {
  it('riporta le pagine di origine dell\'evento', () => {
    const csv = generateCsvExport([{ order_number: 1, event_date: '2026-02-10', date_precision: 'giorno', event_type: 'visita', title: 'Accesso PS', description: 'x', source_type: 'cartella_clinica', diagnosis: null, doctor: null, facility: null, confidence: 90, requires_verification: false, temporal_scope: 'corrente', source_pages: '[3]' }]);
    expect(csv).toContain('Pagine');
    expect(csv).toContain('pag. 3');
  });
});
