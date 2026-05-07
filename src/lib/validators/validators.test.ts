import { describe, it, expect } from 'vitest';
import { isValidCodiceFiscale } from './codice-fiscale';
import { isValidItalianDate } from './date-format';

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
