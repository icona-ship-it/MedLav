import { describe, it, expect } from 'vitest';
import { numberToItalianWords } from './number-to-words-it';

describe('numberToItalianWords', () => {
  it('unità e decine', () => {
    expect(numberToItalianWords(0)).toBe('zero');
    expect(numberToItalianWords(8)).toBe('otto');
    expect(numberToItalianWords(15)).toBe('quindici');
    expect(numberToItalianWords(30)).toBe('trenta');
    expect(numberToItalianWords(90)).toBe('novanta');
  });

  it('elisione decine davanti a uno/otto', () => {
    expect(numberToItalianWords(21)).toBe('ventuno');
    expect(numberToItalianWords(28)).toBe('ventotto');
    expect(numberToItalianWords(31)).toBe('trentuno');
    expect(numberToItalianWords(75)).toBe('settantacinque');
  });

  it('centinaia (con elisione di cento davanti o/u)', () => {
    expect(numberToItalianWords(100)).toBe('cento');
    expect(numberToItalianWords(101)).toBe('centuno');
    expect(numberToItalianWords(108)).toBe('centotto');
    expect(numberToItalianWords(200)).toBe('duecento');
    expect(numberToItalianWords(365)).toBe('trecentosessantacinque');
    expect(numberToItalianWords(888)).toBe('ottocentottantotto');
  });

  it('input non gestiti → cifra', () => {
    expect(numberToItalianWords(NaN)).toBe('NaN');
    expect(numberToItalianWords(-5)).toBe('-5');
  });
});

describe('numberToItalianWords — migliaia (durata complessiva in giorni, mai la cifra tra parentesi)', () => {
  it('mille, duemila, composti', () => {
    expect(numberToItalianWords(1000)).toBe('mille');
    expect(numberToItalianWords(1001)).toBe('milleuno');
    expect(numberToItalianWords(2000)).toBe('duemila');
    expect(numberToItalianWords(4163)).toBe('quattromilacentosessantatré');
    expect(numberToItalianWords(21008)).toBe('ventunomilaotto');
  });
  it('oltre le centinaia di migliaia resta la cifra', () => {
    expect(numberToItalianWords(1_000_000)).toBe('1000000');
  });
});
