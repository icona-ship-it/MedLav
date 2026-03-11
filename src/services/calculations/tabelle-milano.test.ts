import { describe, it, expect } from 'vitest';
import { calculateMilano } from './tabelle-milano';

describe('tabelle-milano', () => {
  describe('calculateMilano', () => {
    it('should return zero amount when percentage is below 10', () => {
      const result = calculateMilano(5, 30);
      expect(result.estimatedAmount).toBe(0);
      expect(result.confidence).toBe('da_verificare');
      expect(result.notes).toContain('1-9%');
    });

    it('should return zero amount when percentage is above 100', () => {
      const result = calculateMilano(101, 30);
      expect(result.estimatedAmount).toBe(0);
    });

    it('should return approximately 22,000-25,000 EUR for 10% at age 40', () => {
      const result = calculateMilano(10, 40);
      // 27,300 * 0.806 (age 40 demoltiplicator) = ~22,004
      expect(result.estimatedAmount).toBeGreaterThanOrEqual(22_000);
      expect(result.estimatedAmount).toBeLessThanOrEqual(25_000);
      expect(result.ageUsed).toBe(40);
      expect(result.ageDemoltiplicator).toBeCloseTo(0.806, 2);
    });

    it('should return approximately 23,000-27,500 EUR for 10% at age 30', () => {
      const result = calculateMilano(10, 30);
      // 27,300 * 0.856 (age 30 demoltiplicator) = ~23,369
      expect(result.estimatedAmount).toBeGreaterThanOrEqual(23_000);
      expect(result.estimatedAmount).toBeLessThanOrEqual(27_500);
      expect(result.ageDemoltiplicator).toBeCloseTo(0.856, 2);
    });

    it('should return approximately 530,000-535,000 EUR for 50% at age 40', () => {
      const result = calculateMilano(50, 40);
      // 660,000 * 0.806 = ~531,960
      expect(result.estimatedAmount).toBeGreaterThanOrEqual(530_000);
      expect(result.estimatedAmount).toBeLessThanOrEqual(535_000);
    });

    it('should produce different values at age 40 vs age 44', () => {
      const at40 = calculateMilano(10, 40);
      const at44 = calculateMilano(10, 44);
      expect(at40.estimatedAmount).not.toBe(at44.estimatedAmount);
      expect(at40.ageDemoltiplicator).not.toBe(at44.ageDemoltiplicator);
      // Age 40 should be higher than age 44 (younger = more)
      expect(at40.estimatedAmount).toBeGreaterThan(at44.estimatedAmount);
    });

    it('should return higher amount for younger victims', () => {
      const young = calculateMilano(20, 20);
      const old = calculateMilano(20, 60);
      expect(young.estimatedAmount).toBeGreaterThan(old.estimatedAmount);
    });

    it('should return higher amount for higher percentage', () => {
      const low = calculateMilano(15, 35);
      const high = calculateMilano(50, 35);
      expect(high.estimatedAmount).toBeGreaterThan(low.estimatedAmount);
    });

    it('should interpolate between anchor percentages', () => {
      const result = calculateMilano(12, 30);
      // 12% is between 10% (27,300) and 15% (60,300)
      // Interpolation: 27,300 + (2/5)*(60,300-27,300) = 27,300 + 13,200 = 40,500
      expect(result.isInterpolated).toBe(true);
      expect(result.estimatedAmount).toBeGreaterThan(0);
    });

    it('should not mark anchor percentages as interpolated', () => {
      const result = calculateMilano(10, 30);
      expect(result.isInterpolated).toBe(false);
    });

    it('should calculate per-point value correctly', () => {
      const result = calculateMilano(20, 30);
      expect(result.perPointValue).toBeCloseTo(
        result.estimatedAmount / 20,
        0,
      );
    });

    it('should clamp age to 0-100 range', () => {
      const resultNeg = calculateMilano(20, -5);
      expect(resultNeg.ageAtEvent).toBe(0);
      expect(resultNeg.ageUsed).toBe(1);

      const resultHigh = calculateMilano(20, 120);
      expect(resultHigh.ageAtEvent).toBe(100);
      expect(resultHigh.ageUsed).toBe(100);
    });

    it('should have indicativo confidence for valid calculations', () => {
      const result = calculateMilano(30, 40);
      expect(result.confidence).toBe('indicativo');
    });

    it('should reference Tabelle Milano 2024 in tableReference', () => {
      const result = calculateMilano(20, 30);
      expect(result.tableReference).toContain('Milano 2024');
    });

    it('should handle 100% invalidation', () => {
      const result = calculateMilano(100, 30);
      // 2,400,000 * 0.856 = ~2,054,400
      expect(result.estimatedAmount).toBeGreaterThan(2_000_000);
      expect(result.percentage).toBe(100);
      expect(result.isInterpolated).toBe(false);
    });

    it('should handle boundary percentage 10', () => {
      const result = calculateMilano(10, 30);
      expect(result.estimatedAmount).toBeGreaterThan(0);
      expect(result.percentage).toBe(10);
    });

    it('should interpolate age demoltiplicator per-year between anchors', () => {
      // Age 35 is between 30 (0.856) and 40 (0.806)
      // Linear: 0.856 + (5/10)*(0.806-0.856) = 0.856 - 0.025 = 0.831
      const result = calculateMilano(10, 35);
      expect(result.ageDemoltiplicator).toBeCloseTo(0.831, 2);
    });

    it('should return age 1 demoltiplicator of 1.000', () => {
      const result = calculateMilano(10, 1);
      expect(result.ageDemoltiplicator).toBe(1.000);
    });

    it('should return age 100 demoltiplicator of 0.522', () => {
      const result = calculateMilano(10, 100);
      expect(result.ageDemoltiplicator).toBe(0.522);
    });

    it('should populate ageUsed with exact age', () => {
      const result = calculateMilano(20, 47);
      expect(result.ageUsed).toBe(47);
    });

    it('should monotonically decrease amount as age increases', () => {
      const amounts = [20, 30, 40, 50, 60, 70, 80].map(
        (age) => calculateMilano(20, age).estimatedAmount,
      );
      for (let i = 1; i < amounts.length; i++) {
        expect(amounts[i]).toBeLessThan(amounts[i - 1]);
      }
    });

    it('should monotonically increase amount as percentage increases', () => {
      const amounts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(
        (pct) => calculateMilano(pct, 35).estimatedAmount,
      );
      for (let i = 1; i < amounts.length; i++) {
        expect(amounts[i]).toBeGreaterThan(amounts[i - 1]);
      }
    });
  });
});
