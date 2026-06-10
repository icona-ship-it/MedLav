import { describe, it, expect } from 'vitest';
import { getCitationReliabilityDisplay } from './hrs-display';

describe('getCitationReliabilityDisplay — HRS badge mapping (Sprint 2.4-B)', () => {
  it('should map eccellente (>=90) and buono (>=70) to "Alta" with green styling', () => {
    for (const hrs of [100, 95, 90, 89, 70]) {
      const d = getCitationReliabilityDisplay(hrs);
      expect(d.label).toBe('Alta');
      expect(d.colorClass).toContain('green');
      expect(d.description).toContain(`${hrs}/100`);
    }
  });

  it('should map da_rivedere (50-69) to "Media" with amber styling', () => {
    for (const hrs of [69, 60, 50]) {
      const d = getCitationReliabilityDisplay(hrs);
      expect(d.label).toBe('Media');
      expect(d.colorClass).toContain('amber');
    }
  });

  it('should map critico (<50) to "Bassa" with red styling', () => {
    for (const hrs of [49, 20, 0]) {
      const d = getCitationReliabilityDisplay(hrs);
      expect(d.label).toBe('Bassa');
      expect(d.colorClass).toContain('red');
    }
  });

  it('should always remind the perito to verify «da verificare» citations (no jargon "HRS")', () => {
    for (const hrs of [95, 60, 10]) {
      const d = getCitationReliabilityDisplay(hrs);
      expect(d.description).toContain('da verificare');
      expect(d.description).not.toContain('HRS');
      expect(d.label).not.toContain('HRS');
    }
  });
});
