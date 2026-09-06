import { describe, it, expect } from 'vitest';
import { parseSourcePageNumbers, formatSourcePagesLabel } from './source-pages';

describe('source pages → etichetta export', () => {
  it('array, stringa JSON, dedup e ordine', () => {
    expect(parseSourcePageNumbers([3, 1, 3])).toEqual([1, 3]);
    expect(parseSourcePageNumbers('[2,"4"]')).toEqual([2, 4]);
    expect(parseSourcePageNumbers('non json')).toEqual([]);
    expect(parseSourcePageNumbers(null)).toEqual([]);
  });
  it('etichette', () => {
    expect(formatSourcePagesLabel([3])).toBe('pag. 3');
    expect(formatSourcePagesLabel([3, 4, 5])).toBe('pagg. 3-5');
    expect(formatSourcePagesLabel('[2,5]')).toBe('pagg. 2, 5');
    expect(formatSourcePagesLabel([])).toBeNull();
  });
});
