import { describe, it, expect } from 'vitest';
import { checkNumericalMismatch } from './report-validator';

/** Invariante I9 (audit 2026-09-10): un numero di ITT/ricovero scritto dal modello
 * in prosa che contraddice i calcoli non passa mai in silenzio. Dati fittizi. */
const ctx = { calculations: [
  { label: 'Invalidità temporanea totale', days: 30 },
  { label: 'Giorni di ricovero', days: 9 },
] } as never;

describe('checkNumericalMismatch — forme in prosa del modello', () => {
  const wrong = [
    'un periodo di invalidità temporanea totale di 40 giorni',
    'invalidità temporanea totale pari a 40 (quaranta) giorni',
    'inabilità temporanea totale al 100% di gg. 40',
    'ricovero di 40 giorni presso l\'Ospedale Civile di Cittàdemo',
    'seguivano 40 giorni di ricovero',
    'degenza di 40 giorni',
    'Giorni di ricovero: 40',
  ];
  it.each(wrong)('should flag «%s» (40 ≠ 30/9)', (text) => {
    const issues = checkNumericalMismatch(`Il periziando è stato visitato. ${text}. Prognosi favorevole.`, ctx);
    expect(issues.some((i) => i.type === 'numerical_mismatch'), text).toBe(true);
  });

  it('should NOT flag numbers that match the calculations (±2 giorni) nor the calculated-references block', () => {
    const ok = [
      'invalidità temporanea totale di 30 giorni',
      'inabilità temporanea totale al 100% di gg. 31',
      '- Giorni di degenza: 9 (nove), dal 13.11.2024 al 21.11.2024, conteggio inclusivo dei due estremi.',
      'ricovero di 9 giorni',
    ];
    for (const text of ok) {
      expect(checkNumericalMismatch(text, ctx), text).toEqual([]);
    }
  });

  it('should flag every distinct wrong value once, even after a correct one', () => {
    const issues = checkNumericalMismatch('ITT di 30 giorni, poi si dichiara invalidità temporanea totale di 45 giorni e ancora 45 giorni di ricovero.', ctx);
    expect(issues.map((i) => i.message).join(' | ')).toContain('ITT in report: 45');
    expect(issues.map((i) => i.message).join(' | ')).toContain('Giorni ricovero in report: 45');
    expect(issues.filter((i) => /ITT in report: 45/.test(i.message))).toHaveLength(1);
  });
});
