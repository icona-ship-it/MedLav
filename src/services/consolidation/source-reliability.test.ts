import { describe, it, expect } from 'vitest';
import {
  getSourceReliabilityScore,
  getReliabilityLabel,
  SOURCE_RELIABILITY_SCORES,
} from './source-reliability';

describe('source-reliability', () => {
  describe('getSourceReliabilityScore', () => {
    it('should return 100 for cartella_clinica', () => {
      expect(getSourceReliabilityScore('cartella_clinica')).toBe(100);
    });

    it('should return 90 for esame_strumentale', () => {
      expect(getSourceReliabilityScore('esame_strumentale')).toBe(90);
    });

    it('should return 90 for esame_ematochimico', () => {
      expect(getSourceReliabilityScore('esame_ematochimico')).toBe(90);
    });

    it('should return 70 for referto_controllo', () => {
      expect(getSourceReliabilityScore('referto_controllo')).toBe(70);
    });

    it('should return 50 for altro', () => {
      expect(getSourceReliabilityScore('altro')).toBe(50);
    });

    it('should return default 50 for unknown source type', () => {
      expect(getSourceReliabilityScore('unknown_type')).toBe(50);
    });
  });

  describe('getReliabilityLabel', () => {
    it('should return "alta" for scores >= 80', () => {
      expect(getReliabilityLabel(100)).toBe('alta');
      expect(getReliabilityLabel(90)).toBe('alta');
      expect(getReliabilityLabel(80)).toBe('alta');
    });

    it('should return "media" for scores 60-79', () => {
      expect(getReliabilityLabel(70)).toBe('media');
      expect(getReliabilityLabel(60)).toBe('media');
    });

    it('should return "bassa" for scores < 60', () => {
      expect(getReliabilityLabel(50)).toBe('bassa');
      expect(getReliabilityLabel(30)).toBe('bassa');
      expect(getReliabilityLabel(0)).toBe('bassa');
    });
  });

  describe('SOURCE_RELIABILITY_SCORES', () => {
    it('should have all expected source types', () => {
      expect(Object.keys(SOURCE_RELIABILITY_SCORES)).toEqual(
        expect.arrayContaining([
          'cartella_clinica',
          'esame_strumentale',
          'esame_ematochimico',
          'referto_controllo',
          'altro',
        ]),
      );
    });

    it('should have scores in descending order of authority', () => {
      expect(SOURCE_RELIABILITY_SCORES.cartella_clinica).toBeGreaterThan(
        SOURCE_RELIABILITY_SCORES.esame_strumentale,
      );
      expect(SOURCE_RELIABILITY_SCORES.esame_strumentale).toBeGreaterThan(
        SOURCE_RELIABILITY_SCORES.referto_controllo,
      );
      expect(SOURCE_RELIABILITY_SCORES.referto_controllo).toBeGreaterThan(
        SOURCE_RELIABILITY_SCORES.altro,
      );
    });
  });
});
