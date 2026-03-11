import { describe, it, expect } from 'vitest';
import { getPlanLimits, PLANS } from './config';

describe('stripe config', () => {
  describe('getPlanLimits', () => {
    it('should return 5 cases for trial plan', () => {
      // Arrange & Act
      const limits = getPlanLimits('trial');

      // Assert
      expect(limits.casesLimit).toBe(5);
    });

    it('should return Infinity for pro plan', () => {
      // Arrange & Act
      const limits = getPlanLimits('pro');

      // Assert
      expect(limits.casesLimit).toBe(Infinity);
    });

    it('should return Infinity for enterprise plan', () => {
      // Arrange & Act
      const limits = getPlanLimits('enterprise');

      // Assert
      expect(limits.casesLimit).toBe(Infinity);
    });

    it('should default to trial for unknown plans', () => {
      // Arrange & Act
      const limits = getPlanLimits('nonexistent-plan');

      // Assert
      expect(limits.casesLimit).toBe(PLANS.trial.casesLimit);
    });

    it('should default to trial for empty string', () => {
      // Arrange & Act
      const limits = getPlanLimits('');

      // Assert
      expect(limits.casesLimit).toBe(PLANS.trial.casesLimit);
    });
  });

  describe('PLANS constant', () => {
    it('should define trial with casesLimit of 5', () => {
      expect(PLANS.trial.casesLimit).toBe(5);
      expect(PLANS.trial.name).toBe('Trial');
    });

    it('should define pro with unlimited cases', () => {
      expect(PLANS.pro.casesLimit).toBe(Infinity);
      expect(PLANS.pro.name).toBe('Pro');
    });

    it('should define enterprise with unlimited cases', () => {
      expect(PLANS.enterprise.casesLimit).toBe(Infinity);
      expect(PLANS.enterprise.name).toBe('Enterprise');
    });
  });
});
