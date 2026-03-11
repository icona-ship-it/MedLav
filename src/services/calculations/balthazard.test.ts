import { describe, it, expect } from 'vitest';
import { calculateBalthazard } from './balthazard';

describe('balthazard', () => {
  describe('calculateBalthazard', () => {
    it('should return 0 when given empty array', () => {
      const result = calculateBalthazard([]);
      expect(result.combinedPercentage).toBe(0);
      expect(result.steps).toHaveLength(0);
    });

    it('should return the single percentage when given one value', () => {
      const result = calculateBalthazard([25]);
      expect(result.combinedPercentage).toBe(25);
      expect(result.steps).toHaveLength(0);
      expect(result.notes).toContain('non si applica');
    });

    it('should combine two percentages correctly', () => {
      // 20 + 30 - (20 * 30 / 100) = 44
      const result = calculateBalthazard([20, 30]);
      expect(result.combinedPercentage).toBe(44);
      expect(result.steps).toHaveLength(1);
    });

    it('should produce result less than arithmetic sum', () => {
      const result = calculateBalthazard([20, 30]);
      expect(result.combinedPercentage).toBeLessThan(50);
    });

    it('should be commutative (order does not matter)', () => {
      const resultAB = calculateBalthazard([20, 30]);
      const resultBA = calculateBalthazard([30, 20]);
      expect(resultAB.combinedPercentage).toBe(resultBA.combinedPercentage);
    });

    it('should combine three percentages iteratively', () => {
      // Sorted descending: 30, 20, 10
      // Step 1: 30 + 20 - (30*20/100) = 44
      // Step 2: 44 + 10 - (44*10/100) = 49.6
      const result = calculateBalthazard([10, 20, 30]);
      expect(result.combinedPercentage).toBe(49.6);
      expect(result.steps).toHaveLength(2);
    });

    it('should return 0 when all percentages are 0', () => {
      const result = calculateBalthazard([0, 0, 0]);
      expect(result.combinedPercentage).toBe(0);
    });

    it('should return 100 when one percentage is 100', () => {
      // 100 + 30 - (100*30/100) = 100
      const result = calculateBalthazard([100, 30]);
      expect(result.combinedPercentage).toBe(100);
    });

    it('should return error for negative percentages', () => {
      const result = calculateBalthazard([-5, 20]);
      expect(result.combinedPercentage).toBe(0);
      expect(result.notes).toContain('non valida');
    });

    it('should return error for percentages above 100', () => {
      const result = calculateBalthazard([20, 110]);
      expect(result.combinedPercentage).toBe(0);
      expect(result.notes).toContain('non valida');
    });

    it('should include step-by-step formula in each step', () => {
      const result = calculateBalthazard([20, 30]);
      expect(result.steps[0].formulaApplied).toContain('30 + 20');
      expect(result.steps[0].formulaApplied).toContain('= 44');
    });

    it('should preserve input percentages in result', () => {
      const input = [10, 20, 30];
      const result = calculateBalthazard(input);
      expect(result.inputPercentages).toEqual(input);
    });

    it('should handle two equal percentages', () => {
      // 25 + 25 - (25*25/100) = 43.75
      const result = calculateBalthazard([25, 25]);
      expect(result.combinedPercentage).toBe(43.75);
    });

    it('should include formula description with arithmetic sum comparison', () => {
      const result = calculateBalthazard([20, 30]);
      expect(result.formulaDescription).toContain('Balthazard');
      expect(result.formulaDescription).toContain('44');
      expect(result.formulaDescription).toContain('50'); // arithmetic sum
    });
  });
});
