import { describe, it, expect } from 'vitest';
import { calculateBpca, BPCA_DOMAINS } from './simla-bpca';

describe('simla-bpca', () => {
  describe('BPCA_DOMAINS', () => {
    it('should have 7 defined domains', () => {
      expect(BPCA_DOMAINS).toHaveLength(7);
    });

    it('should have unique domain IDs', () => {
      const ids = BPCA_DOMAINS.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have positive maxPercentage for all domains', () => {
      for (const domain of BPCA_DOMAINS) {
        expect(domain.maxPercentage).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateBpca', () => {
    it('should return zero when no assessments provided', () => {
      const result = calculateBpca([]);
      expect(result.combinedPercentage).toBe(0);
      expect(result.domainScores).toHaveLength(0);
      expect(result.notes).toContain('Nessun dominio');
    });

    it('should calculate lieve as 25% of max for a single domain', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_umore', severity: 'lieve' },
      ]);
      // Disturbi umore max = 30%, lieve = 25% of 30 = 7.5%
      expect(result.domainScores).toHaveLength(1);
      expect(result.domainScores[0].percentage).toBe(7.5);
      expect(result.combinedPercentage).toBe(7.5);
    });

    it('should calculate moderato as 50% of max for a single domain', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_ansia', severity: 'moderato' },
      ]);
      // Disturbi ansia max = 25%, moderato = 50% of 25 = 12.5%
      expect(result.domainScores[0].percentage).toBe(12.5);
      expect(result.combinedPercentage).toBe(12.5);
    });

    it('should calculate grave as 75% of max for a single domain', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_cognitivo', severity: 'grave' },
      ]);
      // Deficit cognitivi max = 70%, grave = 75% of 70 = 52.5%
      expect(result.domainScores[0].percentage).toBe(52.5);
      expect(result.combinedPercentage).toBe(52.5);
    });

    it('should calculate gravissimo as 100% of max for a single domain', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_personalita', severity: 'gravissimo' },
      ]);
      // Disturbi personalita max = 40%, gravissimo = 100% of 40 = 40%
      expect(result.domainScores[0].percentage).toBe(40);
      expect(result.combinedPercentage).toBe(40);
    });

    it('should combine multiple domains using Balthazard formula', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_umore', severity: 'moderato' },    // 15%
        { domainId: 'disturbo_ansia', severity: 'moderato' },    // 12.5%
      ]);
      // Balthazard: 15 + 12.5 - (15 * 12.5 / 100) = 27.5 - 1.875 = 25.625
      expect(result.domainScores).toHaveLength(2);
      expect(result.combinedPercentage).toBeCloseTo(25.63, 1);
    });

    it('should produce combined percentage less than arithmetic sum', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_umore', severity: 'grave' },       // 22.5%
        { domainId: 'disturbo_cognitivo', severity: 'moderato' }, // 35%
        { domainId: 'disturbo_ansia', severity: 'lieve' },       // 6.25%
      ]);
      const arithmeticSum = 22.5 + 35 + 6.25;
      expect(result.combinedPercentage).toBeLessThan(arithmeticSum);
      expect(result.combinedPercentage).toBeGreaterThan(0);
    });

    it('should handle invalid domain ID gracefully', () => {
      const result = calculateBpca([
        { domainId: 'nonexistent_domain', severity: 'lieve' },
      ]);
      expect(result.combinedPercentage).toBe(0);
      expect(result.notes).toContain('non riconosciuti');
      expect(result.notes).toContain('nonexistent_domain');
    });

    it('should handle mix of valid and invalid domain IDs', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_umore', severity: 'lieve' },
        { domainId: 'fake_domain', severity: 'grave' },
      ]);
      // Invalid domain should cause error, valid domain still scored
      expect(result.combinedPercentage).toBe(0);
      expect(result.notes).toContain('non riconosciuti');
      expect(result.domainScores).toHaveLength(1);
    });

    it('should include SIMLA 2025 methodology reference', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_sonno', severity: 'lieve' },
      ]);
      expect(result.methodology).toContain('SIMLA 2025');
      expect(result.methodology).toContain('Ronchi-Mastroroberto');
      expect(result.reference).toContain('BPCA');
    });

    it('should include domain summary in notes for valid assessments', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_umore', severity: 'moderato' },
      ]);
      expect(result.notes).toContain('Disturbi dell\'umore');
      expect(result.notes).toContain('moderato');
      expect(result.notes).toContain('Balthazard');
    });

    it('should calculate disturbo_sonno lieve as 2.5%', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_sonno', severity: 'lieve' },
      ]);
      // max 10%, lieve = 25% of 10 = 2.5%
      expect(result.domainScores[0].percentage).toBe(2.5);
    });

    it('should calculate disturbo_sessuale gravissimo as 15%', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_sessuale', severity: 'gravissimo' },
      ]);
      expect(result.domainScores[0].percentage).toBe(15);
    });

    it('should calculate disturbo_somatoforme grave as 15%', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_somatoforme', severity: 'grave' },
      ]);
      // max 20%, grave = 75% of 20 = 15%
      expect(result.domainScores[0].percentage).toBe(15);
    });

    it('should handle all 7 domains assessed simultaneously', () => {
      const assessments = BPCA_DOMAINS.map((d) => ({
        domainId: d.id,
        severity: 'lieve' as const,
      }));
      const result = calculateBpca(assessments);
      expect(result.domainScores).toHaveLength(7);
      expect(result.combinedPercentage).toBeGreaterThan(0);
      // Combined should be less than sum of all lieve percentages
      const sumLieve = BPCA_DOMAINS.reduce((s, d) => s + d.maxPercentage * 0.25, 0);
      expect(result.combinedPercentage).toBeLessThan(sumLieve);
    });

    it('should populate maxPercentage in domain scores', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_cognitivo', severity: 'lieve' },
      ]);
      expect(result.domainScores[0].maxPercentage).toBe(70);
    });

    it('should populate domainName in domain scores', () => {
      const result = calculateBpca([
        { domainId: 'disturbo_cognitivo', severity: 'lieve' },
      ]);
      expect(result.domainScores[0].domainName).toBe('Deficit cognitivi');
    });
  });
});
