import { describe, it, expect } from 'vitest';
import {
  redactLowConfidenceWords,
  computeGarblePenalty,
  computePageQualityScore,
  estimateHeuristicConfidence,
  WORD_ILLEGIBLE_CONFIDENCE_THRESHOLD,
  PAGE_LOW_QUALITY_THRESHOLD,
} from './page-quality';

const CLEAN_ITALIAN =
  'Il paziente riferisce dolore alla spalla destra insorto dopo il trauma stradale. ' +
  'La radiografia evidenzia una frattura composta della clavicola. ' +
  'Si consiglia immobilizzazione con tutore per trenta giorni e controllo clinico.';

describe('page-quality — redactLowConfidenceWords', () => {
  it('should replace a low-confidence word at its exact startIndex with [ILLEGGIBILE]', () => {
    const md = 'Diagnosi: frxqzt della clavicola';
    const scores = [
      { text: 'Diagnosi:', confidence: 0.98, startIndex: 0 },
      { text: 'frxqzt', confidence: 0.2, startIndex: 10 },
      { text: 'della', confidence: 0.97, startIndex: 17 },
      { text: 'clavicola', confidence: 0.95, startIndex: 23 },
    ];
    const result = redactLowConfidenceWords(md, scores);
    expect(result.text).toBe('Diagnosi: [ILLEGGIBILE] della clavicola');
    expect(result.replacedCount).toBe(1);
  });

  it('should keep everything when all words are confident', () => {
    const md = 'Referto radiografico completo';
    const scores = [
      { text: 'Referto', confidence: 0.99, startIndex: 0 },
      { text: 'radiografico', confidence: 0.98, startIndex: 8 },
      { text: 'completo', confidence: 0.97, startIndex: 21 },
    ];
    const result = redactLowConfidenceWords(md, scores);
    expect(result.text).toBe(md);
    expect(result.replacedCount).toBe(0);
  });

  it('should collapse runs of adjacent redacted words into a single marker', () => {
    const md = 'Nota: xkq zzv wpt fine';
    const scores = [
      { text: 'Nota:', confidence: 0.99, startIndex: 0 },
      { text: 'xkq', confidence: 0.1, startIndex: 6 },
      { text: 'zzv', confidence: 0.15, startIndex: 10 },
      { text: 'wpt', confidence: 0.12, startIndex: 14 },
      { text: 'fine', confidence: 0.98, startIndex: 18 },
    ];
    const result = redactLowConfidenceWords(md, scores);
    expect(result.text).toBe('Nota: [ILLEGGIBILE] fine');
    expect(result.replacedCount).toBe(3);
  });

  it('should recover a slightly shifted startIndex by searching nearby', () => {
    const md = 'AB garble qui';
    // startIndex sbagliato di 2 (deriva da normalizzazioni del markdown)
    const scores = [{ text: 'garble', confidence: 0.2, startIndex: 5 }];
    const result = redactLowConfidenceWords(md, scores);
    expect(result.text).toBe('AB [ILLEGGIBILE] qui');
    expect(result.replacedCount).toBe(1);
  });

  it('should skip (not corrupt) a word it cannot locate in the text', () => {
    const md = 'testo integro senza la parola indicata';
    const scores = [{ text: 'INESISTENTE', confidence: 0.1, startIndex: 3 }];
    const result = redactLowConfidenceWords(md, scores);
    expect(result.text).toBe(md);
    expect(result.replacedCount).toBe(0);
  });

  it('should not redact punctuation-only or empty tokens', () => {
    const md = 'valore : 12 %';
    const scores = [
      { text: ':', confidence: 0.1, startIndex: 7 },
      { text: '', confidence: 0.1, startIndex: 0 },
    ];
    const result = redactLowConfidenceWords(md, scores);
    expect(result.text).toBe(md);
    expect(result.replacedCount).toBe(0);
  });

  it('should honor the threshold constant (word at threshold is kept)', () => {
    const md = 'parola dubbia';
    const scores = [
      { text: 'dubbia', confidence: WORD_ILLEGIBLE_CONFIDENCE_THRESHOLD, startIndex: 7 },
    ];
    const result = redactLowConfidenceWords(md, scores);
    expect(result.replacedCount).toBe(0);
  });
});

describe('page-quality — computeGarblePenalty', () => {
  it('should be ~0 for clean Italian clinical prose', () => {
    expect(computeGarblePenalty(CLEAN_ITALIAN)).toBeLessThanOrEqual(2);
  });

  it('should penalize consonant-garble words (no vowels)', () => {
    const garbled = 'trmbfl pzntq xkrtv dlgts frxqz mnstr pltvr zznqt wrtpx bcdfg';
    expect(computeGarblePenalty(garbled)).toBeGreaterThanOrEqual(15);
  });

  it('should penalize symbol-heavy noise', () => {
    const noisy = '£$%&/()=?^ §*@#| ~`¬{}[] ±≤≥ ///\\\\ <<>> ***';
    expect(computeGarblePenalty(noisy)).toBeGreaterThanOrEqual(15);
  });

  it('should not penalize numbers, dates and dosages', () => {
    const clinical = 'Il 12.03.2024 somministrati 10mg di ketorolac, PA 120/80 mmHg, SpO2 98%.';
    expect(computeGarblePenalty(clinical)).toBeLessThanOrEqual(5);
  });
});

describe('page-quality — computePageQualityScore', () => {
  it('should score clean text high without API confidence', () => {
    expect(computePageQualityScore(CLEAN_ITALIAN)).toBeGreaterThanOrEqual(85);
  });

  it('should return 0 for empty or near-empty text', () => {
    expect(computePageQualityScore('')).toBe(0);
    expect(computePageQualityScore('ab')).toBe(0);
  });

  it('should take the API confidence into account (conservative min)', () => {
    // pagina pulita ma il modello OCR è poco confidente → vince il segnale più basso
    expect(computePageQualityScore(CLEAN_ITALIAN, 0.55)).toBe(55);
    // API molto confidente su testo pulito → resta alto
    expect(computePageQualityScore(CLEAN_ITALIAN, 0.98)).toBeGreaterThanOrEqual(90);
  });

  it('should stay low for garbled text even with high API confidence', () => {
    const garbled = 'trmbfl pzntq xkrtv dlgts frxqz mnstr pltvr zznqt wrtpx bcdfg';
    expect(computePageQualityScore(garbled, 0.99)).toBeLessThan(PAGE_LOW_QUALITY_THRESHOLD + 20);
  });

  it('should penalize [ILLEGGIBILE] markers', () => {
    const withMarkers = `${CLEAN_ITALIAN} [ILLEGGIBILE] [ILLEGGIBILE] [ILLEGGIBILE] [ILLEGGIBILE]`;
    expect(computePageQualityScore(withMarkers)).toBeLessThan(computePageQualityScore(CLEAN_ITALIAN));
  });
});

describe('page-quality — estimateHeuristicConfidence (compat con la vecchia stima)', () => {
  it('should return 0 for empty text', () => {
    expect(estimateHeuristicConfidence('')).toBe(0);
  });

  it('should clamp to the 10..100 range for non-empty text', () => {
    const many = Array.from({ length: 30 }, () => '[ILLEGGIBILE]').join(' ');
    const v = estimateHeuristicConfidence(many);
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe('page-quality — redactLowConfidenceWords: confini di parola (review 2026-07-04)', () => {
  it('non deve corrompere una parola integra agganciando una SOTTOSTRINGA nel fallback', () => {
    // repro review: 'la' low-conf con startIndex driftato; 'la' esiste dentro 'clavicola'
    const md = 'frattura clavicola la cui rima';
    const result = redactLowConfidenceWords(md, [{ text: 'la', confidence: 0.3, startIndex: 16 }]);
    expect(result.text).toBe('frattura clavicola [ILLEGGIBILE] cui rima');
    expect(result.replacedCount).toBe(1);
  });

  it('non deve troncare "della" quando il token low-conf è "del"', () => {
    const md = 'referto della spalla';
    const result = redactLowConfidenceWords(md, [{ text: 'del', confidence: 0.2, startIndex: 8 }]);
    // 'del' non esiste come parola standalone → nessuna sostituzione
    expect(result.text).toBe(md);
    expect(result.replacedCount).toBe(0);
  });

  it('non deve sostituire a metà parola nemmeno quando startIndex API punta dentro una parola', () => {
    // API startIndex che (per drift) punta dentro 'clavicola' dove slice combacia
    const md = 'frattura clavicola composta';
    const result = redactLowConfidenceWords(md, [{ text: 'la', confidence: 0.3, startIndex: 12 }]);
    expect(result.text).toBe(md);
    expect(result.replacedCount).toBe(0);
  });
});
