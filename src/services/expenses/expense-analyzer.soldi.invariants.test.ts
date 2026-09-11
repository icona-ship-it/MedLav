import { describe, it, expect } from 'vitest';
import { analyzeExpenses, extractAmount } from './expense-analyzer';

/**
 * Invarianti SOLDI aggiuntive sull'analizzatore (audit 2026-09-10) — SOLO
 * classi non coperte da expense-analyzer.invariants.test.ts (che copre totale =
 * somma righe, SSN ∩ danneggiato = ∅, importi ≥ 0):
 *  1. lo stesso PDF caricato due volte (nuovo document_id) non cambia il totale;
 *  2. i separatori misti non cambiano MAI l'ordine di grandezza: per ogni
 *     forma l'importo estratto è quello scritto oppure null (visibile come "—"),
 *     mai un numero diverso.
 * Percorso reale: process-case → analyzeExpenses sugli eventi (titolo,
 * descrizione, source_text verbatim OCR) → tabella Spese e riga Epicrisi.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const cents = (n: number): number => Math.round(n * 100);
const randAmount = (r: () => number): number => (1 + Math.floor(r() * 2_000_000)) / 100;
function fmt(n: number, thousands: '.' | '' | ' ' | ',', decimal: ',' | '.'): string {
  const [int, dec] = n.toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, thousands)}${decimal}${dec}`;
}

const TITLES = ['Fattura n. 12/2026 visita ortopedica', 'Pagamento totale fattura n. 0295-0008', 'Acquisto tutore articolato', 'Ticket RX polso', 'Ricevuta bancomat', 'RM gomito destro', 'Fisioterapia 10 sedute', 'Ritiro cartella clinica'] as const;
const DESCS = ['euro 120,00', 'Importo € 1.038,80', 'pagata con bancomat euro 50,00', '', 'totale 366,00 EUR', 'EUR 27,90', 'il SSR ha impiegato euro 521,35'] as const;
const DATES = ['2026-01-10', '2026-02-03', '', '2026-03-15'] as const;

describe('invariante SOLDI — stesso PDF caricato due volte (fuzz, seme fisso, 2000 casi)', () => {
  it('eventi duplicati con document_id nuovo: stesso totale e stesse righe della singola copia', () => {
    const r = mulberry32(20260910);
    for (let i = 0; i < 2000; i++) {
      const events = Array.from({ length: 1 + Math.floor(r() * 8) }, () => ({
        event_type: 'spesa_medica', title: pick(r, TITLES), description: pick(r, DESCS), event_date: pick(r, DATES),
        facility: null, source_type: 'spese_mediche', document_id: pick(r, ['a', 'b', null]), source_text: r() < 0.3 ? 'Totale € 99,90' : null,
      }));
      const once = analyzeExpenses(events);
      const twice = analyzeExpenses([...events, ...events.map((e) => ({ ...e, document_id: e.document_id ? `${e.document_id}-bis` : null }))]);
      expect(cents(twice.totalAmount ?? 0), 'totale gonfiato dal doppio upload').toBe(cents(once.totalAmount ?? 0));
      expect(twice.items.length, 'righe duplicate dal doppio upload').toBe(once.items.length);
    }
  });
});

describe('invariante SOLDI — separatori misti: mai un altro ordine di grandezza (fuzz, seme fisso)', () => {
  it('forme standard italiane e ISO: l\'importo torna ESATTO al centesimo (500 importi × 18 forme, con rumore OCR intorno)', () => {
    const r = mulberry32(7);
    const NOISE = ['', '<td>Importo</td><td>', '[ILLEGGIBILE] ', '| Totale | ', 'Cittàdemo, 10/01/2026 — '];
    for (let i = 0; i < 500; i++) {
      const A = randAmount(r);
      const s = fmt(A, '.', ','); const u = fmt(A, '', ',');
      const forms = [
        `€ ${s}`, `€${u}`, `Importo: ${s} €`, `${u}€`, `euro ${s}`, `Euro ${u}`, `${s} euro`, `${u} EUR`, `EUR ${s}`, `Importo: ${s} EUR`,
        `Totale: € ${s}`, `TOTALE ${u} EUR`, `Totale documento € ${u}`, `Da pagare: ${s} €`, `€ ${s}.`, `(€ ${s})`, `importo pagato euro ${u} in contanti`, `EUR ${u} - ricevuta n. 12`,
      ];
      for (const f of forms) {
        const got = extractAmount(`${pick(r, NOISE)}${f}`);
        expect(got === null ? null : cents(got), `«${f}»`).toBe(cents(A));
      }
    }
  });

  // Classe coperta (audit 2026-09-10): separatori misti/OCR-degradati letti con un altro ordine di grandezza
  it('forme con separatori misti o degradati dall\'OCR (spazio migliaia, virgola letta come punto, formato US, EURO maiuscolo): l\'esito è l\'importo scritto oppure null — mai un numero diverso', () => {
    const r = mulberry32(11);
    const offenders = new Map<string, string>();
    for (let i = 0; i < 400; i++) {
      const A = randAmount(r);
      const s = fmt(A, '.', ','); const sp = fmt(A, ' ', ','); const dd = fmt(A, '.', '.'); const us = fmt(A, ',', '.');
      const forms: Array<[string, string]> = [
        ['spazio migliaia "1 234,56 €"', `${sp} €`], ['spazio migliaia "€ 1 234,56"', `€ ${sp}`], ['spazio migliaia "euro 1 234,56"', `euro ${sp}`], ['spazio migliaia "1 234,56 EUR"', `${sp} EUR`],
        ['virgola letta come punto "euro 1.234.56"', `euro ${dd}`], ['virgola letta come punto "€ 1.234.56"', `€ ${dd}`], ['virgola letta come punto "EUR 1.234.56"', `EUR ${dd}`], ['virgola letta come punto "1.234.56 €"', `${dd} €`],
        ['US "€ 1,234.56"', `€ ${us}`], ['US "1,234.56 €"', `${us} €`], ['US "EUR 1,234.56"', `EUR ${us}`], ['US "1,234.56 EUR"', `${us} EUR`], ['US "euro 1,234.56"', `euro ${us}`],
        ['maiuscolo "EURO 1.234,56"', `EURO ${s}`], ['maiuscolo "1.234,56 EURO"', `${s} EURO`],
      ];
      for (const [label, f] of forms) {
        const got = extractAmount(f);
        if (got !== null && cents(got) !== cents(A) && !offenders.has(label)) offenders.set(label, `${label}: «${f}» → ${got} (scritto ${A})`);
      }
    }
    expect([...offenders.values()]).toEqual([]);
  });
});

describe('componenti fiscali e prestazioni distinte (audit 2026-09-10, R8/I13)', () => {
  const base = { event_type: 'spesa_medica', facility: null, source_type: 'spese_mediche', source_text: null } as const;
  it('IVA e bollo scorporati si sommano alla riga ospite dello stesso documento con nota: totale lordo, mai scartati in silenzio', () => {
    const out = analyzeExpenses([
      { ...base, title: 'Consulenza medico-legale', description: 'euro 300,00', event_date: '2026-04-28', document_id: 'ric' },
      { ...base, title: 'IVA 22%', description: 'euro 66,00', event_date: '2026-04-28', document_id: 'ric' },
      { ...base, title: 'Imposta di bollo', description: 'euro 2,00', event_date: '2026-04-28', document_id: 'ric' },
    ]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.amount).toBe(368);
    expect(out.items[0]!.description).toContain('comprende');
    expect(out.totalAmount).toBe(368);
  });

  it('se la fattura porta già il suo totale lordo, IVA e bollo restano righe interne (nessun doppio conteggio)', () => {
    const out = analyzeExpenses([
      { ...base, title: 'Pagamento totale fattura n. 12/2026', description: 'euro 122,00', event_date: '2026-04-28', document_id: 'f' },
      { ...base, title: 'Acquisto tutore', description: 'euro 100,00', event_date: '2026-04-28', document_id: 'f' },
      { ...base, title: 'IVA 22%', description: 'euro 22,00', event_date: '2026-04-28', document_id: 'f' },
    ]);
    expect(out.totalAmount).toBe(122);
  });

  it('una componente fiscale senza riga ospite resta una riga propria (visibile), non sparisce', () => {
    const out = analyzeExpenses([{ ...base, title: 'Imposta di bollo', description: 'euro 2,00', event_date: '2026-04-28', document_id: 'solo' }]);
    expect(out.items).toHaveLength(1);
    expect(out.totalAmount).toBe(2);
  });

  it('due ticket identici lo stesso giorno nello STESSO documento sono due prestazioni; in due documenti diversi è la stessa ricevuta letta due volte', () => {
    const t = { ...base, title: 'Ticket farmacia', description: 'euro 27,90', event_date: '2026-05-02' };
    expect(analyzeExpenses([{ ...t, document_id: 'a' }, { ...t, document_id: 'a' }]).totalAmount).toBe(55.8);
    expect(analyzeExpenses([{ ...t, document_id: 'a' }, { ...t, document_id: 'b' }]).totalAmount).toBe(27.9);
  });
});
