import { describe, it, expect } from 'vitest';
import { isValidCodiceFiscale } from './codice-fiscale';
import { isValidItalianDate, isEmptyOrValidItalianDate, normalizeItalianDateToIso } from './date-format';

describe('isValidCodiceFiscale', () => {
  it('accepts well-formed CFs with valid checksum', () => {
    // CFs computed against the official D.M. 12/03/1974 algorithm.
    expect(isValidCodiceFiscale('ABCABC80A01A001E')).toBe(true);
    expect(isValidCodiceFiscale('MTRMRA80A01H501B')).toBe(true);
  });

  it('rejects null/empty/wrong-shape inputs', () => {
    expect(isValidCodiceFiscale(null)).toBe(false);
    expect(isValidCodiceFiscale(undefined)).toBe(false);
    expect(isValidCodiceFiscale('')).toBe(false);
    expect(isValidCodiceFiscale('TOO_SHORT')).toBe(false);
    expect(isValidCodiceFiscale('1234567890123456')).toBe(false);
    expect(isValidCodiceFiscale('AAAAAA00A00A000')).toBe(false); // 15 chars
  });

  it('rejects CF with bad checksum', () => {
    expect(isValidCodiceFiscale('ABCABC80A01A001Z')).toBe(false); // wrong final char (correct = E)
  });

  it('case-insensitive', () => {
    expect(isValidCodiceFiscale('abcabc80a01a001e')).toBe(true);
  });

  it('rejects the Regnoto fabrication signature CF', () => {
    expect(isValidCodiceFiscale('BNCMRA78C15F205Z')).toBe(false);
  });
});

describe('isValidItalianDate', () => {
  it('accepts DD/MM/YYYY format', () => {
    expect(isValidItalianDate('13/12/2025')).toBe(true);
    expect(isValidItalianDate('29/02/2024')).toBe(true); // leap year
    expect(isValidItalianDate('01/01/2026')).toBe(true);
  });

  it('accepts DD.MM.YYYY format', () => {
    expect(isValidItalianDate('13.12.2025')).toBe(true);
  });

  it('accepts DD-MM-YYYY format', () => {
    expect(isValidItalianDate('13-12-2025')).toBe(true);
  });

  it('accepts ISO YYYY-MM-DD', () => {
    expect(isValidItalianDate('2025-12-13')).toBe(true);
  });

  it('rejects invalid day-of-month', () => {
    expect(isValidItalianDate('31/02/2025')).toBe(false);
    expect(isValidItalianDate('29/02/2025')).toBe(false); // 2025 not leap
  });

  it('rejects invalid month', () => {
    expect(isValidItalianDate('01/13/2025')).toBe(false);
    expect(isValidItalianDate('01/00/2025')).toBe(false);
  });

  it('rejects out-of-range year', () => {
    expect(isValidItalianDate('01/01/1899')).toBe(false);
    expect(isValidItalianDate('01/01/2200')).toBe(false);
  });

  it('rejects sentinel 1900-01-01 (LegMed sentinel for "missing date")', () => {
    expect(isValidItalianDate('1900-01-01')).toBe(false); // year=1900 → out of range
    expect(isValidItalianDate('01/01/1900')).toBe(false);
  });

  it('rejects null/empty/malformed', () => {
    expect(isValidItalianDate(null)).toBe(false);
    expect(isValidItalianDate('')).toBe(false);
    expect(isValidItalianDate('non una data')).toBe(false);
    expect(isValidItalianDate('13/2025')).toBe(false);
  });
});

describe('isEmptyOrValidItalianDate (optional perizia header dates)', () => {
  it('accepts empty/absent values (form fields are optional)', () => {
    expect(isEmptyOrValidItalianDate('')).toBe(true);
    expect(isEmptyOrValidItalianDate('   ')).toBe(true);
    expect(isEmptyOrValidItalianDate(null)).toBe(true);
    expect(isEmptyOrValidItalianDate(undefined)).toBe(true);
  });

  it('accepts valid DD/MM/YYYY and DD.MM.YYYY dates', () => {
    expect(isEmptyOrValidItalianDate('15/01/2025')).toBe(true);
    expect(isEmptyOrValidItalianDate('15.01.2025')).toBe(true);
    expect(isEmptyOrValidItalianDate('29/02/2024')).toBe(true); // leap year
  });

  it('rejects non-existent dates and malformed input', () => {
    expect(isEmptyOrValidItalianDate('15/13/2025')).toBe(false); // month 13
    expect(isEmptyOrValidItalianDate('31/02/2025')).toBe(false);
    expect(isEmptyOrValidItalianDate('29/02/2025')).toBe(false); // not leap
    expect(isEmptyOrValidItalianDate('domani')).toBe(false);
    expect(isEmptyOrValidItalianDate('15/01/25')).toBe(false); // 2-digit year
  });
});

describe('normalizeItalianDateToIso', () => {
  it('converts DD/MM/YYYY (Italian) to ISO', () => {
    expect(normalizeItalianDateToIso('05/03/2024')).toBe('2024-03-05');
    expect(normalizeItalianDateToIso('13.12.2025')).toBe('2025-12-13');
    expect(normalizeItalianDateToIso('13-12-2025')).toBe('2025-12-13');
  });
  it('passes through a valid ISO date', () => {
    expect(normalizeItalianDateToIso('2024-03-05')).toBe('2024-03-05');
  });
  it('returns null for impossible / malformed / sentinel dates', () => {
    expect(normalizeItalianDateToIso('31/02/2024')).toBeNull();
    expect(normalizeItalianDateToIso('2024-13-01')).toBeNull();
    expect(normalizeItalianDateToIso('1900-01-01')).toBeNull(); // sentinel rejected
    expect(normalizeItalianDateToIso('non una data')).toBeNull();
    expect(normalizeItalianDateToIso('')).toBeNull();
    expect(normalizeItalianDateToIso(null)).toBeNull();
  });
});
