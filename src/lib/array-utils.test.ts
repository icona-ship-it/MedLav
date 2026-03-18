import { describe, it, expect } from 'vitest';
import { chunkArray } from './array-utils';

describe('chunkArray', () => {
  it('should split array into chunks of given size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should return empty array for empty input', () => {
    expect(chunkArray([], 3)).toEqual([]);
  });

  it('should return single chunk when size >= array length', () => {
    expect(chunkArray([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    expect(chunkArray([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('should handle size=1 (one element per chunk)', () => {
    expect(chunkArray([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('should handle exactly divisible arrays', () => {
    expect(chunkArray([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('should throw on size=0', () => {
    expect(() => chunkArray([1, 2, 3], 0)).toThrow('chunkArray: size must be > 0, got 0');
  });

  it('should throw on negative size', () => {
    expect(() => chunkArray([1, 2, 3], -1)).toThrow('chunkArray: size must be > 0, got -1');
  });

  it('should not mutate the original array', () => {
    const arr = [1, 2, 3, 4];
    const result = chunkArray(arr, 2);
    expect(arr).toEqual([1, 2, 3, 4]);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });
});
