import { describe, it, expect } from 'vitest';
import { hasPeritoName } from './perizia-metadata';

describe('hasPeritoName — il nome del perito che sblocca l\'export', () => {
  it('should be false for missing, empty, blank or non-string values', () => {
    expect(hasPeritoName(null)).toBe(false);
    expect(hasPeritoName(undefined)).toBe(false);
    expect(hasPeritoName({})).toBe(false);
    expect(hasPeritoName({ ctuName: '' })).toBe(false);
    expect(hasPeritoName({ ctuName: '   ' })).toBe(false);
    expect(hasPeritoName({ ctuName: 42 })).toBe(false);
  });

  it('should be true for a real name', () => {
    expect(hasPeritoName({ ctuName: 'Dott.ssa Anna Esempi' })).toBe(true);
  });
});
