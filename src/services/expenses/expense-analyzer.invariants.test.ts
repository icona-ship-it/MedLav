import { describe, it, expect } from 'vitest';
import { analyzeExpenses, collectSsnCosts, isSsrCostNotification } from './expense-analyzer';

/** Invarianti soldi (verifica definitiva 2026-09-06): il totale è SEMPRE la somma
 * delle righe mostrate; nessuna voce conta due volte (danneggiato E SSN); mai
 * importi negativi o NaN. Fuzz a seme fisso, fixture fittizie. */
function rng(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; }
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const TITLES = ['Fattura n. 12 visita ortopedica', 'Pagamento totale fattura n. 0295-0008', 'Acquisto tutore articolato', 'IVA 22% su tutore', 'Imposta di bollo',
  'Ticket RX polso', 'Pagamento bancomat fattura 26878', 'Spesa sanitaria per percorso di cura', 'Spesa sanitaria stimata per il percorso di cura', 'RM gomito destro - prestazione diagnostica',
  'Spesa sanitaria per prestazione fisioterapica', 'Ricevuta fisioterapia', 'Costo TC'];
const DESCS = ['euro 120,00', 'il SSR ha impiegato euro 521,35', 'Importo € 1.038,80', 'costo sostenuto dal Servizio Sanitario Regionale euro 27,90', 'pagata con bancomat euro 50,00', '', 'totale 366,00 EUR', 'euro 24272,60'];
const DATES = ['2024-11-13', '2024-11-14', '2025-01-24', '2025-09-13'];
const DOCS = ['a', 'b', 'c', null];

describe('invarianti — spese (fuzz, seme fisso, 3000 casi)', () => {
  it('totale = somma delle righe; nessuna voce sia in tabella danneggiato che in tabella SSN; importi ≥ 0 e finiti', () => {
    const r = rng(1234);
    for (let i = 0; i < 3000; i++) {
      const events = Array.from({ length: 1 + Math.floor(r() * 8) }, (_, k) => ({
        event_type: 'spesa_medica', title: `${pick(r, TITLES)} #${k}`, description: pick(r, DESCS), event_date: pick(r, DATES),
        facility: null, source_type: 'spese_mediche', document_id: pick(r, DOCS),
      }));
      const a = analyzeExpenses(events);
      const sum = a.items.reduce((s, it) => s + (it.amount ?? 0), 0);
      if (a.totalAmount === null) expect(a.items.every((it) => it.amount === null)).toBe(true);
      else expect(Math.abs(a.totalAmount - sum)).toBeLessThan(0.005);
      for (const it of a.items) { if (it.amount !== null) { expect(Number.isFinite(it.amount)).toBe(true); expect(it.amount).toBeGreaterThanOrEqual(0); } }
      const ssn = collectSsnCosts(events);
      for (const it of ssn.items) expect(a.items.some((x) => x.description === it.description && x.date === it.date && x.amount === it.amount), 'voce sia SSN che danneggiato').toBe(false);
      for (const ev of events) {
        const inPatient = a.items.some((x) => x.description === ev.title && x.date === ev.event_date);
        if (isSsrCostNotification(ev.title, ev.description)) expect(inPatient, 'costo SSR tra le spese del danneggiato').toBe(false);
      }
      expect(a.totalAmount === null || a.totalAmount <= events.length * 25000).toBe(true);
    }
  });
});
