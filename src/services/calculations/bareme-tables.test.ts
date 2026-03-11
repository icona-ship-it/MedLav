import { describe, it, expect } from 'vitest';
import {
  calculateDannoBiologico,
  getMicroCoefficient,
  getTunInvalidityCoefficient,
  getTunAgeCoefficient,
} from './bareme-tables';

describe('bareme-tables', () => {
  describe('getMicroCoefficient', () => {
    it('should return 1.0 for 1%', () => {
      expect(getMicroCoefficient(1)).toBe(1.0);
    });

    it('should return 2.3 for 9%', () => {
      expect(getMicroCoefficient(9)).toBe(2.3);
    });

    it('should return undefined for 10%', () => {
      expect(getMicroCoefficient(10)).toBeUndefined();
    });
  });

  describe('getTunInvalidityCoefficient', () => {
    it('should return coefficient for 10%', () => {
      expect(getTunInvalidityCoefficient(10)).toBe(2.75773);
    });

    it('should return coefficient for 100%', () => {
      expect(getTunInvalidityCoefficient(100)).toBe(10.94720);
    });

    it('should return undefined for 9%', () => {
      expect(getTunInvalidityCoefficient(9)).toBeUndefined();
    });
  });

  describe('getTunAgeCoefficient', () => {
    it('should return 1.0 for age 1', () => {
      expect(getTunAgeCoefficient(1)).toBe(1.000);
    });

    it('should return 0.856 for age 30', () => {
      expect(getTunAgeCoefficient(30)).toBe(0.856);
    });

    it('should return 0.522 for age 100', () => {
      expect(getTunAgeCoefficient(100)).toBe(0.522);
    });
  });

  describe('calculateDannoBiologico', () => {
    it('should use micropermanenti table for 1-9%', () => {
      const result = calculateDannoBiologico(5);
      expect(result.tableUsed).toContain('Micropermanenti');
      expect(result.estimatedAmount).toBeGreaterThan(0);
    });

    it('should use TUN table for 10-100%', () => {
      const result = calculateDannoBiologico(20);
      expect(result.tableUsed).toContain('TUN');
      expect(result.estimatedAmount).toBeGreaterThan(0);
    });

    it('should return null amount for percentage 0', () => {
      const result = calculateDannoBiologico(0);
      expect(result.estimatedAmount).toBeNull();
    });

    it('should return null amount for percentage > 100', () => {
      const result = calculateDannoBiologico(101);
      expect(result.estimatedAmount).toBeNull();
    });

    it('should apply age reduction for micropermanenti', () => {
      const noAge = calculateDannoBiologico(5);
      const age60 = calculateDannoBiologico(5, 60);
      // With age 60, reduction = 1 - 0.005 * 50 = 0.75
      expect(age60.estimatedAmount!).toBeLessThan(noAge.estimatedAmount!);
    });

    it('should apply TUN age coefficient for macropermanenti', () => {
      const noAge = calculateDannoBiologico(20);
      const age60 = calculateDannoBiologico(20, 60);
      expect(age60.estimatedAmount!).toBeLessThan(noAge.estimatedAmount!);
    });

    it('should have higher amount for higher percentage', () => {
      const low = calculateDannoBiologico(3);
      const high = calculateDannoBiologico(7);
      expect(high.estimatedAmount!).toBeGreaterThan(low.estimatedAmount!);
    });

    it('should set confidence to suggerito when age is provided', () => {
      const result = calculateDannoBiologico(5, 40);
      expect(result.confidence).toBe('suggerito');
    });

    it('should set confidence to da_verificare when age is not provided', () => {
      const result = calculateDannoBiologico(5);
      expect(result.confidence).toBe('da_verificare');
    });
  });
});
