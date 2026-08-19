import { describe, it, expect } from 'vitest';
import { Table } from 'docx';
import {
  groupExpenseItemsByFacility,
  computeExpenseGrandTotal,
  buildExpenseDocxSection,
  type ExpenseDocxItem,
} from './expense-docx';

/** Dati interamente FITTIZI (universo Cittàdemo). */
function makeItem(overrides: Partial<ExpenseDocxItem>): ExpenseDocxItem {
  return {
    date: '2026-01-10',
    description: 'Voce di prova',
    amount: 100,
    receiptNumber: null,
    facility: null,
    notes: null,
    ...overrides,
  };
}

describe('groupExpenseItemsByFacility', () => {
  it('groups items by facility, ordered by earliest date, with per-group subtotals', () => {
    const items = [
      makeItem({ facility: 'Ospedale Civile di Cittàdemo', amount: 500, date: '2026-03-01' }),
      makeItem({ facility: 'Farmacia Demo', amount: 20, date: '2026-01-15' }),
      makeItem({ facility: 'Ospedale Civile di Cittàdemo', amount: 300, date: '2026-04-01' }),
    ];

    const groups = groupExpenseItemsByFacility(items);

    expect(groups).toHaveLength(2);
    expect(groups[0].facility).toBe('Farmacia Demo'); // data più antica
    expect(groups[0].subtotal).toBe(20);
    expect(groups[1].facility).toBe('Ospedale Civile di Cittàdemo');
    expect(groups[1].subtotal).toBe(800);
  });

  it('puts items without facility into a residual group', () => {
    const items = [
      makeItem({ facility: null, amount: 10 }),
      makeItem({ facility: 'Struttura X', amount: 20 }),
    ];

    const groups = groupExpenseItemsByFacility(items);

    expect(groups).toHaveLength(2);
    expect(groups.some((g) => g.facility === null)).toBe(true);
  });

  it('excludes excludedFromTotal amounts from the subtotal but keeps the row in the group', () => {
    const items = [
      makeItem({ facility: 'Ente Y', amount: 1000 }),
      makeItem({ facility: 'Ente Y', amount: 900, excludedFromTotal: true, exclusionReason: 'Già compreso nella fattura a saldo n. 1/26' }),
    ];

    const groups = groupExpenseItemsByFacility(items);

    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].subtotal).toBe(1000);
  });
});

describe('computeExpenseGrandTotal', () => {
  it('sums only non-excluded amounts', () => {
    const items = [
      makeItem({ amount: 100 }),
      makeItem({ amount: 50, excludedFromTotal: true }),
      makeItem({ amount: null }),
      makeItem({ amount: 0.1 }),
      makeItem({ amount: 0.2 }),
    ];
    expect(computeExpenseGrandTotal(items)).toBeCloseTo(100.3, 2);
  });

  it('returns null when no countable amount exists', () => {
    expect(computeExpenseGrandTotal([makeItem({ amount: null })])).toBeNull();
    expect(computeExpenseGrandTotal([])).toBeNull();
  });
});

describe('buildExpenseDocxSection', () => {
  const items = [
    makeItem({ facility: 'Ospedale Civile di Cittàdemo', amount: 10208.47, receiptNumber: '077/26', date: '2026-05-28', description: 'Ricovero LP' }),
    makeItem({ facility: null, amount: 9410.47, date: '2026-04-28', description: 'Deposito cauzionale intervento', excludedFromTotal: true, exclusionReason: 'Già compreso nella fattura a saldo n. 077/26' }),
  ];

  it('returns a heading plus at least one Table', () => {
    const out = buildExpenseDocxSection({ items, sectionNumber: '2' });
    expect(out.length).toBeGreaterThan(1);
    expect(out.some((el) => el instanceof Table)).toBe(true);
  });

  it('renders an empty-state paragraph when there are no items', () => {
    const out = buildExpenseDocxSection({ items: [], sectionNumber: '2' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((el) => el instanceof Table)).toBe(false);
  });

  it('anonymized mode still produces a table (flat, no facility headers)', () => {
    const out = buildExpenseDocxSection({ items, sectionNumber: '2', anonymized: true });
    expect(out.some((el) => el instanceof Table)).toBe(true);
  });
});
