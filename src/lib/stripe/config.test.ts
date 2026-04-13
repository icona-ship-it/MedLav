import { describe, it, expect } from 'vitest';
import { getPlanLimits, PLANS } from './config';

describe('stripe config', () => {
  describe('getPlanLimits', () => {
    it('should return Infinity for all plans (cases gated by credits)', () => {
      expect(getPlanLimits('trial').casesLimit).toBe(Infinity);
      expect(getPlanLimits('pro').casesLimit).toBe(Infinity);
      expect(getPlanLimits('enterprise').casesLimit).toBe(Infinity);
      expect(getPlanLimits('nonexistent-plan').casesLimit).toBe(Infinity);
      expect(getPlanLimits('').casesLimit).toBe(Infinity);
    });
  });

  describe('PLANS constant', () => {
    it('should define trial with 30 credits', () => {
      expect(PLANS.trial.casesLimit).toBe(Infinity);
      expect(PLANS.trial.name).toBe('Trial');
      expect(PLANS.trial.credits).toBe(30);
    });

    it('should define pro with 900 credits/month at €69', () => {
      expect(PLANS.pro.casesLimit).toBe(Infinity);
      expect(PLANS.pro.name).toBe('Pro');
      expect(PLANS.pro.credits).toBe(900);
      expect(PLANS.pro.monthlyPrice).toBe(69);
    });

    it('should define enterprise with unlimited cases', () => {
      expect(PLANS.enterprise.casesLimit).toBe(Infinity);
      expect(PLANS.enterprise.name).toBe('Enterprise');
    });
  });
});
