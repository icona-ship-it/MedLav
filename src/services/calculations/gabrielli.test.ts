import { describe, it, expect } from 'vitest';
import { calculateGabrielli } from './gabrielli';

describe('gabrielli', () => {
  describe('calculateGabrielli', () => {
    it('should calculate effective percentage for standard case', () => {
      // ((40 - 20) / (100 - 20)) * 100 = 25%
      const result = calculateGabrielli(40, 20);
      expect(result.effectivePercentage).toBe(25);
    });

    it('should return total percentage when no preexisting condition', () => {
      const result = calculateGabrielli(30, 0);
      expect(result.effectivePercentage).toBe(30);
      expect(result.notes).toContain('non necessaria');
    });

    it('should return 0 when total equals preexisting', () => {
      const result = calculateGabrielli(20, 20);
      expect(result.effectivePercentage).toBe(0);
      expect(result.explanation).toContain('nessun danno aggiuntivo');
    });

    it('should return error when total is less than preexisting', () => {
      const result = calculateGabrielli(10, 30);
      expect(result.effectivePercentage).toBe(0);
      expect(result.formulaApplied).toBe('N/A');
      expect(result.explanation).toContain('non puo essere inferiore');
    });

    it('should return error when total percentage is negative', () => {
      const result = calculateGabrielli(-10, 20);
      expect(result.effectivePercentage).toBe(0);
      expect(result.formulaApplied).toBe('N/A');
    });

    it('should return error when total percentage exceeds 100', () => {
      const result = calculateGabrielli(110, 20);
      expect(result.effectivePercentage).toBe(0);
      expect(result.formulaApplied).toBe('N/A');
    });

    it('should return error when preexisting percentage is negative', () => {
      const result = calculateGabrielli(40, -5);
      expect(result.effectivePercentage).toBe(0);
    });

    it('should return error when preexisting is 100%', () => {
      const result = calculateGabrielli(100, 100);
      expect(result.effectivePercentage).toBe(0);
      expect(result.explanation).toContain('nessuna capacita residua');
    });

    it('should calculate correctly for small preexisting condition', () => {
      // ((50 - 5) / (100 - 5)) * 100 = 47.37%
      const result = calculateGabrielli(50, 5);
      expect(result.effectivePercentage).toBeCloseTo(47.37, 1);
    });

    it('should calculate correctly for high preexisting condition', () => {
      // ((90 - 70) / (100 - 70)) * 100 = 66.67%
      const result = calculateGabrielli(90, 70);
      expect(result.effectivePercentage).toBeCloseTo(66.67, 1);
    });

    it('should include formula string with all values', () => {
      const result = calculateGabrielli(40, 20);
      expect(result.formulaApplied).toContain('40');
      expect(result.formulaApplied).toContain('20');
      expect(result.formulaApplied).toContain('25');
    });

    it('should include explanation with all relevant percentages', () => {
      const result = calculateGabrielli(40, 20);
      expect(result.explanation).toContain('20%');
      expect(result.explanation).toContain('40%');
      expect(result.explanation).toContain('25%');
    });

    it('should handle boundary case total=100 preexisting=0', () => {
      const result = calculateGabrielli(100, 0);
      expect(result.effectivePercentage).toBe(100);
    });

    it('should handle boundary case total=100 preexisting=50', () => {
      // ((100 - 50) / (100 - 50)) * 100 = 100%
      const result = calculateGabrielli(100, 50);
      expect(result.effectivePercentage).toBe(100);
    });
  });
});
