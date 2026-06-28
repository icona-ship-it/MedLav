import { describe, it, expect } from 'vitest';
import { formatEventDateByPrecision } from './format';

describe('formatEventDateByPrecision — non stampa mai un giorno/mese FABBRICATO (fix Bigon 01.01.YYYY)', () => {
  it('precisione giorno → DD.MM.YYYY', () => {
    expect(formatEventDateByPrecision('2024-03-15', 'giorno')).toBe('15.03.2024');
  });

  it('precisione mese → MM.YYYY (niente giorno inventato)', () => {
    expect(formatEventDateByPrecision('2024-02-01', 'mese')).toBe('02.2024');
  });

  it('precisione anno → solo l\'anno (niente 01.01 inventato — il bug Bigon)', () => {
    expect(formatEventDateByPrecision('2002-01-01', 'anno')).toBe('2002');
    expect(formatEventDateByPrecision('2002-01-01', 'anno')).not.toContain('01.01');
  });

  it('precisione sconosciuta MA data valida → mostra la data (è approssimata ma reale — fix review)', () => {
    // inferMissingDates assegna una data-donatrice reale con precisione "sconosciuta":
    // sopprimerla a "s.d." scarterebbe una data realmente desunta (regressione).
    expect(formatEventDateByPrecision('2024-03-15', 'sconosciuta')).toBe('15.03.2024');
  });

  it('sentinella 1900-01-01 → s.d. (mai 01.01.1900) — è l\'unico vero "senza data"', () => {
    expect(formatEventDateByPrecision('1900-01-01', 'giorno')).toBe('s.d.');
    expect(formatEventDateByPrecision('1900-01-01', 'sconosciuta')).toBe('s.d.');
    expect(formatEventDateByPrecision('1900-01-01', 'anno')).toBe('s.d.');
  });

  it('precisione assente → tratta come giorno (DD.MM.YYYY)', () => {
    expect(formatEventDateByPrecision('2024-03-15')).toBe('15.03.2024');
  });

  it('un vero 1° gennaio con precisione giorno NON viene ridotto', () => {
    expect(formatEventDateByPrecision('2024-01-01', 'giorno')).toBe('01.01.2024');
  });

  it('stringa vuota → s.d.', () => {
    expect(formatEventDateByPrecision('', 'giorno')).toBe('s.d.');
  });
});
