import { describe, it, expect } from 'vitest';
import { flagExpenseDatesNotInSource, DATE_NOT_IN_SOURCE_NOTE } from './expense-date-check';
import type { ExtractedExpenseItem } from './expense-extractor';

const item = (o: Partial<ExtractedExpenseItem>): ExtractedExpenseItem => ({
  date: '2025-10-18', description: 'Consulenza', amount: 300, receiptNumber: null, drugType: null, category: 'altro',
  facility: null, linkedDiagnosis: null, isJustified: null, notes: null, interpretation: null, sourceDocument: 'ricevuta.pdf', ...o,
});
const OCR = '### DOCUMENTO: ricevuta.pdf ###\nRICEVUTA n. 4 — Cittàdemo, 18/10/2025 — Consulenza medico legale — Totale 300,00\n### FINE DOCUMENTO ###\n\n### DOCUMENTO: perizia.pdf ###\nRelazione del 28/04/2025.\n### FINE DOCUMENTO ###';

describe('flagExpenseDatesNotInSource — F8', () => {
  it('data presente nel documento di origine → voce intatta', () => {
    const out = flagExpenseDatesNotInSource([item({})], OCR);
    expect(out[0].dateNotInSource).toBeUndefined();
    expect(out[0].notes).toBeNull();
  });
  it('data presa da un ALTRO documento (28.04 dalla perizia) → marcata «da verificare», resta in tabella con la data', () => {
    const out = flagExpenseDatesNotInSource([item({ date: '2025-04-28', notes: 'privato' })], OCR);
    expect(out[0].dateNotInSource).toBe(true);
    expect(out[0].date).toBe('2025-04-28');
    expect(out[0].notes).toBe(`${DATE_NOT_IN_SOURCE_NOTE} | privato`);
  });
  it('data vuota o parziale attestata → nessun flag; documento sconosciuto → si cerca in tutto il testo; idempotente', () => {
    expect(flagExpenseDatesNotInSource([item({ date: '' })], OCR)[0].dateNotInSource).toBeUndefined();
    expect(flagExpenseDatesNotInSource([item({ date: '2025-10', sourceDocument: null })], OCR)[0].dateNotInSource).toBeUndefined();
    expect(flagExpenseDatesNotInSource([item({ date: '2025-04-28', sourceDocument: 'ignoto.pdf' })], OCR)[0].dateNotInSource).toBeUndefined();
    const once = flagExpenseDatesNotInSource([item({ date: '2025-04-28' })], OCR);
    const twice = flagExpenseDatesNotInSource(once, OCR);
    expect(twice[0].notes).toBe(DATE_NOT_IN_SOURCE_NOTE);
  });
});
